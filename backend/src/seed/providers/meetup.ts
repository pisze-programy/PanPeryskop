// meetup.com provider — 'fetch' transport. Apollo GraphQL behind Cloudflare Bot
// Management (no auth/cookies needed from a residential IP). Runs from a
// residential egress (local Mac / VPS via iPhone exit node) — the same class as
// multikino/cinemacity which 403 datacenter IPs.
//
// Uses a custom full-text query on the `recommendedEvents` root (NOT the
// persisted-query hash, which omits venue coordinates). The query returns venue
// lat/lon directly plus radius + startDateRange, so one request per city covers
// every upcoming PHYSICAL event (cursor-paginated, page size ~200). Venues that
// report (0,0) go through the shared geo resolver (venues cache → Nominatim →
// city-center fallback). The caller filters candidates by the seed day window.
import { SeedProvider, SeedFetchCtx, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { CITIES, cityById } from '../../admin/cities';
import { toWarsawIso } from '../core/dates';
import { resolveGeo, GeoStore } from '../core/geo';
import { MEETUP_GQL, MEETUP_RADIUS, MEETUP_FIRST, PROVIDER_FETCH_TIMEOUT_MS } from '../core/constants';

const MEETUP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0',
  'Accept': '*/*',
  'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
  'content-type': 'application/json',
  'apollographql-client-name': 'nextjs-web',
  'Origin': 'https://www.meetup.com',
  'Referer': 'https://www.meetup.com/pl-PL/find/',
  'DNT': '1',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

const MEETUP_QUERY = `query recommendedEventsWithSeries($first: Int, $after: String, $lat: Float!, $lon: Float!, $radius: Float, $startDateRange: String, $eventType: EventType) {
  result: recommendedEvents(filter: { lat: $lat, lon: $lon, radius: $radius, startDateRange: $startDateRange, eventType: $eventType }, sort: { sortField: RELEVANCE }, first: $first, after: $after) {
    totalCount
    pageInfo { hasNextPage endCursor __typename }
    edges { node { id title dateTime eventType eventUrl venue { id name address city state country lat lon __typename } featuredEventPhoto { id baseUrl highResUrl __typename } group { id name urlname timezone __typename } __typename } }
  }
}`;

interface MeetupNode {
  id?: string;
  title?: string;
  dateTime?: string; // local wall-clock WITH offset ("2026-08-20T21:00:00+02:00")
  eventType?: string;
  eventUrl?: string;
  venue?: {
    id?: string; name?: string; address?: string; city?: string;
    state?: string; country?: string; lat?: number; lon?: number;
  };
  featuredEventPhoto?: { id?: string; baseUrl?: string; highResUrl?: string };
  group?: { id?: string; name?: string; urlname?: string; timezone?: string };
}

export interface MeetupFetchOptions {
  day: string;
  dayStart: number;
  dayEnd: number;
  /** Geo cache for (0,0) venues — omit for a pure listing (falls back to center). */
  geoStore?: GeoStore;
}

// "0,0" is Meetup's "no coordinates" sentinel.
function hasCoords(v: MeetupNode['venue']): boolean {
  return !!v && typeof v.lat === 'number' && typeof v.lon === 'number' && (v.lat !== 0 || v.lon !== 0);
}

export function parseMeetupNode(n: MeetupNode, cityName: string, fallback: { lat: number; lng: number }, opts: MeetupFetchOptions): Promise<SeedCandidate | null> {
  return (async () => {
    if (!n.id || !n.title) return null;
    if (n.eventType && n.eventType !== 'PHYSICAL') return null;
    const startMs = Date.parse(n.dateTime || '');
    if (Number.isNaN(startMs)) return null;

    const venue = n.venue;
    let lat: number | null = hasCoords(venue) ? venue!.lat! : null;
    let lng: number | null = hasCoords(venue) ? venue!.lon! : null;
    if (lat == null || lng == null) {
      const resolved = await resolveGeo({
        name: venue?.name || n.group?.name || '',
        address: venue?.address || '',
        city: venue?.city || cityName,
        store: opts.geoStore,
        fallback,
        provider: ProviderId.MEETUP,
      });
      if (resolved) { lat = resolved.lat; lng = resolved.lng; }
    }
    if (lat == null || lng == null) return null;

    return {
      source: ProviderId.MEETUP,
      externalId: `meetup-${n.id}`,
      title: n.title,
      startMs,
      lat,
      lng,
      city: venue?.city || cityName,
      venue: venue?.name || n.group?.name || '',
      address: venue?.address || '',
      link: n.eventUrl || `https://www.meetup.com/group/${n.group?.urlname || ''}/events/${n.id}/`,
      mediaUrl: n.featuredEventPhoto?.highResUrl || '',
      thumbUrl: null, // meetupstatic thumb_ variants are ~3 KB; seed-ingest builds the thumb
    };
  })();
}

async function fetchPage(opts: MeetupFetchOptions, lat: number, lon: number, after?: string): Promise<{ nodes: MeetupNode[]; hasNextPage: boolean; endCursor: string | null }> {
  const variables: Record<string, unknown> = {
    first: MEETUP_FIRST,
    lat,
    lon,
    radius: MEETUP_RADIUS,
    startDateRange: toWarsawIso(opts.dayStart), // events starting on/after today
    eventType: 'PHYSICAL',
  };
  if (after) variables.after = after;
  const res = await fetch(MEETUP_GQL, {
    method: 'POST',
    headers: MEETUP_HEADERS,
    body: JSON.stringify({ operationName: 'recommendedEventsWithSeries', variables, query: MEETUP_QUERY }),
    signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`meetup gql2 -> ${res.status}`);
  const body = (await res.json()) as {
    errors?: Array<{ message?: string }>;
    data?: { result?: { edges?: Array<{ node?: MeetupNode }>; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } };
  };
  if (body.errors?.length) throw new Error(`meetup gql2: ${body.errors[0]?.message || 'graphql error'}`);
  const result = body.data?.result;
  return {
    nodes: (result?.edges || []).map((e) => e.node || {}),
    hasNextPage: !!result?.pageInfo?.hasNextPage,
    endCursor: result?.pageInfo?.endCursor ?? null,
  };
}

// Fetch one city (a queue/local fetch scope). radius 40 km, PHYSICAL only,
// events starting today+. Returns all upcoming candidates — the caller filters
// by the seed day window. Pagination via the `after` cursor (page size 200).
export async function fetchMeetupCity(ctx: SeedFetchCtx, cityId: string, opts?: MeetupFetchOptions): Promise<SeedCandidate[]> {
  const city = cityById(cityId);
  if (!city) return [];
  const o: MeetupFetchOptions = opts ?? { day: ctx.day, dayStart: ctx.dayStart, dayEnd: ctx.dayEnd };
  const out: SeedCandidate[] = [];
  let after: string | null = null;
  for (let page = 0; page < 10; page++) {
    let nodes: MeetupNode[];
    let nextAfter: string | null;
    try {
      const r = await fetchPage(o, city.lat, city.lng, after ?? undefined);
      nodes = r.nodes;
      nextAfter = (!r.hasNextPage || !r.endCursor) ? null : r.endCursor;
    } catch (e) {
      // A failed FIRST page means the whole city failed — propagate so the scope
      // is retried instead of being marked done with empty results.
      if (page === 0) throw e;
      console.error(`meetup city=${cityId} page=${page} failed: ${(e as Error).message}`);
      break;
    }
    for (const n of nodes) {
      const c = await parseMeetupNode(n, city.name, { lat: city.lat, lng: city.lng }, o);
      if (c) out.push(c);
    }
    if (!nextAfter) break;
    after = nextAfter;
  }
  return out;
}

export async function fetchMeetup(ctx: SeedContext): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  for (const city of CITIES) {
    out.push(...await fetchMeetupCity(ctx, city.id));
  }
  return out;
}

export const meetupProvider: SeedProvider = {
  id: ProviderId.MEETUP,
  transport: 'fetch',
  // Runs on the VPS (registry: sites=['vps']): meetup.com sits behind Cloudflare
  // Bot Management and 403s the Worker's datacenter egress. The local runner
  // (src/seed/executors/vps/runners/meetup.ts) with residential egress is the
  // reliable source, uploaded via seed-ingest.
  fetchCandidates: fetchMeetup,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: CITIES.map((c) => c.id),
  fetchScope: (ctx, scope) => fetchMeetupCity(ctx, scope),
};
