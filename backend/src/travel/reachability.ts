import { CONFIG } from '../config/index';
// Event reachability from an origin airport: only events with a real flight
// option are worth showing ("disappointment hurts"). Geo-based (event→airport
// ≤200km, identical to the iOS rail radius) — never a fragile city-name join.
//
// Reachable = for some airport within 200km of the event that Ryanair OR Wizzair
// serves from the origin, the route flies on ≥1 day in the outbound window
// [D-3,D-1] AND ≥1 in the return window [D+1,D+3] (strictly around the event day
// — matches FlightScoring). The two carriers' days are pooled: one-way legs from
// different carriers still get the traveller there and back.
import { addDaysWarsaw, warsawDateOf } from '../seed/core/dates';
import { destinationsFrom, type Destination } from './airports';
import { fetchRyanairAvailabilities, fetchWizzairFlyingDays } from './flightsApi';
import { loadRouteDays } from './routeDays';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface TravelEventRow {
  provider: string;
  external_id: string;
  title: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  start_ms: number;
  tag: string;
  link: string | null;
  reachableAirports?: string[];
  /** Per destination: the carriers with a valid window around the event day. */
  reachableCarriers?: Record<string, string[]>;
}

export interface ReachableEvent extends TravelEventRow {
  reachableAirports: string[];
  reachableCarriers: Record<string, string[]>;
}

export interface ReachabilityResult {
  events: ReachableEvent[];
  okRoutes: number;
  failedRoutes: number;
}

export function windowHasFlights(flyingDays: Set<string>, eventDay: string): boolean {
  const anyDay = (offsets: number[]) => offsets.some((o) => flyingDays.has(addDaysWarsaw(eventDay, o)));
  return anyDay([...CONFIG.travel.reachability.outboundOffsets]) && anyDay([...CONFIG.travel.reachability.returnOffsets]);
}

/** The airports near the day's events — the only ones worth a live fare lookup. */
export function nearbyCandidates(candidates: Destination[], events: { lat: number; lng: number }[]): Destination[] {
  const byIata = new Map<string, Destination>();
  for (const e of events) {
    for (const d of candidates) {
      if (haversineKm(e.lat, e.lng, d.lat, d.lng) <= CONFIG.travel.reachability.nearbyKm) byIata.set(d.iata, d);
    }
  }
  return [...byIata.values()];
}

interface Route {
  dest: Destination;
  eventDay: string;
}

export function routeKey(route: Route): string {
  return `${route.dest.iata}|${route.eventDay}`;
}

interface RouteDays {
  ryanair: Set<string>;
  wizzair: Set<string>;
}

/** Carriers whose own flight days satisfy both the outbound and return window. */
export function reachableCarriers(days: RouteDays, eventDay: string): Array<'ryanair' | 'wizzair'> {
  const out: Array<'ryanair' | 'wizzair'> = [];
  if (windowHasFlights(days.ryanair, eventDay)) out.push('ryanair');
  if (windowHasFlights(days.wizzair, eventDay)) out.push('wizzair');
  return out;
}

async function routeFlyingDays(origin: string, route: Route, db: D1Database): Promise<RouteDays> {
  const ryanair = new Set<string>();
  const wizzair = new Set<string>();
  if (route.dest.providers.has('ryanair')) {
    for (const day of await fetchRyanairAvailabilities(db, origin, route.dest.iata)) ryanair.add(day);
  }
  if (route.dest.providers.has('wizzair')) {
    for (const day of await fetchWizzairFlyingDays(origin, route.dest.iata, route.eventDay, db)) wizzair.add(day);
  }
  return { ryanair, wizzair };
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CONFIG.travel.flights.routeRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < CONFIG.travel.flights.routeRetries - 1) await sleep(300 * (attempt + 1) + Math.random() * 200);
    }
  }
  throw lastError;
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runner = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
}

function routesFor(origin: string, events: TravelEventRow[]): { routes: Route[]; nearbyByEvent: Map<TravelEventRow, Destination[]> } {
  const candidates = destinationsFrom(origin).filter((d) => d.providers.has('ryanair') || d.providers.has('wizzair'));
  const nearbyByEvent = new Map<TravelEventRow, Destination[]>();
  const routes: Route[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const nearby = nearbyCandidates(candidates, [event]);
    if (nearby.length === 0) continue;
    nearbyByEvent.set(event, nearby);
    const eventDay = warsawDateOf(event.start_ms);
    for (const dest of nearby) {
      const route: Route = { dest, eventDay };
      const key = routeKey(route);
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push(route);
    }
  }
  return { routes, nearbyByEvent };
}

export async function reachableEvents(origin: string, events: TravelEventRow[], db: D1Database): Promise<ReachabilityResult> {
  const { nearbyByEvent } = routesFor(origin, events);
  const dests = new Set<string>();
  for (const nearby of nearbyByEvent.values()) for (const d of nearby) dests.add(d.iata);
  const table = await loadRouteDays(db, origin, [...dests]);

  const flyingByRoute = new Map<string, RouteDays | null>();
  // Routes the table does not know yet (a fresh table, or a new route). They get
  // one live lookup each. Once the drain has covered them this list is empty.
  const fallback: Route[] = [];
  const seenFallback = new Set<string>();

  for (const [event, nearby] of nearbyByEvent) {
    const eventDay = warsawDateOf(event.start_ms);
    for (const dest of nearby) {
      const entry = table.get(dest.iata);
      const missing = dest.providers.has('ryanair') && entry?.ryanair == null
        || dest.providers.has('wizzair') && entry?.wizzair == null;
      if (missing) {
        const route: Route = { dest, eventDay };
        const key = routeKey(route);
        if (!seenFallback.has(key)) { seenFallback.add(key); fallback.push(route); }
        continue;
      }
      flyingByRoute.set(routeKey({ dest, eventDay }), {
        ryanair: entry?.ryanair ?? new Set<string>(),
        wizzair: entry?.wizzair ?? new Set<string>(),
      });
    }
  }

  let okRoutes = flyingByRoute.size;
  let failedRoutes = 0;
  await mapPool(fallback, CONFIG.travel.flights.routeConcurrency, async (route) => {
    try {
      flyingByRoute.set(routeKey(route), await withRetry(() => routeFlyingDays(origin, route, db)));
      okRoutes++;
    } catch {
      flyingByRoute.set(routeKey(route), null);
      failedRoutes++;
    }
  });

  const out: ReachableEvent[] = [];
  for (const [event, nearby] of nearbyByEvent) {
    const eventDay = warsawDateOf(event.start_ms);
    const reachable: string[] = [];
    const carriers: Record<string, string[]> = {};
    for (const dest of nearby) {
      const days = flyingByRoute.get(routeKey({ dest, eventDay }));
      if (!days) continue;
      const serving = reachableCarriers(days, eventDay);
      if (serving.length === 0) continue;
      reachable.push(dest.iata);
      carriers[dest.iata] = serving;
    }
    if (reachable.length > 0) {
      out.push({ ...event, reachableAirports: reachable, reachableCarriers: carriers });
    }
  }
  return { events: out, okRoutes, failedRoutes };
}
