import { createHash } from 'node:crypto';
import { CONFIG } from '../config/index';
import { CITIES } from '../admin/cities';
import { airportCatalog, destinationsFrom } from './airports';

// Origin cities and their airports. Warsaw has two; Bialystok flies from the
// nearest airport (SZY). RDO has no city, so it stays out of the picker.
const ORIGIN_CITIES: Array<{ id: string; airports: string[] }> = [
  { id: 'warszawa', airports: ['WAW', 'WMI'] },
  { id: 'poznan', airports: ['POZ'] },
  { id: 'gdansk', airports: ['GDN'] },
  { id: 'krakow', airports: ['KRK'] },
  { id: 'lodz', airports: ['LCJ'] },
  { id: 'wroclaw', airports: ['WRO'] },
  { id: 'szczecin', airports: ['SZZ'] },
  { id: 'bydgoszcz', airports: ['BZG'] },
  { id: 'lublin', airports: ['LUZ'] },
  { id: 'katowice', airports: ['KTW'] },
  { id: 'bialystok', airports: ['SZY'] },
];

const ORIGIN_AIRPORTS = ['WAW', 'WMI', 'KRK', 'GDN', 'POZ', 'WRO', 'KTW', 'LCJ', 'SZZ', 'BZG', 'LUZ', 'RZE', 'RDO', 'SZY'];

export interface CatalogueCity {
  id: string;
  name: string;
  lat: number;
  lng: number;
  airports: string[];
}

export interface CatalogueAirport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

export interface CatalogueDestination extends CatalogueAirport {
  providers: Array<'ryanair' | 'wizzair'>;
}

export interface Catalogue {
  version: string;
  schemaVersion: number;
  minAppBuild: number;
  generatedAt: string;
  cities: CatalogueCity[];
  airports: CatalogueAirport[];
  destinations: Record<string, CatalogueDestination[]>;
}

type CataloguePayload = Omit<Catalogue, 'version' | 'generatedAt'>;

function buildPayload(): CataloguePayload {
  const catalog = new Map(airportCatalog().map((a) => [a.iata, a]));

  const airports: CatalogueAirport[] = ORIGIN_AIRPORTS
    .map((iata) => catalog.get(iata))
    .filter((a): a is NonNullable<typeof a> => a !== undefined)
    .map((a) => ({ iata: a.iata, name: a.name, city: a.city, country: a.country, lat: a.lat, lng: a.lng }));

  const cities: CatalogueCity[] = ORIGIN_CITIES.map(({ id, airports: iatas }) => {
    const city = CITIES.find((c) => c.id === id);
    if (!city) throw new Error(`catalogue: unknown city ${id}`);
    return { id: city.id, name: city.name, lat: city.lat, lng: city.lng, airports: iatas };
  });

  const destinations: Record<string, CatalogueDestination[]> = {};
  for (const origin of ORIGIN_AIRPORTS) {
    destinations[origin] = destinationsFrom(origin).map((d) => ({
      iata: d.iata,
      name: d.name,
      city: d.city,
      country: d.country,
      lat: d.lat,
      lng: d.lng,
      providers: [...d.providers].sort(),
    }));
  }

  return {
    schemaVersion: CONFIG.travel.catalogue.schemaVersion,
    minAppBuild: CONFIG.travel.catalogue.minAppBuild,
    cities,
    airports,
    destinations,
  };
}

export function buildCatalogue(generatedAt: string): Catalogue {
  const payload = buildPayload();
  return { version: catalogueVersion(payload), generatedAt, ...payload };
}

/** Content identity. Excludes generatedAt, so unchanged data keeps one version. */
export function catalogueVersion(payload: CataloguePayload): string {
  return createHash('sha256').update(canonical(payload)).digest('hex');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
