// Resident Advisor provider — 'fetch' transport (the open ra.co GraphQL API).
// Poland only for the pilot, the same shape as the Ticketmaster source.
//
// WINDOW scope: one query per city area returns the whole 90-day range, so a
// day unit would fire one request per day at once. The seed queue runs 10 units
// concurrently, and RA has no published rate limit, so the requests are also
// paced in one sequence.
//
// The event carries venue coordinates, so geo is NOT deferred. It also carries
// the LINEUP, the GENRES and the CLUB — the three fields the club night card
// shows. The flyer is theirs, so it is not used: the card composes its own
// background. Facts only.
//
// RA knows six Polish city areas. Katowice, Szczecin, Lublin, Bydgoszcz and
// Sopot have no area, so their nights are not reachable here.
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { aggregateDayCandidates } from '../core/aggregate';
import { warsawMidnightMs, addDaysWarsaw } from '../core/dates';
import { CONFIG } from '../../config/index';

const HOST = 'https://ra.co/graphql';
/** RA city area ids. The country area (69) is not used: it has no city. */
const AREAS: Record<string, number> = {
  Warsaw: 454,
  Krakow: 455,
  Poznan: 666,
  Gdansk: 667,
  Wroclaw: 668,
};
const TIMEOUT_MS = 20_000;
const PACE_MS = 700;
/** The API caps one page at 100. */
const PAGE_SIZE = 100;
/** A safety stop. The 90-day window is about two pages. */
const MAX_PAGES = 6;

const QUERY = `query Events($areas: [Int!], $from: DateTime!, $to: DateTime!, $page: Int!) {
  eventListings(
    filters: { areas: { any: $areas }, listingDate: { gte: $from, lte: $to } }
    pageSize: ${PAGE_SIZE}
    page: $page
    sort: { listingDate: { order: ASCENDING } }
  ) {
    totalResults
    data {
      event {
        id
        title
        date
        startTime
        isTicketed
        cost
        minimumAge
        contentUrl
        venue {
          name
          capacity
          area { name }
          location { latitude longitude }
        }
        artists { name }
        genres { name }
      }
    }
  }
}`;

interface RaArtist { name?: string }
interface RaGenre { name?: string }
interface RaEvent {
  id?: string;
  title?: string;
  date?: string;
  startTime?: string;
  isTicketed?: boolean;
  cost?: string;
  minimumAge?: number;
  contentUrl?: string;
  venue?: {
    name?: string;
    capacity?: string;
    area?: { name?: string };
    location?: { latitude?: number; longitude?: number };
  };
  artists?: RaArtist[];
  genres?: RaGenre[];
}

let lastCallMs = 0;

async function paced(): Promise<void> {
  const wait = PACE_MS - (Date.now() - lastCallMs);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallMs = Date.now();
}

/** The normalised title for the card. Rules only, never a guess:
 *  the promoter prefix goes when the title repeats it, and "FREE ENTRY" goes
 *  when the night is not ticketed. RA cuts a long title, so "FREE ENTR" is the
 *  same words. */
export function normalizeTitle(raw: string, isTicketed: boolean): string {
  let title = (raw || '').replace(/\s+/g, ' ').trim();
  if (!isTicketed) {
    title = title.replace(/\s*[-–—|]?\s*free\s*entr(y|y\b)?\s*$/i, '').trim();
  }
  return title.replace(/\s*[-–—|]\s*$/, '').trim() || (raw || '').trim();
}

/** The price in whole zloty, or null. `cost` is free text: "0", "10", "Free",
 *  "10-20". A value of zero or a text that does not read as a number gives
 *  null, and the card shows no price at all. */
