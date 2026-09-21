import { CONFIG } from '../config/index';
// Flight availability — live Ryanair (farefinder) and live Wizzair (timetable),
// both without auth or bot walls, both cached in D1 `flight_cache`. A live
// failure throws: the app shows "try again" instead of invented fares.
//
// Ryanair (verified):
//   /farfnd/3/oneWayFares/{o}/{d}/availabilities   → dates the route flies (schedule)
//   /farfnd/3/oneWayFares/{o}/{d}/cheapestPerDay   → per-day cheapest price+hour
// Wizzair (verified):
//   POST {api}/search/timetable with both directions, 7 days each, price+hours.
//   The API path is versioned and the version lives in the site HTML (24 h cache).
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

// ---- Live Ryanair (farefinder) ----



/** Raw farefinder GET. 404 → null (no such route); any other non-2xx throws. */
async function fetchFareJson(url: string, timeoutMs: number = CONFIG.travel.flights.timeoutMs): Promise<any | null> {
  const res = await fetchWithRetry(() => fetch(url, {
    headers: { 'User-Agent': CONFIG.travel.flights.userAgent, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  }));
  if (res.status === 404) return null;
  if (res.status === 429 || res.status >= 500) {
    throw new Error(`Ryanair farefinder ${res.status}`);
  }
  if (!res.ok) return null;
  return await res.json();
}

const TRANSIENT_RETRY_DELAY_MS = 400;
const RATE_LIMIT_RETRY_DELAY_MS = 2_000;
const REQUEST_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function transientStatus(res: Response): boolean {
  return res.status === 429 || res.status >= 500;
}

async function fetchWithRetry(makeRequest: () => Promise<Response>, isTransient = transientStatus): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 1; ; attempt++) {
    try {
      last = await makeRequest();
      if (!isTransient(last) || attempt >= REQUEST_ATTEMPTS) return last;
    } catch (error) {
      last = null;
      if (attempt >= REQUEST_ATTEMPTS) throw error;
    }
    const backoff = last !== null && last.status >= 500 ? RATE_LIMIT_RETRY_DELAY_MS : TRANSIENT_RETRY_DELAY_MS;
    await sleep(backoff * attempt);
  }
}

export async function readFlightCache(db: D1Database, key: string): Promise<any | null> {
  const row = await db
    .prepare('SELECT payload FROM flight_cache WHERE cache_key = ? AND expires_at > ?')
    .bind(key, Date.now())
    .first<{ payload: string }>();
  if (!row) return null;
  const parsed = safeParse(row.payload);
  return parsed === undefined ? null : parsed;
}

export async function writeFlightCache(db: D1Database, key: string, value: unknown, ttlMs: number): Promise<void> {
  await writeCache(db, key, value, ttlMs);
}

/** Drop expired cache rows. The table has an expires_at index but no other job. */
export async function pruneFlightCache(db: D1Database): Promise<number> {
  const result = await db.prepare('DELETE FROM flight_cache WHERE expires_at < ?').bind(Date.now()).run();
  return Number(result.meta?.changes ?? 0);
}

async function cachedJson(db: D1Database, key: string, ttlMs: number, fetchFn: () => Promise<any | null>, failureTtlMs = 0): Promise<any | null> {
  const row = await db
    .prepare('SELECT payload FROM flight_cache WHERE cache_key = ? AND expires_at > ?')
    .bind(key, Date.now())
    .first<{ payload: string }>();
  if (row) {
    const parsed = safeParse(row.payload);
    // A failure marker only records that the last attempt failed. It must never
    // short-circuit a later request: upstreams recover in seconds, and a cached
    // marker would otherwise return 502 for its whole TTL.
    if (parsed !== undefined && !isFailedMarker(parsed)) return parsed;
  }
  try {
    const value = await fetchFn();
    if (value === null) return null;
    await writeCache(db, key, value, ttlMs);
    return value;
  } catch (error) {
    if (failureTtlMs > 0) await writeCache(db, key, { __failed: true }, failureTtlMs);
    throw error;
  }
}

function safeParse(payload: string): any {
  try { return JSON.parse(payload); } catch { return undefined; }
}

function isFailedMarker(value: any): boolean {
  return Boolean(value) && typeof value === 'object' && value.__failed === true;
}

async function writeCache(db: D1Database, key: string, value: unknown, ttlMs: number): Promise<void> {
  await db
    .prepare('INSERT INTO flight_cache (cache_key, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at')
    .bind(key, JSON.stringify(value), Date.now() + ttlMs)
    .run()
    .catch(() => { /* cache write is best-effort */ });
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
  const cfg = CONFIG.travel.flights;
  const data = await cachedJson(db, `avail:${origin}:${dest}`, cfg.availabilityTtlMs, () =>
    fetchFareJson(`${cfg.fareBase}/${origin}/${dest}/availabilities`), cfg.failureTtlMs);
  return Array.isArray(data) ? data.filter((d): d is string => typeof d === 'string') : [];
}

