import { CONFIG } from '../config/index';
// worldsmarathons.com provider — running races (tag `biegi`).
//
//   GET /api/search?fromDate=DD-MM-YYYY&toDate=DD-MM-YYYY&search=&searchType=0&all=true&currency=EUR
//   → { count, results: [...] }
//
// CF-protected on some egress networks: pass the browser clearance cookie(s) via
// the WM_COOKIE env var (e.g. "cf_clearance=…; wm_s=…") when running on the VPS.
import { GeoStore } from '../seed/core/geo';
import { warsawMidnightMs } from '../seed/core/dates';
import { resolveTravelGeo } from './geo';
import { TravelEvent } from './store';
import type { TravelSource } from './run';

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

/** "HH:mm" → milliseconds after midnight; 0 for null. */
function timeToMs(time: string | null): number {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return (h * 60 + m) * 60_000;
}

async function fetchSearch(from: string, to: string): Promise<unknown> {
  const url = `${CONFIG.travel.worldsmarathons.host}/api/search?fromDate=${from}&toDate=${to}&search=&searchType=0&all=true&currency=EUR`;
  const cookie = typeof process !== 'undefined' ? process.env?.WM_COOKIE : undefined;
  const headers: Record<string, string> = { 'User-Agent': CONFIG.travel.worldsmarathons.userAgent, Accept: 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  for (let attempt = 0; attempt <= CONFIG.travel.worldsmarathons.retries; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(CONFIG.travel.worldsmarathons.timeoutMs) });
      if (res.ok) return await res.json();
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        if (attempt < CONFIG.travel.worldsmarathons.retries) await sleep(CONFIG.travel.worldsmarathons.retryDelayMs * (attempt + 1));
        continue;
      }
      throw new Error(`worldsmarathons ${res.status}`);
    } catch (e) {
      if (attempt >= CONFIG.travel.worldsmarathons.retries) throw e;
      await sleep(CONFIG.travel.worldsmarathons.retryDelayMs * (attempt + 1));
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

interface WmCoords {
  lat: number;
  lng: number;
}

/** The provider's start point as [lng, lat], or null when absent or unusable. */
function coordsOf(e: WmEvent): WmCoords | null {
  const coords = e?.geoStartPoint?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Google AI Mode (`udm=50`) search for a race's tickets — the fallback when the
 *  provider ships no website. */
function googleSearchUrl(title: string, city: string, day: string): string {
  const year = day.slice(0, 4);
  return `https://www.google.com/search?${new URLSearchParams({ udm: '50', q: `${title} ${city} ${year} tickets` })}`;
}

/** Map one API row to a TravelEvent; null when it is non-European or unusable.
 *  `coords` overrides the provider start point (used after a city geocode). */
export function parseWmEvent(e: WmEvent, fallbackDay: string, coords?: WmCoords | null): TravelEvent | null {
  const point = coords ?? coordsOf(e);
  if (!point) return null;
  const cc = String(e?.countryCode ?? '').toUpperCase();
  if (!CONFIG.travel.europe.isoCodes.has(cc)) return null;
  const externalId = String(e?.id ?? '').trim();
  const title = String(e?.title ?? '').trim();
  const city = String(e?.city ?? '').trim();
  if (!externalId || !title || !city) return null;

  // dateNextRace is UTC; dateNextRaceLocal is the provider's wall clock. Prefer
  // the local value: the UTC date can land on the previous day (CEST 00:00 is
  // 22:00 UTC), and its hour is not the start time a traveller sees.
  const localIso = String(e?.dateNextRaceLocal ?? e?.dateNextRace ?? '');
  const raceDate = localIso.slice(0, 10);
  const raceTime = localTime(localIso);
  // "00:00" is the provider's date-only placeholder — not a real start time.
  const time = raceTime && raceTime !== '00:00' ? raceTime : null;
  // startMs is a LOCAL-DAY ANCHOR, not a UTC instant: the provider gives the race's
  // local wall clock, so we place it on that date in Europe/Warsaw. The app groups
  // by that day and shows meta.time. (ESPN events carry a real instant instead.)
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(raceDate);
  const startMs = validDate ? warsawMidnightMs(raceDate) + timeToMs(time) : warsawMidnightMs(fallbackDay);

  const meta = {
    distance: e?.distance ?? null,
    distances: e?.uniqueDistances ?? null,
    surface: e?.surface ?? null,
    difficulty: e?.courseDifficulty ?? null,
    price: e?.minPriceFormatted ?? null,
    time,
    website: e?.website ?? null,
    countryCode: cc,
  };

  const website = typeof e?.website === 'string' && e.website.length > 0 ? e.website : null;

  return {
    provider: CONFIG.travel.worldsmarathons.provider,
    externalId,
    title,
    lat: point.lat,
    lng: point.lng,
    city,
    country: String(e?.country ?? '').trim(),
    startMs,
    tag: CONFIG.travel.tags.runs,
    link: website ?? googleSearchUrl(title, city, validDate ? raceDate : fallbackDay),
    meta: JSON.stringify(meta),
  };
}

/** Fetch one day's running races (Europe only). Rows without a provider start
 *  point are geocoded by city, so a race is dropped only when that fails too. */
export async function fetchWorldsmarathonsDay(day: string, opts?: { store?: GeoStore }): Promise<TravelEvent[]> {
  const data = (await fetchSearch(wmDate(day), wmDate(day))) as { results?: WmEvent[] };
  const results = Array.isArray(data?.results) ? data.results : [];
  const out: TravelEvent[] = [];
  const seen = new Set<string>();
  for (const e of results) {
    const ev = await toTravelEvent(e, day, opts?.store);
    if (!ev || seen.has(ev.externalId)) continue;
    seen.add(ev.externalId);
    out.push(ev);
  }
  return out;
}

async function toTravelEvent(e: WmEvent, day: string, store?: GeoStore): Promise<TravelEvent | null> {
  const point = coordsOf(e);
  if (point) return parseWmEvent(e, day, point);
  const cc = String(e?.countryCode ?? '').toUpperCase();
  if (!CONFIG.travel.europe.isoCodes.has(cc)) return null;
  const city = String(e?.city ?? '').trim();
  if (!city) return null;
  const geo = await resolveTravelGeo({
    name: String(e?.title ?? city),
    city,
    store,
    provider: CONFIG.travel.worldsmarathons.provider,
  });
  if (!geo) return null;
  return parseWmEvent(e, day, { lat: geo.lat, lng: geo.lng });
}

/** worldsmarathons travel source — running races (tag `biegi`). */
export const WORLDSMARATHONS_SOURCE: TravelSource = {
  id: CONFIG.travel.worldsmarathons.provider,
  fetchDay: (day, opts) => fetchWorldsmarathonsDay(day, opts),
};
