// dzis.app provider — 'fetch' transport. Public JSON API aggregating many ticket
// platforms + local city portals (eventim, ebilet, kupbilecik, pik.*, biletomat).
// No Cloudflare → plain fetch works from the Worker edge.
// Coverage: 13 cities, ~500 events each; 86.6% have venue.geo, rest fall back to
// the city center bbox.
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { CITIES, cityById, cityBbox } from '../../admin/cities';
import { warsawOffset } from '../core/dates';
import { resolveGeo } from '../core/geo';
import { DZIS_API, DZIS_LIMIT, DZIS_WEB } from '../core/constants';
import { normalizeTags } from '../core/tags';

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

// Direct source URL from the event page's JSON-LD offers[].url — but only when it
// points OUTSIDE dzis.app (free events self-link with price 0).
export function externalOfferUrl(html: string): string | null {
  const re = /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]);
      const offers = Array.isArray(data.offers) ? data.offers : data.offers ? [data.offers] : [];
      for (const o of offers) {
        const u = typeof o?.url === 'string' ? o.url : '';
        if (!u) continue;
        try { if (new URL(u).hostname !== 'dzis.app') return u; } catch { /* malformed */ }
      }
    } catch { /* malformed JSON-LD */ }
  }
  return null;
}

// The click-tracking redirect to the primary vendor/source (hero CTA).
export function primaryOutHref(html: string): string | null {
  const m = /href="(\/out\/[a-f0-9-]{36}\?pos=primary[^"]*)"/i.exec(html);
  return m ? m[1].replace(/&amp;/g, '&') : null;
}

// Resolve a candidate's link to the DIRECT source. Priority:
//   1. JSON-LD offers[].url when external (paid events → kupbilecik etc.)
//   2. /out/<uuid>?pos=primary followed to its final URL (free events → source)
//   3. the dzis.app event page itself (plural URL)
// Best-effort — on any failure the dzis.app page is returned.
export async function resolveDzisLink(cand: SeedCandidate): Promise<string> {
  const slug = (cand.link || '').split('/').filter(Boolean).pop() || '';
  const page = slug ? `https://dzis.app/wydarzenia/${slug}` : (cand.link || '');
  if (!slug) return page;
  try {
    const res = await fetch(page, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return page;
    const html = await res.text();
    const ext = externalOfferUrl(html);
    if (ext) return ext;
    const out = primaryOutHref(html);
    if (out) {
      const r2 = await fetch(`https://dzis.app${out}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
      return r2.url || `https://dzis.app${out}`;
    }
    return page;
  } catch { return page; }
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
    const venueGeo = e.venue?.geo?.lat != null && e.venue?.geo?.lng != null
      ? { lat: e.venue.geo.lat, lng: e.venue.geo.lng }
      : null;
    // Same geo path as every provider: shared venues store → Nominatim → bbox
    // center (always the fallback). The dzis.app API carries geo for ~86% of
    // events; the rest resolve through the cache/geocoder instead of a blunt
    // city-center pin.
    const fallback = bbox ? { lat: bbox.swLat + (bbox.neLat - bbox.swLat) / 2, lng: bbox.swLng + (bbox.neLng - bbox.swLng) / 2 } : { lat: city.lat, lng: city.lng };
    let lat: number | null = venueGeo?.lat ?? null;
    let lng: number | null = venueGeo?.lng ?? null;
    if (lat == null || lng == null) {
      const resolved = await resolveGeo({
        name: e.venue?.name || '',
        city: e.venue?.citySlug ? (cityById(e.venue.citySlug)?.name || city.name) : city.name,
        db: ctx.env.DB,
        fallback,
        provider: ProviderId.DZISAPP,
      });
      if (resolved) { lat = resolved.lat; lng = resolved.lng; }
    }
    if (lat == null || lng == null) { lat = fallback.lat; lng = fallback.lng; }

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
      tags: normalizeTags({ source: ProviderId.DZISAPP, rawTags: e.categorySlugs, title: e.title }),
    });
  }
  return out;
}

export const dzisappProvider: SeedProvider = {
  id: ProviderId.DZISAPP,
  transport: 'fetch',
  fetchCandidates: fetchDzisApp,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: DZIS_CITIES,
  fetchScope: (ctx, scope) => fetchDzisCity(ctx, scope),
  resolveLink: (_ctx, cand) => resolveDzisLink(cand),
};
