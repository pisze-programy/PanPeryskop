// Ticketmaster provider — 'fetch' transport (the open Discovery API v2). Poland
// only for the pilot. One API page = ONE performance (event id + startDateTime);
// the same event-day-venue at different hours collapses into ONE post with
// showtimes[] via aggregateDayCandidates (identical to ebilet/kupbilecik/eventim).
//
// WINDOW scope, not day: the API returns the whole date range in one query, so a
// day unit would re-fetch the same payload N times AND fire N requests at once
// (the seed queue runs 10 units concurrently). One window unit = one fetch =
// one request sequence, which is what keeps us inside Ticketmaster's 2 req/s.
// Pages are sequential with a 600 ms gap — never a burst. The sink drops any
// candidate outside the unit window, exactly like luma/meetup.
//
// The API carries venue coordinates for ~every row, so geo is NOT deferred —
// the candidate arrives with a real pin. The API carries NO price in Europe
// (probed 2026-09-23: 0 of 120 rows across PL/DE/GB/ES/NL/IE), so `price` stays
// absent and the cheapest known price from another source survives dedupe.
//
// `locale=pl-pl` is REQUIRED: it is what makes the API return the Polish event
// URL (…-bilety/…) instead of the English one (…-tickets/…?language=en-us).
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { aggregateDayCandidates } from '../core/aggregate';
import { warsawMidnightMs, addDaysWarsaw } from '../core/dates';
import { CONFIG } from '../../config/index';

const HOST = 'https://app.ticketmaster.com/discovery/v2';
const COUNTRY = 'PL';
const LOCALE = 'pl-pl';
const PAGE_SIZE = 200;
/** size * page < 1000 is the deep-paging cap: 5 pages of 200 is the maximum. */
const MAX_PAGES = 5;
const TIMEOUT_MS = 15_000;
/** Minimum gap between two requests — Ticketmaster allows 2 req/s. */
const PACE_MS = 600;
const DAY_MS = 86_400_000;

/** Discovery API event, trimmed to the fields this provider reads. */
interface TmEvent {
  id?: string;
  name?: string;
  url?: string;
  images?: { ratio?: string; url?: string; width?: number; height?: number }[];
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string; timeTBA?: boolean; dateTBA?: boolean };
    status?: { code?: string };
  };
  classifications?: { segment?: { name?: string }; genre?: { name?: string }; subGenre?: { name?: string } }[];
  _embedded?: {
    venues?: {
      name?: string;
      city?: { name?: string };
      address?: { line1?: string };
      postalCode?: string;
      location?: { latitude?: string; longitude?: string };
    }[];
  };
}

let lastCallMs = 0;

/** Serialize every request through one pace gate. A module-level clock is enough
 *  here: the provider owns a single window unit, so all its calls share the
 *  isolate that runs it. */
async function paced(): Promise<void> {
  const wait = PACE_MS - (Date.now() - lastCallMs);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallMs = Date.now();
}

/**
 * Classification → canonical tag. Segment first, genre refines it. Unknown
 * segment → null (no tag), never a guess.
 *
 * The API answers in the locale that was asked for, so `locale=pl-pl` returns
 * the Polish segment names ("Muzyka", "Sztuka i teatr", "Sporty", "Różne").
 * Both languages are matched; an English-only test tagged every Polish event
 * as "inne".
 */
export function tmTag(
  segment: string | null,
  genre: string | null,
  subGenre: string | null
): string | null {
  const s = (segment || '').trim().toLowerCase();
  const g = `${genre || ''} ${subGenre || ''}`.trim().toLowerCase();
  if (!s) return null;
  if (s === 'music' || s === 'muzyka') return 'muzyka';
  if (s === 'film') return 'filmy';
  if (s === 'sports' || s === 'sporty') return 'inne';
  if (s === 'family' || s === 'rodzina') return 'inne';
  if (s.includes('arts') || s.includes('theatre') || s.includes('theater') || s.includes('teatr')) {
    return /(comedy|humor|kabaret|stand)/.test(g) ? 'komedia' : 'teatr';
  }
  return 'inne';
}

/** The largest 16:9 image, else the largest image, else null. */
export function tmImage(images: TmEvent['images']): string | null {
  const list = (images || []).filter((i) => i.url);
  if (list.length === 0) return null;
  const wide = list.filter((i) => i.ratio === '16_9');
  const pool = wide.length > 0 ? wide : list;
  return pool.reduce((best, i) => ((i.width ?? 0) > (best.width ?? 0) ? i : best)).url ?? null;
}

