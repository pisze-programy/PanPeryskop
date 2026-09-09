// Flight availability — live Ryanair (farefinder, NO auth/bot-wall) with a
// deterministic-mock fallback so the grid always renders. Wizzair stays mock
// (its timetable is Akamai KPSDK bot-walled — separate effort).
//
// Live sources (verified): 
//   /farfnd/3/oneWayFares/{o}/{d}/availabilities   → dates the route flies (schedule)
//   /farfnd/3/oneWayFares/{o}/{d}/cheapestPerDay   → per-day cheapest price+hour
// Both cached in D1 `flight_cache` (availabilities ~24h, prices ~12h).
import { addDaysWarsaw } from '../seed/core/dates';

export interface FlightCell {
  date: string;          // YYYY-MM-DD
  hour: string | null;   // HH:MM (destination-local) or null when no fare
  price: number | null;  // null = no fare that day (unavailable/sold out)
}

export interface FlightWindow {
  outbound: FlightCell[];
  returning: FlightCell[];
}

// ---- Deterministic mock (fallback + Wizzair) ----

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const NO_FARE_MASK = 3;            // (r & 3) === 0 → no fare that day
const BASE_PRICE_MIN = 20;
const BASE_PRICE_RANGE = 180;
const PRICE_SPIKE_RANGE = 25;
const HOUR_START = 8;
const HOUR_RANGE = 11;
const OUTBOUND_WINDOW: [number, number] = [-3, -1];
const RETURN_WINDOW: [number, number] = [1, 3];
const FALLBACK_PRICE_MIN = 50;
const FALLBACK_PRICE_RANGE = 60;

function seededPrice(seed: number, dayOffset: number): number | null {
  const r = (seed + dayOffset * 2654435761) >>> 0;
  if ((r & NO_FARE_MASK) === 0) return null;
  const base = BASE_PRICE_MIN + (r % BASE_PRICE_RANGE);
  const spike = (r >>> 8) % PRICE_SPIKE_RANGE;
  return Math.round((base + spike) * 100) / 100;
}