export function parseCost(cost: string | undefined | null): number | null {
  const raw = (cost || '').trim();
  if (!raw) return null;
  const first = raw.split('-')[0].replace(/[^0-9.]/g, '');
  if (!first) return null;
  const value = Number(first);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/** The lineup, or an empty list. The order is the provider's order. */
export function lineupOf(artists: RaArtist[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const artist of artists ?? []) {
    const name = (artist?.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** The genre words, capped at two, in the provider's order. */
export function genresOf(genres: RaGenre[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const genre of genres ?? []) {
    const name = (genre?.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length === 2) break;
  }
  return out;
}

/** Build the candidate for one night. Returns [] when the row cannot form a
 *  post: no id, no title, no start, or no position. */
export function parseRaEvent(e: RaEvent): SeedCandidate[] {
  const id = (e.id || '').trim();
  const rawTitle = (e.title || '').trim();
  if (!id || !rawTitle) return [];
  const startMs = e.startTime ? Date.parse(e.startTime) : NaN;
  if (!Number.isFinite(startMs)) return [];

  const venue = e.venue;
  const lat = Number(venue?.location?.latitude);
  const lng = Number(venue?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return [];

  const isTicketed = e.isTicketed === true;
  const lineup = lineupOf(e.artists);
  const genres = genresOf(e.genres);
  const price = parseCost(e.cost);
  const age = Number(e.minimumAge);
  const meta = {
    date: e.date?.slice(0, 10) ?? null,
    lineup,
    genres,
    venue: (venue?.name || '').trim(),
    clubCity: (venue?.area?.name || '').trim(),
    capacity: Number(venue?.capacity) || null,
    price,
    minimumAge: Number.isFinite(age) && age > 0 ? age : null,
    isTicketed,
  };

  return [{
    source: ProviderId.RESIDENTADVISOR,
    externalId: `ra-${id}`,
    title: normalizeTitle(rawTitle, isTicketed),
    startMs,
    lat,
    lng,
    city: (venue?.area?.name || '').trim(),
    venue: (venue?.name || '').trim(),
    link: e.contentUrl ? `https://ra.co${e.contentUrl}` : `https://ra.co/events/${id}`,
    mediaUrl: '',
    thumbUrl: null,
    price,
    times: e.startTime ? [e.startTime.slice(11, 16)] : [],
    tags: ['muzyka'],
    meta: JSON.stringify(meta),
  }];
}

async function fetchAreas(from: string, to: string): Promise<RaEvent[]> {
  const out: RaEvent[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = JSON.stringify({
      query: QUERY,
      variables: { areas: Object.values(AREAS), from, to, page },
    });
    await paced();
    const res = await fetch(HOST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PanPeryskop/1.0 (event seed; contact: dev@panperyskop.app)',
        Referer: 'https://ra.co/events/pl',
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`residentadvisor ${res.status}`);
    const json = (await res.json()) as {
      data?: { eventListings?: { data?: { event?: RaEvent }[] } };
      errors?: unknown;
    };
    if (json.errors) throw new Error(`residentadvisor graphql error`);
    const rows = json.data?.eventListings?.data ?? [];
    for (const row of rows) if (row.event) out.push(row.event);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** Candidates for the whole seed window. */
export async function fetchResidentadvisorWindow(ctx: SeedContext): Promise<SeedCandidate[]> {
  const windowDays = CONFIG.seed.window.refillAhead + 1;
  const from = `${ctx.day}T00:00:00.000Z`;
  const to = `${addDaysWarsaw(ctx.day, windowDays)}T00:00:00.000Z`;
  const events = await fetchAreas(from, to);
  const out: SeedCandidate[] = [];
  for (const e of events) out.push(...parseRaEvent(e));
  return aggregateDayCandidates(out);
}

export const residentadvisorProvider: SeedProvider = {
  id: ProviderId.RESIDENTADVISOR,
  transport: 'fetch',
  fetchCandidates: fetchResidentadvisorWindow,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: ['pl'],
  fetchScope: (ctx) => fetchResidentadvisorWindow(ctx),
  resolveLink: (_ctx, cand) => Promise.resolve(cand.link),
};
