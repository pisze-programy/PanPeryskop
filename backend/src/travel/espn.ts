import { CONFIG } from '../config/index';
import { GeoStore } from '../seed/core/geo';
import { keepEuropeanCityEvent } from './airports';
import { resolveTravelGeo } from './geo';
import { localDateTime } from './localTime';
import { TravelEvent } from './store';
import type { TravelSource } from './run';

interface EspnCompetition {
  venue?: { fullName?: string; address?: { city?: string; country?: string } } | null;
  competitors?: Array<{ team?: { displayName?: string; abbreviation?: string } }>;
}
interface EspnEvent {
  id: string;
  date?: string;
  links?: Array<{ rel?: string[]; href?: string }>;
  competitions?: EspnCompetition[];
}

export interface EspnFetchOptions {
  host?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchScoreboard(day: string, opts: EspnFetchOptions): Promise<EspnEvent[]> {
  const { host = CONFIG.travel.espn.host, timeoutMs = CONFIG.travel.espn.timeoutMs, retries = CONFIG.travel.espn.retries, retryDelayMs = CONFIG.travel.espn.retryDelayMs } = opts;
  // ESPN wants YYYYMMDD without separators (YYYY-MM-DD → 400).
  const compact = day.replace(/-/g, '');
  const path = `/apis/site/v2/sports/soccer/all/scoreboard?dates=${compact}&limit=${CONFIG.travel.espn.limit}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const url = `${attempt === 0 ? host : CONFIG.travel.espn.backupHost}${path}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const body = (await res.json()) as { events?: unknown };
      if (!Array.isArray(body.events)) return [];
      return body.events as EspnEvent[];
    }
    // 403/429 → the .web host; the rotating proxy IP rotates.
    console.warn(`[travel-espn] ${day} attempt ${attempt + 1}: HTTP ${res.status} (${attempt === 0 ? 'primary' : 'backup'} host)`);
    if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
  }
  throw new Error(`ESPN scoreboard ${day} failed after ${retries + 1} attempts`);
}

// Prefer a direct ticket link when ESPN provides one; otherwise the match page.
// Both are real destinations the app can open from the Wycieczki hero.
function eventLink(e: EspnEvent): string | null {
  for (const rel of ['tickets', 'summary'] as const) {
    const href = e.links?.find((l) => l.rel?.includes(rel))?.href;
    if (href) return href;
  }
  return null;
}

function eventTitle(e: EspnEvent): string {
  const names = (e.competitions?.[0]?.competitors ?? []).map((c) => c.team?.displayName);
  const known = names.filter((n): n is string => typeof n === 'string' && n.length > 0);
  return known.length > 0 ? known.join(' vs ') : `Match ${e.id}`;
}

interface EspnGeo {
  city: string;
  country: string;
}

function eventGeo(e: EspnEvent): EspnGeo | null {
  const venue = e.competitions?.[0]?.venue;
  const city = venue?.address?.city?.trim();
  const country = venue?.address?.country?.trim();
  if (!city || !country) return null;
  return { city, country };
}

function eventStartMs(e: EspnEvent): number | null {
  const ms = e.date ? Date.parse(e.date) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** Parse one fixture into a geo-less TravelEvent; null when not a European
 *  airport-city event or when the start time is missing. */
export function parseEspnEvent(e: EspnEvent): Omit<TravelEvent, 'lat' | 'lng'> | null {
  const geo = eventGeo(e);
  if (!geo || !keepEuropeanCityEvent(geo.country, geo.city)) return null;
  const startMs = eventStartMs(e);
  if (startMs === null) return null;
  // ESPN dates are UTC. Store the local date/hour of the venue so the app shows
  // the time where the match is played, not the app's own timezone. The team
  // abbreviations (BEL, FRA, …) come straight from ESPN — never generated.
  const local = localDateTime(startMs, geo.country, geo.city);
  const competitors = e.competitions?.[0]?.competitors ?? [];
  const meta = {
    ...(local ?? {}),
    homeCode: competitors[0]?.team?.abbreviation ?? null,
    awayCode: competitors[1]?.team?.abbreviation ?? null,
  };
  return {
    provider: CONFIG.travel.provider,
    externalId: e.id,
    title: eventTitle(e),
    city: geo.city,
    country: geo.country,
    startMs,
    tag: CONFIG.travel.tags.espn,
    link: eventLink(e),
    meta: JSON.stringify(meta),
  };
}

/** Fetch one day, keep European airport-city events, resolve geo. */
export async function fetchEspnDay(day: string, opts: EspnFetchOptions & { store?: GeoStore }): Promise<TravelEvent[]> {
  const events = await fetchScoreboard(day, opts);
  const out: TravelEvent[] = [];
  for (const raw of events) {
    const parsed = parseEspnEvent(raw);
    if (!parsed) continue;
    const geo = await resolveTravelGeo({
      name: raw.competitions?.[0]?.venue?.fullName ?? parsed.city,
      city: parsed.city,
      store: opts.store,
      provider: CONFIG.travel.provider,
    });
    if (!geo) continue;
    out.push({ ...parsed, lat: geo.lat, lng: geo.lng });
  }
  return out;
}
/** ESPN travel source — soccer matches (tag `pilka-nozna`). */
export const ESPN_SOURCE: TravelSource = {
  id: CONFIG.travel.provider,
  fetchDay: (day, opts) => fetchEspnDay(day, { store: opts.store }),
};
