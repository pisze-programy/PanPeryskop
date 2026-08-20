// luma.com provider — 'fetch' transport. Private JSON API behind Cloudflare Bot
// Management (__cf_bm cookie; no auth). Runs from a residential egress (local
// Mac / VPS via iPhone exit node) — same class as multikino/cinemacity, which
// 403 datacenter IPs.
//
// Discovery: the bootstrap-page list has 87 launched city "places", only Warsaw
// among them. Warsaw → discover_place_api_id (1 request returns all upcoming
// events). Every other city → the map bbox (east/north/south/west), no category
// slug (all categories). One request per city returns ALL upcoming events
// (weeks ahead), cursor-paginated (page cap 50). No date-range filter exists —
// the caller filters candidates by the seed day window.
import { SeedProvider, SeedContext, SeedFetchCtx, SeedCandidate, ProviderId } from '../core/types';
import { CITIES, cityById } from '../../admin/cities';
import { resolveGeo, GeoStore } from '../core/geo';
import { LUMA_API, LUMA_EVENT_WEB, LUMA_LIMIT, LUMA_PLACE_WARSAW, LUMA_BBOX_RADIUS, PROVIDER_FETCH_TIMEOUT_MS } from '../core/constants';

const LUMA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0',
  'Accept': '*/*',
  'Accept-Language': 'en',
  'Origin': 'https://luma.com',
  'DNT': '1',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'x-luma-client-type': 'luma-web',
  'x-luma-client-version': '2026-08-18T02:59:33Z|14c72203eec8',
  'x-luma-web-url': 'https://luma.com/',
};

interface LumaEntry {
  api_id?: string;
  start_at?: string; // true UTC ("2026-08-18T14:00:00.000Z")
  event?: {
    api_id?: string;
    name?: string;
    start_at?: string;
    end_at?: string;
    timezone?: string;
    url?: string; // short slug → https://lu.ma/<slug>
    location_type?: string; // 'offline' | 'online' | 'hybrid'
    coordinate?: { latitude?: number; longitude?: number };
    geo_address_info?: {
      city?: string;
      address?: string;
      full_address?: string;
      short_address?: string;
      sublocality?: string;
      mode?: string; // 'shown' | 'obfuscated' (organizer hid the address)
      place_coordinate?: { latitude?: number; longitude?: number };
    };
    cover_url?: string;
    social_image_url?: string;
  };
}

interface LumaPage {
  entries?: LumaEntry[];
  has_more?: boolean;
  next_cursor?: string | null;
}

function isUsableImage(url: string | undefined | null): string {
  return url && /^https:\/\//.test(url) ? url : '';
}

// "Adgar Wave, Wincentego Rzymowskiego 53, Warszawa" → venue "Adgar Wave",
// street "Wincentego Rzymowskiego 53". Falls back to the sublocality (e.g.
// "Poznań Old Town") when the organizer hid the address (geo.mode 'obfuscated').
function venueFromShort(geo: NonNullable<LumaEntry['event']>['geo_address_info'] | undefined): { venue: string; address: string } {
  const short = geo?.short_address;
  const address = geo?.address || '';
  if (!short) {
    const venue = geo?.sublocality || geo?.full_address || '';
    return { venue, address: '' };
  }
  const parts = short.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const street = address || parts[parts.length - 2] || '';
    return { venue: parts[0], address: street };
  }
  return { venue: parts[0] || address, address };
}

export interface LumaFetchOptions {
  day: string;
  dayStart: number;
  dayEnd: number;
  /** Geo cache for missing-coordinate events — same path as every provider. */
  geoStore?: GeoStore;
}

