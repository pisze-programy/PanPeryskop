// City-break destinations. The list is seeded from Nomads.com (see
// gen-cities.ts). Reachability is derived from route_days, so a city read makes
// no provider call.
import citiesJson from './data/cities.json';
import { canonicalIata } from './airports';
import { maskHas, type DbReader } from './routeDays';

export interface CityFacts {
  costLocalUsd: number;
  internetMbps: number;
  tempNowC: number;
  humidityNow: number;
  airQualityNow: number;
  airQualityYear: number;
  safety: number | null;
  cleanliness: number | null;
  fun: number | null;
  nightlife: number | null;
  walkability: number | null;
  healthcare: number | null;
  english: number | null;
  lgbtFriendly: number | null;
  femaleFriendly: number | null;
  overall: number | null;
}

export interface CityEntry {
  id: string;
  name: string;
  namePl: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  bandRank: number;
  costUsd: number;
  population: number;
  airports: string[];
  imageUrl: string;
  imageLargeUrl: string;
  videoUrl: string | null;
  nearby: string[];
  next: string[];
  similar: string[];
  facts: CityFacts;
}

export interface CityConnection {
  iata: string;
  carriers: string[];
}

export interface CityView {
  id: string;
  name: string;
  namePl: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  bandRank: number;
  costUsd: number;
  population: number;
  imageUrl: string;
  imageLargeUrl: string;
  videoUrl: string | null;
  nearby: string[];
  next: string[];
  similar: string[];
  facts: CityFacts;
  /** The airports that serve the city. Independent of the day, so the flight
   *  calendar opens for every city. */
  airports: string[];
  reachable: boolean;
  connections: CityConnection[];
}

export const CITY_ENTRIES = citiesJson as CityEntry[];

interface CityRow {
  id: string;
  name: string;
  name_pl: string;
  country: string;
  country_code: string;
  lat: number;
  lng: number;
  band_rank: number;
  cost_usd: number;
  population: number;
  airports: string;
  image_url: string;
  image_large_url: string;
  video_url: string | null;
  nearby: string;
  next: string;
  similar: string;
  facts: string;
}

function parseList(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function parseFacts(raw: string): CityFacts {
  try {
    return JSON.parse(raw) as CityFacts;
  } catch {
    return CITY_ENTRIES[0].facts;
  }
}

export async function saveCities(db: D1Database, entries: CityEntry[]): Promise<number> {
  const now = Date.now();
  const statements = entries.map((entry) =>
    db
      .prepare(
        `INSERT INTO travel_cities
           (id, name, name_pl, country, country_code, lat, lng, band_rank, cost_usd,
            population, airports, image_url, image_large_url, video_url,
            nearby, next, similar, facts, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, name_pl=excluded.name_pl, country=excluded.country,
           country_code=excluded.country_code, lat=excluded.lat, lng=excluded.lng,
           band_rank=excluded.band_rank, cost_usd=excluded.cost_usd,
           population=excluded.population,
           airports=excluded.airports, image_url=excluded.image_url,
           image_large_url=excluded.image_large_url, video_url=excluded.video_url,
           nearby=excluded.nearby, next=excluded.next, similar=excluded.similar,
           facts=excluded.facts, updated_at=excluded.updated_at`,
      )
      .bind(
        entry.id, entry.name, entry.namePl, entry.country, entry.countryCode,
        entry.lat, entry.lng, entry.bandRank, entry.costUsd, entry.population,
        JSON.stringify(entry.airports),
        entry.imageUrl, entry.imageLargeUrl, entry.videoUrl,
        JSON.stringify(entry.nearby), JSON.stringify(entry.next), JSON.stringify(entry.similar),
        JSON.stringify(entry.facts), now,
      ),
  );
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
  return entries.length;
}

async function reachableDests(db: DbReader, origins: string[], day: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (origins.length === 0) return out;
  const placeholders = origins.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT dest, carrier, horizon_start, horizon_days, mask
       FROM route_days WHERE origin IN (${placeholders})`,
    )
    .bind(...origins)
    .all<{ dest: string; carrier: string; horizon_start: number; horizon_days: number; mask: string }>();
  for (const row of results ?? []) {
    if (!maskHas(row.mask, row.horizon_start, row.horizon_days, day)) continue;
    const dest = canonicalIata(row.dest);
    const carriers = out.get(dest) ?? new Set<string>();
    carriers.add(row.carrier);
    out.set(dest, carriers);
  }
  return out;
}

export interface CityBreakView {
  cities: CityView[];
  /** Every destination with a flight from the origins on the day. */
  airports: CityConnection[];
}

export async function cityBreakForDay(db: DbReader, origins: string[], day: string): Promise<CityBreakView> {
  const reachable = await reachableDests(db, origins, day);
  const airports = [...reachable.entries()]
    .map(([iata, carriers]) => ({ iata, carriers: [...carriers].sort() }))
    .sort((a, b) => a.iata.localeCompare(b.iata));
  const { results } = await db
    .prepare(
      `SELECT id, name, name_pl, country, country_code, lat, lng, band_rank, cost_usd,
       population, airports, image_url, image_large_url, video_url,
              nearby, next, similar, facts
       FROM travel_cities ORDER BY band_rank, cost_usd DESC`,
    )
    .all<CityRow>();
  const cities = (results ?? []).map((row) => {
    const connections = parseList(row.airports)
      .filter((iata) => reachable.has(iata))
      .map((iata) => ({ iata, carriers: [...(reachable.get(iata) ?? [])].sort() }));
    return {
      id: row.id,
      name: row.name,
      namePl: row.name_pl,
      country: row.country,
      countryCode: row.country_code,
      lat: row.lat,
      lng: row.lng,
      bandRank: row.band_rank,
      costUsd: row.cost_usd,
      population: row.population,
      imageUrl: row.image_url,
      imageLargeUrl: row.image_large_url,
      videoUrl: row.video_url,
      nearby: parseList(row.nearby),
      next: parseList(row.next),
      similar: parseList(row.similar),
      facts: parseFacts(row.facts),
      airports: parseList(row.airports),
      reachable: connections.length > 0,
      connections,
    };
  });
  return { cities, airports };
}
