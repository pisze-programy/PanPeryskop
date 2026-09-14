// Fake places catalogue. There is no provider yet, so the list is deterministic
// around the event coordinates.
// ponytail: static generator; swap for a real provider when one exists.
import { CONFIG, type HotelTier, type PlaceKind } from '../config/index';
import { KINDS, STREETS } from './data/places';

export type { HotelTier, PlaceKind };

export interface TravelPlace {
  id: string;
  kind: PlaceKind;
  name: string;
  image: string;
  price: number;
  currency: string;
  address: string;
  lat: number;
  lng: number;
  /** Provider search/deep link, opened in the in-app browser. */
  link: string;
  tier?: HotelTier;
  rating?: number;
  reviews?: number;
}

export function isPlaceKind(raw: string): raw is PlaceKind {
  return (CONFIG.travel.places.kinds as readonly string[]).includes(raw);
}

/** FNV-1a — stable across Node versions (unlike Math.random). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic ±0.012° offset around the event (roughly 0–1.3 km). */
function jitter(seed: string): number {
  return ((hash(seed) % 2400) - 1200) / 100_000;
}

export function buildPlaces(kind: PlaceKind, lat: number, lng: number): TravelPlace[] {
  const cfg = KINDS[kind];
  const tiers = CONFIG.travel.places.tiers;
  return cfg.names.map((name, i) => {
    const id = `${kind}-${hash(`${kind}:${name}:${i}`) % 100000}`;
    const t = cfg.names.length > 1 ? i / (cfg.names.length - 1) : 0;
    const price = Math.round((cfg.min + t * (cfg.max - cfg.min)) / 5) * 5;
    const place: TravelPlace = {
      id,
      kind,
      name,
      image: `https://picsum.photos/seed/${id}/400/300`,
      price,
      currency: cfg.currency,
      address: STREETS[i % STREETS.length],
      lat: lat + jitter(`${id}:lat`),
      lng: lng + jitter(`${id}:lng`),
      link: CONFIG.travel.places.linkBase[kind] + encodeURIComponent(name),
      rating: Math.round((3.6 + ((hash(`${id}:r`) % 15) / 10)) * 10) / 10,
      reviews: 40 + (hash(`${id}:n`) % 900),
    };
    if (kind === 'hotel') {
      place.tier = tiers[i % tiers.length];
    }
    return place;
  });
}

/** Slice a place list for the list view. */
export function paginatePlaces(all: TravelPlace[], offset: number, limit: number) {
  const start = Math.max(0, Math.floor(offset) || 0);
  const size = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 15;
  const places = all.slice(start, start + size);
  return { places, total: all.length, hasMore: start + places.length < all.length };
}