export function parseLumaEntry(e: LumaEntry, cityName: string, fallback: { lat: number; lng: number }, opts: LumaFetchOptions): Promise<SeedCandidate | null> {
  return (async () => {
    const ev = e.event;
    if (!ev || !ev.api_id || !ev.name) return null;
    // Physical-only: keep offline (+ hybrid, which has an in-person component);
    // drop pure online events — the app maps physical meetups.
    if (ev.location_type === 'online') return null;

    const startMs = Date.parse(e.start_at || ev.start_at || '');
    if (Number.isNaN(startMs)) return null;

    const geo = ev.geo_address_info;
    const coord = (ev.coordinate && typeof ev.coordinate.latitude === 'number')
      ? ev.coordinate
      : (geo?.place_coordinate && typeof geo.place_coordinate.latitude === 'number' ? geo.place_coordinate : null);
    let lat: number | null = coord && typeof coord.latitude === 'number' ? coord.latitude : null;
    let lng: number | null = coord && typeof coord.longitude === 'number' ? coord.longitude : null;
    if (lat == null || lng == null) {
      // Same geo path as every provider: cache → Nominatim → city-center fallback.
      const resolved = await resolveGeo({
        name: geo?.short_address || geo?.address || '',
        address: geo?.address || '',
        city: geo?.city || cityName,
        store: opts.geoStore,
        fallback,
        provider: ProviderId.LUMA,
      });
      if (resolved) { lat = resolved.lat; lng = resolved.lng; }
    }
    if (lat == null || lng == null) return null;

    const { venue, address } = venueFromShort(geo);

    return {
      source: ProviderId.LUMA,
      externalId: `luma-${ev.api_id}`,
      title: ev.name,
      startMs,
      lat,
      lng,
      city: geo?.city || cityName,
      venue,
      address,
      link: `${LUMA_EVENT_WEB}/${ev.url || ev.api_id}`,
      mediaUrl: isUsableImage(ev.cover_url) || isUsableImage(ev.social_image_url),
      thumbUrl: null, // lumacdn has no resize; the VPS/seed-ingest path builds the thumb
      tags: ['meetup'],
    };
  })();
}

async function fetchPage(url: string): Promise<LumaPage> {
  const res = await fetch(url, { headers: LUMA_HEADERS, signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`luma get-paginated-events -> ${res.status}`);
  return (await res.json()) as LumaPage;
}

// Fetch one city (a queue/local fetch scope). Warsaw uses its place id; the rest
// use a bbox around the city center (±LUMA_BBOX_RADIUS degrees). Returns ALL
// upcoming offline events — the caller filters by the seed day window.
export async function fetchLumaCity(ctx: SeedFetchCtx, cityId: string, opts?: LumaFetchOptions): Promise<SeedCandidate[]> {
  const city = cityById(cityId);
  if (!city) return [];
  const o: LumaFetchOptions = opts ?? { day: ctx.day, dayStart: ctx.dayStart, dayEnd: ctx.dayEnd };
  const base = cityId === 'warszawa'
    ? `discover_place_api_id=${LUMA_PLACE_WARSAW}`
    : `east=${(city.lng + LUMA_BBOX_RADIUS).toFixed(5)}&north=${(city.lat + LUMA_BBOX_RADIUS).toFixed(5)}&south=${(city.lat - LUMA_BBOX_RADIUS).toFixed(5)}&west=${(city.lng - LUMA_BBOX_RADIUS).toFixed(5)}`;

  const out: SeedCandidate[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = `${LUMA_API}/get-paginated-events?${base}&pagination_limit=${LUMA_LIMIT}${cursor ? `&pagination_cursor=${encodeURIComponent(cursor)}` : ''}`;
    let data: LumaPage;
    try { data = await fetchPage(url); }
    catch (e) {
      // A failed FIRST page means the whole city failed — propagate so the scope
      // is retried instead of being marked done with empty results. Only later
      // pages degrade gracefully (partial data is kept).
      if (page === 0) throw e;
      console.error(`luma city=${cityId} page=${page} failed: ${(e as Error).message}`);
      break;
    }
    for (const e of data.entries || []) {
      const c = await parseLumaEntry(e, city.name, { lat: city.lat, lng: city.lng }, o);
      if (c) out.push(c);
    }
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return out;
}

export async function fetchLuma(ctx: SeedContext): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  for (const city of CITIES) {
    out.push(...await fetchLumaCity(ctx, city.id));
  }
  return out;
}

export const lumaProvider: SeedProvider = {
  id: ProviderId.LUMA,
  transport: 'fetch',
  // Runs on the VPS (registry: sites=['vps']): api.luma.com sits behind Cloudflare
  // Bot Management and 403s the Worker's datacenter egress. The local runner
  // (src/seed/executors/vps/runners/luma.ts) with residential egress is the
  // reliable source, uploaded via seed-ingest.
  fetchCandidates: fetchLuma,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: CITIES.map((c) => c.id),
  fetchScope: (ctx, scope) => fetchLumaCity(ctx, scope),
};