function mockHour(seed: number, dayOffset: number): string {
  const hour = HOUR_START + ((seed + dayOffset) % HOUR_RANGE);
  const minute = ((seed >>> 4) + dayOffset) % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dayCells(origin: string, dest: string, eventDay: string, range: [number, number]): FlightCell[] {
  const seed = hash(`${origin}|${dest}|${eventDay}`);
  const cells: FlightCell[] = [];
  for (let d = range[0]; d <= range[1]; d++) {
    const price = seededPrice(seed, d);
    cells.push({
      date: addDaysWarsaw(eventDay, d),
      hour: price === null ? null : mockHour(seed, d),
      price,
    });
  }
  if (cells.every((c) => c.price === null)) {
    const last = cells[cells.length - 1];
    last.price = FALLBACK_PRICE_MIN + (seed % FALLBACK_PRICE_RANGE);
    last.hour = mockHour(seed, range[1]);
  }
  return cells;
}

export function mockFlightWindow(origin: string, dest: string, eventDay: string): FlightWindow {
  return {
    outbound: dayCells(origin, dest, eventDay, OUTBOUND_WINDOW),
    returning: dayCells(origin, dest, eventDay, RETURN_WINDOW),
  };
}

// ---- Live Ryanair (farefinder) ----

const FARE_BASE = 'https://www.ryanair.com/api/farfnd/3/oneWayFares';
const FARE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

const AVAILABILITY_TTL_MS = 24 * 3_600_000;
const PRICE_TTL_MS = 12 * 3_600_000;

/** Raw farefinder GET. 404 → null (no such route); any other non-2xx throws. */
async function fetchFareJson(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: { 'User-Agent': FARE_UA, Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (res.status === 429 || res.status >= 500) {
    throw new Error(`Ryanair farefinder ${res.status}`);
  }
  if (!res.ok) return null;
  return await res.json();
}

async function cachedJson(db: D1Database, key: string, ttlMs: number, fetchFn: () => Promise<any | null>): Promise<any | null> {
  const row = await db
    .prepare('SELECT payload FROM flight_cache WHERE cache_key = ? AND expires_at > ?')
    .bind(key, Date.now())
    .first<{ payload: string }>();
  if (row) {
    try { return JSON.parse(row.payload); } catch { /* corrupt → refetch */ }
  }
  const value = await fetchFn();
  if (value === null) return null;
  await db
    .prepare('INSERT INTO flight_cache (cache_key, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at')
    .bind(key, JSON.stringify(value), Date.now() + ttlMs)
    .run()
    .catch(() => { /* cache write is best-effort */ });
  return value;
}

export interface CheapestDay {
  day: string;
  departureDate: string | null;
  price: number | null;
  unavailable: boolean;
  soldOut: boolean;
}

/** Dates the origin→dest route flies (whole booking horizon), cached. */
export async function fetchRyanairAvailabilities(db: D1Database, origin: string, dest: string): Promise<string[]> {
  const data = await cachedJson(db, `avail:${origin}:${dest}`, AVAILABILITY_TTL_MS, () =>
    fetchFareJson(`${FARE_BASE}/${origin}/${dest}/availabilities`));
  return Array.isArray(data) ? data.filter((d): d is string => typeof d === 'string') : [];
}

/** Per-day cheapest fare for (origin,dest) in `month` (YYYY-MM-01), cached. */
export async function fetchRyanairCheapestPerDay(db: D1Database, origin: string, dest: string, month: string): Promise<Map<string, CheapestDay>> {
  const data = await cachedJson(db, `price:${origin}:${dest}:${month}`, PRICE_TTL_MS, () =>
    fetchFareJson(`${FARE_BASE}/${origin}/${dest}/cheapestPerDay?market=pl-pl&currency=PLN&outboundMonthOfDate=${month}`));
  const fares = data?.outbound?.fares;
  if (!Array.isArray(fares)) return new Map();
  const out = new Map<string, CheapestDay>();
  for (const f of fares) {
    if (typeof f?.day !== 'string') continue;
    out.set(f.day, {
      day: f.day,
      departureDate: typeof f.departureDate === 'string' ? f.departureDate : null,
      price: typeof f.price?.value === 'number' ? f.price.value : null,
      unavailable: Boolean(f.unavailable),
      soldOut: Boolean(f.soldOut),
    });
  }
  return out;
}

function monthKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function localHour(iso: string | null): string | null {
  if (!iso) return null;
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : null;
}

function buildCell(day: string, prices: Map<string, CheapestDay>): FlightCell {
  const e = prices.get(day);
  const price = e && !e.unavailable && !e.soldOut ? e.price : null;
  return { date: day, hour: price === null ? null : localHour(e?.departureDate ?? null), price };
}

/** Pure mapping (unit-testable): slice the per-day price maps into the window. */
export function buildWindowFromCheapest(
  eventDay: string,
  outboundPrices: Map<string, CheapestDay>,
  returnPrices: Map<string, CheapestDay>,
): FlightWindow {
  const outDays = Array.from({ length: 3 }, (_, i) => addDaysWarsaw(eventDay, OUTBOUND_WINDOW[0] + i));
  const retDays = Array.from({ length: 3 }, (_, i) => addDaysWarsaw(eventDay, RETURN_WINDOW[0] + i));
  return {
    outbound: outDays.map((d) => buildCell(d, outboundPrices)),
    returning: retDays.map((d) => buildCell(d, returnPrices)),
  };
}

/** Live window: fetch per-day prices for the months the window spans, both directions. */
export async function liveRyanairWindow(db: D1Database, origin: string, dest: string, eventDay: string): Promise<FlightWindow> {
  const months = new Set<string>();
  for (let o = OUTBOUND_WINDOW[0]; o <= RETURN_WINDOW[1]; o++) {
    months.add(monthKey(addDaysWarsaw(eventDay, o)));
  }
  const outPrices = new Map<string, CheapestDay>();
  const retPrices = new Map<string, CheapestDay>();
  for (const m of months) {
    for (const [day, cell] of await fetchRyanairCheapestPerDay(db, origin, dest, m)) outPrices.set(day, cell);
    for (const [day, cell] of await fetchRyanairCheapestPerDay(db, dest, origin, m)) retPrices.set(day, cell);
  }
  return buildWindowFromCheapest(eventDay, outPrices, retPrices);
}

/** Ryanair window — live; falls back to the deterministic mock on any live failure. */
export async function fetchRyanairWindow(origin: string, dest: string, eventDay: string, db: D1Database): Promise<FlightWindow> {
  try {
    return await liveRyanairWindow(db, origin, dest, eventDay);
  } catch {
    return mockFlightWindow(origin, dest, eventDay);
  }
}

export async function fetchWizzairWindow(origin: string, dest: string, eventDay: string): Promise<FlightWindow> {
  return mockFlightWindow(origin, dest, eventDay);
}