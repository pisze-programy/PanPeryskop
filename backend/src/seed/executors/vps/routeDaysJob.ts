import { fetchRyanairAvailabilitiesDirect, fetchWizzairFlyingDaysInRangeDirect } from '../../../travel/flightsApi';
import { dateOfEpochDay } from '../../../travel/routeDays';
import { sleep } from './runtime';
import { snitchReport, type SnitchEnv } from '../../alert';

const DEFAULT_BATCH_LIMIT = 40;
const CONCURRENCY = 1;
const ROUTE_PACING_MS = 400;
const DEFAULT_MAX_BATCHES = 60;

interface Route {
  origin: string;
  dest: string;
  carrier: string;
}

interface Due {
  start: number;
  days: number;
  routes: Route[];
}

interface Entry extends Route {
  days: string[];
}

interface CarrierStats {
  requests: number;
  bytes: number;
}

interface FetchStats {
  requests: number;
  bytes: number;
  byCarrier: Record<string, CarrierStats>;
}

export interface JobOptions {
  batchLimit?: number;
  maxBatches?: number;
}

function key(route: Route): string {
  return `${route.origin}|${route.dest}|${route.carrier}`;
}

function auth(secret: string): Record<string, string> {
  return { Authorization: `Bearer ${secret}` };
}

/** Count provider bytes only. Our own API calls stay untouched, so the counter
 *  can never disturb the save/due requests. */
function installFetchCounter(stats: FetchStats): void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const carrier = url.includes('wizzair') ? 'wizzair' : url.includes('ryanair') ? 'ryanair' : null;
    if (carrier === null) return res;
    // Undici decompresses gzip and drops content-length, so the body is the only
    // size available in-process. It is the decompressed size (an upper bound).
    const bytes = (await res.clone().arrayBuffer()).byteLength;
    stats.requests += 1;
    stats.bytes += bytes;
    const bucket = (stats.byCarrier[carrier] ??= { requests: 0, bytes: 0 });
    bucket.requests += 1;
    bucket.bytes += bytes;
    return res;
  };
}

function reportStats(stats: FetchStats, saved: number, failed: number): void {
  const kb = (bytes: number) => (bytes / 1024).toFixed(1);
  console.log(`[route-days] TOTAL requests=${stats.requests} bytes=${stats.bytes} (${kb(stats.bytes)} KB) saved=${saved} failed=${failed}`);
  for (const [carrier, bucket] of Object.entries(stats.byCarrier)) {
    console.log(`[route-days]   ${carrier}: requests=${bucket.requests} (${kb(bucket.bytes)} KB)`);
  }
}

/** Fetch the due routes, fetch each schedule, and post the result. A route that
 *  fails stays due for the next run; the run never retries the same route. */
export async function runRouteDaysJob(base: string, secret: string, env: SnitchEnv, opts: JobOptions = {}): Promise<number> {
  const stats: FetchStats = { requests: 0, bytes: 0, byCarrier: {} };
  installFetchCounter(stats);

  const batchLimit = opts.batchLimit ?? DEFAULT_BATCH_LIMIT;
  const maxBatches = opts.maxBatches ?? DEFAULT_MAX_BATCHES;
  const attempted = new Set<string>();
  let saved = 0;
  let failed = 0;

  for (let batch = 1; batch <= maxBatches; batch++) {
    try {
      const due = await dueRoutes(base, secret, batchLimit);
      const fresh = due.routes.filter((route) => !attempted.has(key(route)));
      if (fresh.length === 0) break;
      for (const route of fresh) attempted.add(key(route));
      const result = await fetchBatch({ ...due, routes: fresh });
      await saveEntries(base, secret, result.entries);
      saved += result.entries.length;
      failed += result.failed.length;
      console.log(`[route-days] batch ${batch}: ${result.entries.length} saved of ${fresh.length} due`);
      if (result.failed.length > 0) await alertFailures(env, result.failed);
    } catch (error) {
      console.error(`[route-days] batch ${batch} aborted: ${(error as Error).message}`);
    }
    await sleep(1000);
  }

  reportStats(stats, saved, failed);
  return saved;
}

function transportError(what: string, error: unknown): Error {
  const cause = (error as { cause?: Error }).cause;
  return new Error(`${what}: ${(error as Error).message}${cause ? ` (cause: ${cause.message})` : ''}`);
}

async function apiFetch(what: string, url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw transportError(what, error);
  }
}

async function dueRoutes(base: string, secret: string, limit: number): Promise<Due> {
  const res = await apiFetch('due', `${base}/admin/travel/route-days/due?limit=${limit}`, { headers: auth(secret) });
  if (!res.ok) throw new Error(`due ${res.status}`);
  return (await res.json()) as Due;
}

async function saveEntries(base: string, secret: string, entries: Entry[]): Promise<void> {
  if (entries.length === 0) return;
  const res = await apiFetch('save', `${base}/admin/travel/route-days`, {
    method: 'POST',
    headers: { ...auth(secret), 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) throw new Error(`save ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function fetchBatch(due: Due): Promise<{ entries: Entry[]; failed: string[] }> {
  const entries: Entry[] = [];
  const failed: string[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < due.routes.length) {
      const route = due.routes[cursor++];
      const days = await fetchDays(due, route).catch((error: Error) => {
        console.error(`[route-days] ${key(route)} failed: ${error.message}`);
        failed.push(key(route));
        return null;
      });
      if (days) {
        console.log(`[route-days] ${key(route)} -> ${days.length} days`);
        entries.push({ ...route, days });
      }
      await sleep(ROUTE_PACING_MS);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, due.routes.length) }, worker));
  return { entries, failed };
}

async function fetchDays(due: Due, route: Route): Promise<string[]> {
  if (route.carrier === 'ryanair') return await fetchRyanairAvailabilitiesDirect(route.origin, route.dest);
  const from = dateOfEpochDay(due.start);
  const to = dateOfEpochDay(due.start + due.days - 1);
  return await fetchWizzairFlyingDaysInRangeDirect(route.origin, route.dest, from, to);
}

async function alertFailures(env: SnitchEnv, failed: string[]): Promise<void> {
  await snitchReport(env, 'panperyskop/travel/route-days', 'failed', {
    data: { failed: failed.length, sample: failed.slice(0, 5) },
    message: `Flight schedule fetch failed for ${failed.length} routes: ${failed.slice(0, 3).join(', ')}`,
    notify: 'on-error',
  });
}
