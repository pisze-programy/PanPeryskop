// Writes the bundled city-break data from the Eurostat Urban Audit extract.
// Run once after the CSV changes:
//
//   npx tsx backend/src/travel/gen-cities.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { airportCatalog, canonicalIata } from './airports';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', '..', '_internal', 'city-visitors.csv');
const OUT = join(__dirname, 'data', 'cities.json');

// The CSV holds Polish tier words. The keys below are that external input, not
// our vocabulary: the emitted tier is English, like every other stored value.
const TIERS: Record<string, { tier: string; rank: number }> = {
  metropolia: { tier: 'metropolis', rank: 1 },
  duze: { tier: 'large', rank: 2 },
  srednie: { tier: 'medium', rank: 3 },
  male: { tier: 'small', rank: 4 },
  mniejsze: { tier: 'smaller', rank: 5 },
  reszta: { tier: 'rest', rank: 6 },
};
const MAX_TIER_RANK = 3;
// 150 km, not 100: the Urban Audit point is the municipality centre, and a
// city-break airport is often farther out (Frankfurt-Hahn 100 km, Dresden-Prague
// 113 km, Oslo-Gardermoen 122 km).
const AIRPORT_RADIUS_KM = 150;

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

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(field); field = ''; }
    else field += ch;
  }
  out.push(field);
  return out;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function airportsNear(lat: number, lng: number): string[] {
  const codes = airportCatalog()
    .filter((a) => distanceKm(lat, lng, a.lat, a.lng) <= AIRPORT_RADIUS_KM)
    .sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng))
    .map((a) => canonicalIata(a.iata));
  return [...new Set(codes)];
}

function parseRows(csv: string): CityEntry[] {
  const lines = csv.split('\n').filter((l) => l.trim() !== '');
  const entries: CityEntry[] = [];
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line);
    const tier = TIERS[f[9]?.trim()];
    if (!tier || tier.rank > MAX_TIER_RANK) continue;
    // 91 rows of the extract have no GISCO point. Number('') is 0, so test the
    // raw field, or the city lands at 0,0.
    if (!f[7]?.trim() || !f[8]?.trim()) continue;
    const lat = Number(f[7]);
    const lng = Number(f[8]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    entries.push({
      id: f[3].trim(),
      name: f[1].trim(),
      country: f[2].trim(),
      countryCode: f[3].trim().slice(0, 2),
      lat, lng,
      tier: tier.tier, tierRank: tier.rank,
      rank: Number(f[0]),
      nightsTotal: Number(f[5]) || 0,
      airports: airportsNear(lat, lng),
    });
  }
  return entries.sort((a, b) => a.rank - b.rank);
}

const entries = parseRows(readFileSync(SRC, 'utf8'));
writeFileSync(OUT, `${JSON.stringify(entries, null, 2)}\n`);
const withAirport = entries.filter((e) => e.airports.length > 0).length;
console.log(`wrote ${OUT} (${entries.length} cities, ${withAirport} with a nearby airport)`);
