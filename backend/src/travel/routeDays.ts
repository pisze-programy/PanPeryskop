// Materialized flight schedule per route. A user request must never ask a
// provider "which days does this route fly": that answer is seasonal and changes
// rarely. A drain refreshes the table on a long TTL, and every read is a D1 row.
//
// The day list is a bitmask. Bit i is the day (horizon_start + i). This keeps a
// row at a few dozen bytes, so the whole table is tiny and a read is cheap.
import { destinationsFrom } from './airports';
import { ORIGIN_AIRPORTS } from './catalogue';
import { CONFIG } from '../config/index';
import { todayWarsaw } from '../seed/core/dates';

const DAY_MS = 86_400_000;

export interface RouteKey {
  origin: string;
  dest: string;
  carrier: 'ryanair' | 'wizzair';
}

/** A D1 handle or a D1 session — the due list must read the primary. */
export type DbReader = Pick<D1Database, 'prepare'>;

/** Epoch day (days since 1970-01-01) for a `YYYY-MM-DD` string. */
export function epochDay(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/** `YYYY-MM-DD` for an epoch day. */
export function dateOfEpochDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Bitmask of the days that fall inside [start, start+count). */
export function packMask(days: string[], start: number, count: number): string {
  const bytes = new Uint8Array(Math.ceil(count / 8));
  for (const day of days) {
    const index = epochDay(day) - start;
    if (index < 0 || index >= count) continue;
    bytes[index >> 3] |= 1 << (index & 7);
  }
  return btoa(String.fromCharCode(...bytes));
}

/** The days set inside [start, start+count). */
export function unpackMask(mask: string, start: number, count: number): Set<string> {
  const binary = atob(mask);
  const out = new Set<string>();
  for (let i = 0; i < count; i++) {
    const byte = binary.charCodeAt(i >> 3);
    if (byte & (1 << (i & 7))) out.add(dateOfEpochDay(start + i));
  }
  return out;
}

/** True when the route flies on `date`. */
export function maskHas(mask: string, start: number, count: number, date: string): boolean {
  const index = epochDay(date) - start;
  if (index < 0 || index >= count) return false;
  return (atob(mask).charCodeAt(index >> 3) & (1 << (index & 7))) !== 0;
}

/** Every route we care about: each origin airport to each served destination. */
export function buildRouteList(): RouteKey[] {
  const out: RouteKey[] = [];
  for (const origin of ORIGIN_AIRPORTS) {
    for (const dest of destinationsFrom(origin)) {
      for (const carrier of dest.providers) out.push({ origin, dest: dest.iata, carrier });
    }
  }
  return out;
}

export function routeId(route: RouteKey): string {
  return `${route.origin}|${route.dest}|${route.carrier}`;
}

// ---- Drain work-list (D1 only; the fetch runs on the VPS) ----

/** Missing or older than the TTL. No provider call. */
export async function buildDueRoutes(db: DbReader, limit: number): Promise<RouteKey[]> {
  const staleBefore = Date.now() - CONFIG.travel.routeDays.ttlMs;
  const { results } = await db
    .prepare('SELECT origin, dest, carrier, fetched_at FROM route_days')
    .all<{ origin: string; dest: string; carrier: string; fetched_at: number }>();
  const known = new Map((results ?? []).map((row) => [routeId(row as RouteKey), row.fetched_at]));
  return buildRouteList()
    .filter((route) => {
      const at = known.get(routeId(route));
      return at === undefined || at < staleBefore;
    })
    .slice(0, limit);
}

export function routeDaysHorizon(): { start: number; days: number } {
  return { start: epochDay(todayWarsaw()), days: CONFIG.travel.routeDays.horizonDays };
}

export interface RouteDaysSave {
  origin: string;
  dest: string;
  carrier: string;
  days: string[];
}

/** Zero days is real data: the route does not fly inside the horizon. */
export async function saveRouteDays(db: D1Database, entries: RouteDaysSave[]): Promise<number> {
  const { start, days } = routeDaysHorizon();
  const now = Date.now();
  const statements = entries.map((entry) =>
    db
      .prepare(
        `INSERT INTO route_days (origin, dest, carrier, horizon_start, horizon_days, mask, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(origin, dest, carrier) DO UPDATE SET
           horizon_start=excluded.horizon_start, horizon_days=excluded.horizon_days,
           mask=excluded.mask, fetched_at=excluded.fetched_at`,
      )
      .bind(entry.origin, entry.dest, entry.carrier, start, days, packMask(entry.days, start, days), now),
  );
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
  return entries.length;
}

// ---- Read path (no provider call) ----

export interface RouteDaysEntry {
  /** null = no row for this carrier (unknown); a set = the materialized days. */
  ryanair: Set<string> | null;
  wizzair: Set<string> | null;
}

/** The flying days of the destinations near the events, for one origin. */
export async function loadRouteDays(db: D1Database, origin: string, dests: string[]): Promise<Map<string, RouteDaysEntry>> {
  const out = new Map<string, RouteDaysEntry>();
  if (dests.length === 0) return out;
  for (let i = 0; i < dests.length; i += 50) {
    const chunk = dests.slice(i, i + 50);
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT dest, carrier, horizon_start, horizon_days, mask FROM route_days WHERE origin = ? AND dest IN (${placeholders})`)
      .bind(origin, ...chunk)
      .all<{ dest: string; carrier: string; horizon_start: number; horizon_days: number; mask: string }>();
    for (const row of results ?? []) {
      const entry = out.get(row.dest) ?? { ryanair: null, wizzair: null };
      const days = unpackMask(row.mask, row.horizon_start, row.horizon_days);
      if (row.carrier === 'ryanair') entry.ryanair = days;
      else entry.wizzair = days;
      out.set(row.dest, entry);
    }
  }
  return out;
}