/** Start time in ms, or null when the date is TBA or malformed. `dateTime` is the
 *  UTC instant and wins. The `localDate`/`localTime` fallback is WARSAW local time
 *  and is anchored on the Warsaw midnight — never parsed as UTC. */
export function tmStartMs(e: TmEvent): number | null {
  const start = e.dates?.start;
  if (!start || start.dateTBA) return null;
  if (start.dateTime) {
    const ms = Date.parse(start.dateTime);
    if (Number.isFinite(ms)) return ms;
  }
  if (start.localDate && start.localTime) {
    const [h, m] = start.localTime.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      return warsawMidnightMs(start.localDate) + (h * 60 + m) * 60_000;
    }
  }
  return null;
}

/** Build the candidate for ONE performance. Returns [] when the row cannot form
 *  a post (no id/title/start). The day window is the sink's job, not ours. */
export function parseTmEvent(e: TmEvent): SeedCandidate[] {
  const id = (e.id || '').trim();
  const title = (e.name || '').trim();
  if (!id || !title) return [];
  const startMs = tmStartMs(e);
  if (startMs === null) return [];

  const venue = e._embedded?.venues?.[0];
  const lat = Number(venue?.location?.latitude);
  const lng = Number(venue?.location?.longitude);
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
  const c = (e.classifications || [])[0];
  const tag = tmTag(c?.segment?.name ?? null, c?.genre?.name ?? null, c?.subGenre?.name ?? null);
  const status = (e.dates?.status?.code || '').trim().toLowerCase();
  const link = (e.url || '').trim() || `https://www.ticketmaster.pl/event/${id}`;
  const image = tmImage(e.images);

  return [{
    source: ProviderId.TICKETMASTER,
    externalId: `ticketmaster-${id}`,
    title,
    startMs,
    lat: hasGeo ? lat : null,
    lng: hasGeo ? lng : null,
    city: (venue?.city?.name || '').trim(),
    venue: (venue?.name || '').trim(),
    address: [venue?.address?.line1, venue?.postalCode].filter(Boolean).join(', ') || undefined,
    link,
    mediaUrl: image || '',
    thumbUrl: image,
    isSoldOut: status === 'offsale' || status === 'cancelled',
    times: [e.dates?.start?.localTime?.slice(0, 5) || ''],
    tags: tag ? [tag] : undefined,
  }];
}

/** The API rejects milliseconds (DIS1015): it wants exactly YYYY-MM-DDTHH:MM:SSZ. */
export function tmIso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** One page of the Discovery API over the whole seed window. */
async function fetchPage(ctx: SeedContext, page: number): Promise<{ events: TmEvent[]; pages: number }> {
  const key = ctx.env.TICKETMASTER_CONSUMER_KEY;
  if (!key) throw new Error('TICKETMASTER_CONSUMER_KEY is not set');
  const windowDays = CONFIG.seed.window.refillAhead + 1;
  const url = new URL(`${HOST}/events.json`);
  url.searchParams.set('apikey', key);
  url.searchParams.set('locale', LOCALE);
  url.searchParams.set('countryCode', COUNTRY);
  url.searchParams.set('size', String(PAGE_SIZE));
  url.searchParams.set('page', String(page));
  url.searchParams.set('sort', 'date,asc');
  // A ±1 day margin: the API filters on the UTC instant, while the unit window is
  // a set of Warsaw calendar days. Out-of-window rows are dropped by the sink.
  url.searchParams.set('startDateTime', tmIso(ctx.dayStart - DAY_MS));
  url.searchParams.set('endDateTime', tmIso(warsawMidnightMs(addDaysWarsaw(ctx.day, windowDays)) + DAY_MS));

  await paced();
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ticketmaster ${res.status} on page ${page}`);
  const body = (await res.json()) as { _embedded?: { events?: TmEvent[] }; page?: { totalPages?: number } };
  return { events: body._embedded?.events || [], pages: body.page?.totalPages || 1 };
}

/** Candidates for the whole seed window, paginated and aggregated. */
export async function fetchTicketmasterWindow(ctx: SeedContext): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { events, pages } = await fetchPage(ctx, page);
    for (const e of events) out.push(...parseTmEvent(e));
    if (events.length === 0 || page + 1 >= pages) break;
  }
  return aggregateDayCandidates(out);
}

export const ticketmasterProvider: SeedProvider = {
  id: ProviderId.TICKETMASTER,
  transport: 'fetch',
  fetchCandidates: fetchTicketmasterWindow,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: ['pl'],
  fetchScope: (ctx) => fetchTicketmasterWindow(ctx),
  resolveLink: (_ctx, cand) => Promise.resolve(cand.link),
};
