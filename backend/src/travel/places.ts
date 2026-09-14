// Fake places catalogue. There is no provider yet, so the list is deterministic
// around the event coordinates.
// ponytail: static generator; swap for a real provider when one exists.

export type PlaceKind = 'hotel' | 'attraction' | 'car' | 'insurance';
export type HotelTier = 'economy' | 'recommended' | 'premium';

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
  /** Hotels only. */
  tier?: HotelTier;
  rating?: number;
  reviews?: number;
}

const KINDS: Record<PlaceKind, { names: string[]; min: number; max: number; currency: string }> = {
  hotel: {
    names: ['Hotel Centrum', 'Apartamenty Rynek', 'Hotel Airport', 'Pensjonat Stary Port',
      'Boutique Suites', 'Hostel City', 'Hotel Marina', 'Resort Panorama', 'City Lodge',
      'Grand Hotel', 'Hotel Park', 'Hotel Katedra'],
    min: 180, max: 900, currency: 'PLN',
  },
  attraction: {
    names: ['City Walking Tour', 'Muzeum Narodowe', 'Rejs po porcie', 'Degustacja lokalna',
      'Karta miejska', 'Park rozrywki', 'Rejs statkiem', 'Wine Tasting', 'Segway Tour',
      'Historyczne centrum'],
    min: 25, max: 120, currency: 'PLN',
  },
  car: {
    names: ['Fiat 500', 'Toyota Corolla', 'VW Golf', 'Skoda Octavia', 'Renault Clio',
      'Ford Focus', 'Opel Corsa', 'Kia Ceed'],
    min: 90, max: 320, currency: 'PLN',
  },
  insurance: {
    names: ['Ubezpieczenie Podstawowe', 'Ubezpieczenie Sportowe', 'Ubezpieczenie Rodzinne',
      'Ubezpieczenie Premium', 'Assistance 24/7'],
    min: 30, max: 180, currency: 'PLN',
  },
};

const STREETS = ['ul. Główna 12', 'Al. Portowa 4', 'ul. Kwiatowa 7', 'Rynek 1',
  'ul. Sportowa 9', 'ul. Kolejowa 22', 'Bulwar 15', 'ul. Targowa 3'];

// Fake search deep links until a real provider exists.
const LINK_BASE: Record<PlaceKind, string> = {
  hotel: 'https://www.booking.com/searchresults.html?ss=',
  attraction: 'https://www.getyourguide.com/s/?q=',
  car: 'https://www.booking.com/cars/index.html?ss=',
  insurance: 'https://www.getyourguide.com/s/?q=',
};

export function isPlaceKind(raw: string): raw is PlaceKind {
  return raw === 'hotel' || raw === 'attraction' || raw === 'car' || raw === 'insurance';
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
      link: LINK_BASE[kind] + encodeURIComponent(name),
      rating: Math.round((3.6 + ((hash(`${id}:r`) % 15) / 10)) * 10) / 10,
      reviews: 40 + (hash(`${id}:n`) % 900),
    };
    if (kind === 'hotel') {
      place.tier = (['economy', 'recommended', 'premium'] as HotelTier[])[i % 3];
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
