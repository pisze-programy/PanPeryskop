// Event reachability from an origin airport: only events with a real flight
// option are worth showing ("disappointment hurts"). Geo-based (event→airport
// ≤200km, identical to the iOS rail radius) — never a fragile city-name join.
//
// Reachable = for some Ryanair-served airport within 200km of the event, the
// route flies on ≥1 day in the outbound window [D-3,D-1] AND ≥1 in the return
// window [D+1,D+3] (strictly around the event day — matches FlightScoring).
// On live failure it degrades to static route existence so filtering still works.
import { addDaysWarsaw, warsawDateOf } from '../seed/core/dates';
import { destinationsFrom } from './airports';
import { fetchRyanairAvailabilities } from './flightsApi';

export const NEARBY_KM = 200;
export const OUTBOUND_OFFSETS = [-3, -2, -1];
export const RETURN_OFFSETS = [1, 2, 3];

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
}

export interface ReachableEvent extends TravelEventRow {
  reachableAirports: string[];
}

export function windowHasFlights(flyingDays: Set<string>, eventDay: string): boolean {
  const anyDay = (offsets: number[]) => offsets.some((o) => flyingDays.has(addDaysWarsaw(eventDay, o)));
  return anyDay(OUTBOUND_OFFSETS) && anyDay(RETURN_OFFSETS);
}

/**
 * Filter events to those reachable from `origin` by air, tagging each with the
 * IATAs that make it reachable. `liveFailed` switches the whole pass to static
 * route existence so a Ryanair outage degrades consistently (grid → mock).
 */
export async function reachableEvents(
  origin: string,
  events: TravelEventRow[],
  db: D1Database,
): Promise<ReachableEvent[]> {
  const candidates = destinationsFrom(origin).filter((d) => d.providers.has('ryanair'));
  const availByIata = new Map<string, Set<string>>();
  let liveFailed = false;
  for (const d of candidates) {
    try {
      availByIata.set(d.iata, new Set(await fetchRyanairAvailabilities(db, origin, d.iata)));
    } catch {
      liveFailed = true;
      break;
    }
  }

  const out: ReachableEvent[] = [];
  for (const e of events) {
    const nearby = candidates.filter((d) => haversineKm(e.lat, e.lng, d.lat, d.lng) <= NEARBY_KM);
    if (nearby.length === 0) continue;
    const eventDay = warsawDateOf(e.start_ms);
    const reachable = liveFailed
      ? nearby.map((d) => d.iata)
      : nearby
          .filter((d) => windowHasFlights(availByIata.get(d.iata) ?? new Set(), eventDay))
          .map((d) => d.iata);
    if (reachable.length > 0) out.push({ ...e, reachableAirports: reachable });
  }
  return out;
}