/** Per-day cheapest fare for (origin,dest) in `month` (YYYY-MM-01), cached. */
export async function fetchRyanairCheapestPerDay(db: D1Database, origin: string, dest: string, month: string): Promise<Map<string, CheapestDay>> {
  const data = await cachedJson(db, `price:${origin}:${dest}:${month}`, CONFIG.travel.flights.priceTtlMs, () =>
    fetchFareJson(`${CONFIG.travel.flights.fareBase}/${origin}/${dest}/cheapestPerDay?market=pl-pl&currency=PLN&outboundMonthOfDate=${month}`));
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
  const windows = CONFIG.travel.flights.windows;
  const outDays = Array.from({ length: windows.outbound[1] - windows.outbound[0] + 1 }, (_, i) => addDaysWarsaw(eventDay, windows.outbound[0] + i));
  const retDays = Array.from({ length: windows.return[1] - windows.return[0] + 1 }, (_, i) => addDaysWarsaw(eventDay, windows.return[0] + i));
  return {
    outbound: outDays.map((d) => buildCell(d, outboundPrices)),
    returning: retDays.map((d) => buildCell(d, returnPrices)),
  };
}

/** Live window: fetch per-day prices for the months the window spans, both directions. */
export async function liveRyanairWindow(db: D1Database, origin: string, dest: string, eventDay: string): Promise<FlightWindow> {
  const months = new Set<string>();
  for (let o = CONFIG.travel.flights.windows.outbound[0]; o <= CONFIG.travel.flights.windows.return[1]; o++) {
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

export async function fetchRyanairWindow(origin: string, dest: string, eventDay: string, db: D1Database): Promise<FlightWindow> {
  return liveRyanairWindow(db, origin, dest, eventDay);
}

/** Every day of `month` (YYYY-MM-01), both directions. Two provider calls. */
export async function fetchRyanairMonth(origin: string, dest: string, month: string, db: D1Database): Promise<FlightWindow> {
  const outPrices = await fetchRyanairCheapestPerDay(db, origin, dest, month);
  const retPrices = await fetchRyanairCheapestPerDay(db, dest, origin, month);
  return buildMonthWindow(month, (day) => buildCell(day, outPrices), (day) => buildCell(day, retPrices));
}

// ---- Live Wizzair (timetable) ----

const WIZZAIR_VERSION_KEY = 'wizz:version';

interface WizzairFlight {
  price?: { amount?: number } | null;
  priceType?: string;
  departureDate?: string;
  departureDates?: string[] | null;
}

interface WizzairTimetable {
  outboundFlights?: WizzairFlight[];
  returnFlights?: WizzairFlight[];
  noMarket?: boolean;
}

export function parseWizzairVersion(html: string): string | null {
  const match = new RegExp(CONFIG.travel.flights.wizzair.versionPattern).exec(html);
  return match ? match[1] : null;
}

async function dropCachedJson(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM flight_cache WHERE cache_key = ?').bind(key).run().catch(() => { /* best effort */ });
}

async function wizzairApiBase(db: D1Database): Promise<string> {
  const cfg = CONFIG.travel.flights.wizzair;
  const version = await cachedJson(db, WIZZAIR_VERSION_KEY, cfg.versionTtlMs, async () => {
    const res = await fetch(cfg.pageUrl, {
      headers: { 'User-Agent': CONFIG.travel.flights.userAgent, Accept: 'text/html' },
      signal: AbortSignal.timeout(CONFIG.travel.flights.timeoutMs * 4),
    });
    if (!res.ok) throw new Error(`Wizzair site ${res.status}`);
    return parseWizzairVersion(await res.text());
  });
  return `${cfg.apiHost}/${typeof version === 'string' ? version : cfg.apiVersion}/Api`;
}

async function postWizzairTimetable(apiBase: string, origin: string, dest: string, fromDay: string, toDay: string, timeoutMs: number = CONFIG.travel.flights.timeoutMs): Promise<Response> {
  const body = {
    flightList: [
      { departureStation: origin, arrivalStation: dest, from: fromDay, to: toDay },
      { departureStation: dest, arrivalStation: origin, from: fromDay, to: toDay },
    ],
    priceType: 'regular',
    adultCount: 1,
    childCount: 0,
    infantCount: 0,
  };
  return await fetchWithRetry(() => fetch(`${apiBase}/search/timetable`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': CONFIG.travel.flights.userAgent,
      Origin: 'https://www.wizzair.com',
      Referer: 'https://www.wizzair.com/',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }));
}

async function fetchWizzairTimetable(db: D1Database, origin: string, dest: string, fromDay: string, toDay: string): Promise<WizzairTimetable> {
  const attempt = async (): Promise<Response> => await postWizzairTimetable(await wizzairApiBase(db), origin, dest, fromDay, toDay);
  let res = await attempt();
  if (res.status === 404 || res.status >= 500) {
    await dropCachedJson(db, WIZZAIR_VERSION_KEY);
    res = await attempt();
  }
  if (res.status === 400 || res.status === 404) return { noMarket: true };
  if (!res.ok) throw new Error(`Wizzair timetable ${res.status}`);
  return (await res.json()) as WizzairTimetable;
}

function wizzairCell(flight: WizzairFlight | undefined, day: string): FlightCell {
  if (!flight || flight.priceType !== 'price') return { date: day, hour: null, price: null };
  const amount = flight.price?.amount;
  if (typeof amount !== 'number' || amount <= 0) return { date: day, hour: null, price: null };
  const first = flight.departureDates?.[0];
  const hour = typeof first === 'string' ? (/T(\d{2}:\d{2})/.exec(first)?.[1] ?? null) : null;
  return { date: day, hour, price: amount };
}

function wizzairDays(flights: WizzairFlight[], range: [number, number], eventDay: string): FlightCell[] {
  const byDay = new Map<string, WizzairFlight>();
  for (const f of flights) {
    if (typeof f.departureDate === 'string') byDay.set(f.departureDate.slice(0, 10), f);
  }
  const days: string[] = [];
  for (let o = range[0]; o <= range[1]; o++) days.push(addDaysWarsaw(eventDay, o));
  return days.map((day) => wizzairCell(byDay.get(day), day));
}

/** `YYYY-MM-DD` for every day of the month `YYYY-MM-01`. */
export function monthDays(month: string): string[] {
  const [year, mon] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, '0')}`);
}

/** Pure mapping: one cell per day of the month, for the calendar view. */
export function buildMonthWindow(
  month: string,
  outboundCell: (day: string) => FlightCell,
  returningCell: (day: string) => FlightCell,
): FlightWindow {
  const days = monthDays(month);
  return { outbound: days.map(outboundCell), returning: days.map(returningCell) };
}

export function buildWizzairWindow(data: WizzairTimetable, eventDay: string): FlightWindow {
  if (data.noMarket) return { outbound: [], returning: [] };
  return {
    outbound: wizzairDays(data.outboundFlights ?? [], CONFIG.travel.flights.windows.outbound, eventDay),
    returning: wizzairDays(data.returnFlights ?? [], CONFIG.travel.flights.windows.return, eventDay),
  };
}

export function monthsInWindow(eventDay: string): string[] {
  const windows = CONFIG.travel.flights.windows;
  const first = addDaysWarsaw(eventDay, windows.outbound[0]);
  const last = addDaysWarsaw(eventDay, windows.return[1]);
  return [...new Set([monthKey(first), monthKey(last)])];
}

/** First day of every month in [fromDay, toDay]. */
export function monthsBetween(fromDay: string, toDay: string): string[] {
  const last = monthKey(toDay);
  const out: string[] = [];
  for (let cursor = monthKey(fromDay); cursor <= last; cursor = monthKey(addDaysWarsaw(cursor, 32))) {
    out.push(cursor);
  }
  return out;
}

export function mergeWizzairMonths(months: WizzairTimetable[]): WizzairTimetable {
  return {
    outboundFlights: months.flatMap((m) => m.outboundFlights ?? []),
    returnFlights: months.flatMap((m) => m.returnFlights ?? []),
    noMarket: months.length > 0 && months.every((m) => m.noMarket),
  };
}

async function wizzairMonth(db: D1Database, origin: string, dest: string, month: string): Promise<WizzairTimetable> {
  const cfg = CONFIG.travel.flights;
  const key = `wizz:${origin}:${dest}:${month}`;
  const cached = await cachedJson(db, key, cfg.wizzair.windowTtlMs, async () =>
    await fetchWizzairTimetable(db, origin, dest, month, addDaysWarsaw(month, 30)), cfg.failureTtlMs);
  return (cached ?? {}) as WizzairTimetable;
}

async function cachedWizzairTimetable(db: D1Database, origin: string, dest: string, eventDay: string): Promise<WizzairTimetable> {
  const months = monthsInWindow(eventDay);
  const loaded: WizzairTimetable[] = [];
  for (const month of months) loaded.push(await wizzairMonth(db, origin, dest, month));
  return mergeWizzairMonths(loaded);
}

export async function fetchWizzairWindow(origin: string, dest: string, eventDay: string, db: D1Database): Promise<FlightWindow> {
  return buildWizzairWindow(await cachedWizzairTimetable(db, origin, dest, eventDay), eventDay);
}

/** Every day of `month` (YYYY-MM-01), both directions. One provider call. */
export async function fetchWizzairMonth(origin: string, dest: string, month: string, db: D1Database): Promise<FlightWindow> {
  const data = await wizzairMonth(db, origin, dest, month);
  if (data.noMarket) return { outbound: [], returning: [] };
  const byDay = (flights: WizzairFlight[]) => {
    const map = new Map<string, WizzairFlight>();
    for (const f of flights) {
      if (typeof f.departureDate === 'string') map.set(f.departureDate.slice(0, 10), f);
    }
    return map;
  };
  const out = byDay(data.outboundFlights ?? []);
  const ret = byDay(data.returnFlights ?? []);
  return buildMonthWindow(month, (day) => wizzairCell(out.get(day), day), (day) => wizzairCell(ret.get(day), day));
}

export async function fetchWizzairFlyingDays(origin: string, dest: string, eventDay: string, db: D1Database): Promise<string[]> {
  const data = await cachedWizzairTimetable(db, origin, dest, eventDay);
  if (data.noMarket) return [];
  const days = new Set<string>();
  for (const flight of [...(data.outboundFlights ?? []), ...(data.returnFlights ?? [])]) {
    if (typeof flight.departureDate === 'string') days.add(flight.departureDate.slice(0, 10));
  }
  return [...days];
}

/** Flying days for a route in [fromDay, toDay], both directions pooled. Uses the
 *  shared per-month cache, so the batch and the price path do not double-fetch. */
export async function fetchWizzairFlyingDaysInRange(
  db: D1Database, origin: string, dest: string, fromDay: string, toDay: string,
): Promise<string[]> {
  const days = new Set<string>();
  for (const month of monthsBetween(fromDay, toDay)) {
    const data = await wizzairMonth(db, origin, dest, month);
    for (const flight of [...(data.outboundFlights ?? []), ...(data.returnFlights ?? [])]) {
      if (typeof flight.departureDate === 'string') days.add(flight.departureDate.slice(0, 10));
    }
  }
  return [...days].filter((day) => day >= fromDay && day <= toDay);
}

// ---- VPS drain: provider-only fetch, no D1 and no cache ----

const DIRECT_FETCH_TIMEOUT_MS = 20_000;

// The version is a constant: the site page is 1.9 MB, so a per-run fetch costs
// far more than it saves. A stale value shows up as a failed run and alerts.
function wizzairApiBaseDirect(): string {
  const cfg = CONFIG.travel.flights.wizzair;
  return `${cfg.apiHost}/${cfg.apiVersion}/Api`;
}

export async function fetchRyanairAvailabilitiesDirect(origin: string, dest: string): Promise<string[]> {
  const data = await fetchFareJson(`${CONFIG.travel.flights.fareBase}/${origin}/${dest}/availabilities`, DIRECT_FETCH_TIMEOUT_MS);
  return Array.isArray(data) ? data.filter((d): d is string => typeof d === 'string') : [];
}

/** A 400 is often transient, so a market rejection needs every attempt to fail. */
async function fetchWizzairTimetableDirect(origin: string, dest: string, fromDay: string, toDay: string): Promise<WizzairTimetable> {
  const send = async () => postWizzairTimetable(wizzairApiBaseDirect(), origin, dest, fromDay, toDay, DIRECT_FETCH_TIMEOUT_MS);
  const res = await fetchWithRetry(send, (r) => r.status === 400 || r.status === 404 || r.status >= 500);
  if (res.status === 400 || res.status === 404) return { noMarket: true };
  if (!res.ok) throw new Error(`Wizzair timetable ${res.status}`);
  return (await res.json()) as WizzairTimetable;
}

export async function fetchWizzairFlyingDaysInRangeDirect(origin: string, dest: string, fromDay: string, toDay: string): Promise<string[]> {
  const days = new Set<string>();
  for (const month of monthsBetween(fromDay, toDay)) {
    const data = await fetchWizzairTimetableDirect(origin, dest, month, addDaysWarsaw(month, 30));
    for (const flight of [...(data.outboundFlights ?? []), ...(data.returnFlights ?? [])]) {
      if (typeof flight.departureDate === 'string') days.add(flight.departureDate.slice(0, 10));
    }
  }
  return [...days].filter((day) => day >= fromDay && day <= toDay);
}