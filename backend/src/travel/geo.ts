import { resolveGeo, GeoStore } from '../seed/core/geo';
import { airportForCity } from './airports';

export interface TravelGeoInput {
  name: string;
  city: string;
  db?: D1Database;
  store?: GeoStore;
  provider?: string;
}

export interface TravelGeoResult {
  lat: number;
  lng: number;
  source: 'venue' | 'airport';
}

// Fallback order: venue geo → airport coords. Never a guess, never (0,0).
export async function resolveTravelGeo(input: TravelGeoInput): Promise<TravelGeoResult | null> {
  const geo = await resolveGeo({
    name: input.name.trim(),
    city: input.city,
    db: input.db,
    store: input.store,
    provider: input.provider,
  });
  if (geo) return { lat: geo.lat, lng: geo.lng, source: 'venue' };
  const airport = airportForCity(input.city);
  if (airport) return { lat: airport.lat, lng: airport.lng, source: 'airport' };
  return null;
}