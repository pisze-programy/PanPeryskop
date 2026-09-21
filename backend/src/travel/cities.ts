// City-break destinations. The list is static (Eurostat Urban Audit extract).
// Reachability is derived from route_days, so a city read makes no provider call.
import citiesJson from './data/cities.json';
import { canonicalIata } from './airports';
import { maskHas, type DbReader } from './routeDays';

export interface CityEntry {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  tier: string;
  tierRank: number;
  rank: number;
  nightsTotal: number;
  airports: string[];
}

export interface CityConnection {
  iata: string;
  carriers: string[];
}

export interface CityView {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  tier: string;
  tierRank: number;
  reachable: boolean;
  connections: CityConnection[];
  /** R2 keys of the hero gallery, in order. */
  imageKeys: string[];
  /** R2 key of the map-pin image, or null. */
  thumbKey: string | null;
}

export const CITY_ENTRIES = citiesJson as CityEntry[];

interface CityRow {
  id: string;
  name: string;
  country: string;
  country_code: string;
  lat: number;
  lng: number;
  tier: string;
  tier_rank: number;
  airports: string;
  image_keys: string;
  thumb_key: string | null;
}

function parseAirports(raw: string): string[] {
  return parseKeys(raw);
}

function parseKeys(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveCities(db: D1Database, entries: CityEntry[]): Promise<number> {
  const now = Date.now();
  const statements = entries.map((entry) =>
    db
      .prepare(
        `INSERT INTO travel_cities
           (id, name, country, country_code, lat, lng, tier, tier_rank, rank, nights_total, airports, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, country=excluded.country, country_code=excluded.country_code,
           lat=excluded.lat, lng=excluded.lng, tier=excluded.tier, tier_rank=excluded.tier_rank,
           rank=excluded.rank, nights_total=excluded.nights_total, airports=excluded.airports,
           updated_at=excluded.updated_at`,
      )
      .bind(
        entry.id, entry.name, entry.country, entry.countryCode, entry.lat, entry.lng,
        entry.tier, entry.tierRank, entry.rank, entry.nightsTotal,
        JSON.stringify(entry.airports), now,
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
      `SELECT id, name, country, country_code, lat, lng, tier, tier_rank, airports, image_keys, thumb_key
       FROM travel_cities ORDER BY tier_rank, rank`,
    )
    .all<CityRow>();
  const cities = (results ?? []).map((row) => {
    const connections = parseAirports(row.airports)
      .filter((iata) => reachable.has(iata))
      .map((iata) => ({ iata, carriers: [...(reachable.get(iata) ?? [])].sort() }));
    return {
      id: row.id,
      name: row.name,
      country: row.country,
      countryCode: row.country_code,
      lat: row.lat,
      lng: row.lng,
      tier: row.tier,
      tierRank: row.tier_rank,
      reachable: connections.length > 0,
      connections,
      imageKeys: parseKeys(row.image_keys),
      thumbKey: row.thumb_key,
    };
  });
  return { cities, airports };
}
