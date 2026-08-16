// dzis.app provider — 'fetch' transport. Public JSON API aggregating many ticket
// platforms + local city portals (eventim, ebilet, kupbilecik, pik.*, biletomat).
// No Cloudflare → plain fetch works from the Worker edge.
// Coverage: 13 cities, ~500 events each; 86.6% have venue.geo, rest fall back to
// the city center bbox.
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from './types';
import { CITIES, cityById, cityBbox } from '../admin/cities';
import { warsawOffset } from './dates';
import { DZIS_API, DZIS_LIMIT, DZIS_WEB } from './constants';

const DZIS_CITIES = CITIES.map((c) => c.id);

interface DzisVenue {
  name?: string;
  citySlug?: string;
  slug?: string;
  geo?: { lat: number; lng: number } | null;
}
interface DzisEvent {
  id: string;
  slug?: string;
  title?: string;
  venue?: DzisVenue;
  startsAtLocal?: string; // "YYYY-MM-DD HH:MM:SS" (Europe/Warsaw)
  priceMinGrosze?: string;
  isFree?: boolean;
  coverImageUrl?: string;
  categorySlugs?: string[];
}

// Some images are placeholders/teasers (eventim blank.gif, 222x222) — skip them.
function isUsableImage(url: string | undefined): string | null {
  if (!url) return null;
  if (/blank\.gif|teaser|placeholder/i.test(url)) return null;
  return url;
}

export function parseLocalDateTime(s: string | undefined): number | null {
  // "YYYY-MM-DD HH:MM:SS" interpreted as Europe/Warsaw.
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  // Build a Date from local wall-clock using the current Warsaw offset.
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${warsawOffset()}`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

export async function fetchDzisApp(ctx: SeedContext): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  for (const cityId of DZIS_CITIES) {
    out.push(...await fetchDzisCity(ctx, cityId));
  }
  return out;
}

// Fetch one dzis.app city (a queue fetch scope). Dedup across cities lives in the
// caller: each city message writes candidates for its own city; cross-city dupes
// are collapsed by the batch dedupe phase.
export async function fetchDzisCity(ctx: SeedContext, cityId: string): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  const seenIds = new Set<string>();
  const city = cityById(cityId);
  if (!city) return out;
  const url = `${DZIS_API}?city=${cityId}&limit=${DZIS_LIMIT}`;
  let data: { events?: DzisEvent[] };
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`dzis.app ${cityId} -> ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.error(`seed dzisapp city=${cityId} failed: ${(e as Error).message}`);
    return out;
  }
  const bbox = cityBbox(cityId);
  for (const e of data.events || []) {
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    const startMs = parseLocalDateTime(e.startsAtLocal);
    if (!startMs || startMs < ctx.dayStart || startMs > ctx.dayEnd) continue;

    const img = isUsableImage(e.coverImageUrl);
    const geo = e.venue?.geo?.lat != null && e.venue?.geo?.lng != null
      ? { lat: e.venue.geo.lat, lng: e.venue.geo.lng }
      : null;
    // Fallback: city center (all dzis.app events belong to their city).
    const lat = geo ? geo.lat : bbox ? bbox.swLat + (bbox.neLat - bbox.swLat) / 2 : city.lat;
    const lng = geo ? geo.lng : bbox ? bbox.swLng + (bbox.neLng - bbox.swLng) / 2 : city.lng;

    out.push({
      source: ProviderId.DZISAPP,
      externalId: `dzisapp-${e.id}`,
      title: e.title || '',
      startMs,
      lat,
      lng,
      city: e.venue?.citySlug ? (cityById(e.venue.citySlug)?.name || city.name) : city.name,
      venue: e.venue?.name || '',
      address: '',
      link: `${DZIS_WEB}/${e.slug}`,
      mediaUrl: img || '',
      thumbUrl: img || null,
    });
  }
  return out;
}

export const dzisappProvider: SeedProvider = {
  id: ProviderId.DZISAPP,
  transport: 'fetch',
  enabled: true,
  fetchCandidates: fetchDzisApp,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: DZIS_CITIES,
  fetchScope: (ctx, scope) => fetchDzisCity(ctx, scope),
};
