// Shared venue-geo resolution for seed providers. Every source uses the same
// path so behavior is uniform:
//   1. cache        — D1 `venues` store (Worker) or an injected store (local/VPS
//                     runner, e.g. a checkpoint JSON), keyed by venue name.
//   2. Nominatim    — OSM geocoding, paced to 1 req/s (usage policy), result is
//                     cached back into the store.
//   3. fallback     — the caller-provided point (city-center / bbox middle).
//                     ALWAYS the last resort, identical for all providers.
import { resolveVenueGeo, upsertVenue } from '../venues/venueStore';

export interface GeoPoint {
  lat: number;
  lng: number;
  address: string;
}

/** Injectable cache — the Worker wraps D1 `venues`, local runners wrap a JSON checkpoint. */
export interface GeoStore {
  get(name: string, city?: string): Promise<GeoPoint | null>;
  set(name: string, city: string | null, geo: GeoPoint): Promise<void>;
}

export interface ResolveGeoOptions {
  name: string;
  address?: string;
  city?: string;
  /** D1 venues store (Worker path). Prefer over `store` when present. */
  db?: D1Database;
  /** Injected cache (local/VPS runner path). */
  store?: GeoStore;
  /** City-center / bbox middle — returned when cache + Nominatim both miss. */
  fallback?: { lat: number; lng: number };
  /** Provider tag recorded in the venues store (e.g. 'meetup'). */
  provider?: string;
}

const NOMINATIM_UA = 'PanPeryskop-seed/1.0 (PanPeryskop event seeder; contact: seed@panperyskop.local)';
const NOMINATIM_PACE_MS = 1000; // OSM usage policy: max 1 req/s.

// Module-level pacing so concurrent scopes (Worker queue) and sequential city
// loops (VPS runner) share one global 1 req/s throttle.
let lastNominatimMs = 0;

async function nominatim(q: string): Promise<GeoPoint | null> {
  const wait = NOMINATIM_PACE_MS - (Date.now() - lastNominatimMs);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimMs = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    if (!j.length) return null;
    const lat = parseFloat(j[0].lat || '');
    const lng = parseFloat(j[0].lon || '');
    if (Number.isNaN(lat) || Number.isNaN(lng) || (lat === 0 && lng === 0)) return null;
    return { lat, lng, address: j[0].display_name || '' };
  } catch {
    return null;
  }
}

const fallbackPoint = (fb: { lat: number; lng: number }): GeoPoint => ({ lat: fb.lat, lng: fb.lng, address: '' });

/**
 * Build the Nominatim candidate queries for a venue/address/city triple, in
 * order of preference. Two quirks of Nominatim's free-form parser are handled:
 *   - a query STARTING with a street-type prefix ("ul. Ratajczaka 18 …") returns
 *     nothing, while the bare street ("Ratajczaka 18 …") resolves — so leading
 *     `ul.`/`ulica`/`al.`/`aleja` are stripped from each part;
 *   - "|" separators (venue chains) break parsing — replaced with ",".
 * When a real address is present, the venue name is dropped from the retry query
 * (venue chains like "Targi | Hala nr 1A | Głogowska 18" pollute the street query).
 */
export function geoQueryCandidates(name: string, address: string, city: string): string[] {
  const normalize = (s: string): string =>
    (s || '')
      .trim()
      .replace(/^(ul\.|ulica|al\.|aleja)\s+/i, '')
      .replace(/\|/g, ',')
      .replace(/\s*,\s*/g, ', ')
      .trim();

  const nameQ = normalize(name);
  const addrQ = normalize(address);
  const cityQ = normalize(city);

  const candidates = [[nameQ, addrQ, cityQ]];
  if (addrQ) candidates.push([addrQ, cityQ]);
  return [...new Set(candidates.map((p) => [...new Set(p)].filter(Boolean).join(', ')))].filter(Boolean);
}

export async function resolveGeo(opts: ResolveGeoOptions): Promise<GeoPoint | null> {
  const name = (opts.name || '').trim();
  // Nothing to resolve — straight to the fallback (never hit the store/geocoder).
  if (!name && !opts.address) return opts.fallback ? fallbackPoint(opts.fallback) : null;

  // 1. Cache.
  if (opts.db) {
    const hit = await resolveVenueGeo(opts.db, name || opts.address!, opts.city);
    if (hit) return { lat: hit.lat, lng: hit.lng, address: '' };
  } else if (opts.store) {
    const hit = await opts.store.get(name || opts.address!, opts.city);
    if (hit) return hit;
  }

  // 2. Nominatim (candidates, each paced at 1 req/s; cache the first hit).
  for (const q of geoQueryCandidates(name, opts.address || '', opts.city || '')) {
    const geo = await nominatim(q);
    if (geo) {
      if (opts.db && name) await upsertVenue(opts.db, { name, lat: geo.lat, lng: geo.lng, city: opts.city || null, provider: opts.provider });
      else if (opts.store) await opts.store.set(name || opts.address!, opts.city || null, geo);
      return geo;
    }
  }

  // 3. Fallback.
  return opts.fallback ? fallbackPoint(opts.fallback) : null;
}
