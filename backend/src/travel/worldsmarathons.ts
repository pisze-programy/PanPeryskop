// worldsmarathons.com provider — running races (tag `biegi`).
//
//   GET /api/search?fromDate=DD-MM-YYYY&toDate=DD-MM-YYYY&search=&searchType=0&all=true&currency=EUR
//   → { count, results: [...] }
//
// CF-protected on some egress networks: pass the browser clearance cookie(s) via
// the WM_COOKIE env var (e.g. "cf_clearance=…; wm_s=…") when running on the VPS.
import { GeoStore } from '../seed/core/geo';
import { warsawMidnightMs } from '../seed/core/dates';
import { TravelEvent } from './store';
import type { TravelSource } from './run';
import {
  WORLDSMARATHONS_PROVIDER, RUNS_TAG, WM_HOST, WM_TIMEOUT_MS, WM_RETRIES, WM_RETRY_DELAY_MS,
} from './constants';

const WM_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:155.0) Gecko/20100101 Firefox/155.0';

/** European ISO-3166 alpha-2 codes (the app is Europe-only). */
const EUROPEAN_ISO = new Set([
  'AL', 'AD', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FR', 'GB', 'GE', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD',
  'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM', 'TR',
  'UA', 'VA', 'XK',
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** '2026-10-04' → '04-10-2026' (the API's DD-MM-YYYY). */
function wmDate(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}-${m}-${y}`;
}

/** Extract "HH:mm" (local) from an ISO-ish string, else null. */
function localTime(iso: unknown): string | null {
  if (typeof iso !== 'string') return null;
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : null;
}

async function fetchSearch(from: string, to: string): Promise<unknown> {
  const url = `${WM_HOST}/api/search?fromDate=${from}&toDate=${to}&search=&searchType=0&all=true&currency=EUR`;
  const cookie = typeof process !== 'undefined' ? process.env?.WM_COOKIE : undefined;
  const headers: Record<string, string> = { 'User-Agent': WM_UA, Accept: 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  for (let attempt = 0; attempt <= WM_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(WM_TIMEOUT_MS) });
      if (res.ok) return await res.json();
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        if (attempt < WM_RETRIES) await sleep(WM_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw new Error(`worldsmarathons ${res.status}`);
    } catch (e) {
      if (attempt >= WM_RETRIES) throw e;
      await sleep(WM_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw new Error('worldsmarathons search failed');
}

interface WmEvent {
  id?: string;
  title?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  dateNextRace?: string;
  dateNextRaceLocal?: string;
  distance?: string;
  uniqueDistances?: string[];
  surface?: string;
  courseDifficulty?: string;
  minPriceFormatted?: string;
  website?: string;
  geoStartPoint?: { coordinates?: number[] };
}

/** Map one API row to a TravelEvent; null when it is non-European or un-geocoded. */
export function parseWmEvent(e: WmEvent, fallbackDay: string): TravelEvent | null {
  const coords = e?.geoStartPoint?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cc = String(e?.countryCode ?? '').toUpperCase();
  if (!EUROPEAN_ISO.has(cc)) return null;
  const externalId = String(e?.id ?? '').trim();
  const title = String(e?.title ?? '').trim();
  const city = String(e?.city ?? '').trim();
  if (!externalId || !title || !city) return null;

  const raceDate = String(e?.dateNextRace ?? e?.dateNextRaceLocal ?? '').slice(0, 10);
  const startMs = /^\d{4}-\d{2}-\d{2}$/.test(raceDate) ? warsawMidnightMs(raceDate) : warsawMidnightMs(fallbackDay);

  const meta = {
    distance: e?.distance ?? null,
    distances: e?.uniqueDistances ?? null,
    surface: e?.surface ?? null,
    difficulty: e?.courseDifficulty ?? null,
    price: e?.minPriceFormatted ?? null,
    time: localTime(e?.dateNextRace ?? e?.dateNextRaceLocal),
    website: e?.website ?? null,
    countryCode: cc,
  };

  return {
    provider: WORLDSMARATHONS_PROVIDER,
    externalId,
    title,
    lat,
    lng,
    city,
    country: String(e?.country ?? '').trim(),
    startMs,
    tag: RUNS_TAG,
    link: typeof e?.website === 'string' ? e.website : null,
    meta: JSON.stringify(meta),
  };
}

/** Fetch one day's running races (Europe only). */
export async function fetchWorldsmarathonsDay(day: string, _opts?: { store?: GeoStore }): Promise<TravelEvent[]> {
  const data = (await fetchSearch(wmDate(day), wmDate(day))) as { results?: WmEvent[] };
  const results = Array.isArray(data?.results) ? data.results : [];
  const out: TravelEvent[] = [];
  const seen = new Set<string>();
  for (const e of results) {
    const ev = parseWmEvent(e, day);
    if (!ev || seen.has(ev.externalId)) continue;
    seen.add(ev.externalId);
    out.push(ev);
  }
  return out;
}

/** worldsmarathons travel source — running races (tag `biegi`). */
export const WORLDSMARATHONS_SOURCE: TravelSource = {
  id: WORLDSMARATHONS_PROVIDER,
  fetchDay: (day, opts) => fetchWorldsmarathonsDay(day, opts),
};