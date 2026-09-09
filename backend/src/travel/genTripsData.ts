// Regenerates ios/PanPeryskop/Models/TripsData.swift from the live airport +
// destination data. Polish airports are ordered by city size (WAW default first).
//
//   npx tsx backend/src/travel/genTripsData.ts
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destinationsFrom, airportCatalog } from './airports';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', '..', 'ios', 'PanPeryskop', 'Models', 'TripsData.swift');

// Polish airports, ordered by city size (WAW first = default selection).
const PL_ORDER = ['WAW', 'WMI', 'KRK', 'GDN', 'POZ', 'WRO', 'KTW', 'LCJ', 'SZZ', 'BZG', 'LUZ', 'RZE', 'RDO', 'SZY'];

const esc = (s: string) => s.replace(/"/g, '\\"').replace(/\r?\n/g, ' ').trim();

const catalog = airportCatalog();
const pl = PL_ORDER
  .map((iata) => catalog.find((a) => a.iata === iata))
  .filter((a): a is NonNullable<typeof a> => a !== undefined);

let out = `// Generated — do not edit by hand. Regenerate: npx tsx backend/src/travel/genTripsData.ts
import Foundation

enum TripsData {
    static let polishAirports: [Airport] = [
`;
for (const a of pl) {
  out += `        Airport(iata: "${a.iata}", name: "${esc(a.name)}", city: "${esc(a.city)}", country: "${esc(a.country)}", lat: ${a.lat}, lng: ${a.lng}),\n`;
}
out += `    ]

    static let destinations: [String: [Destination]] = [
`;
for (const origin of pl) {
  const dests = destinationsFrom(origin.iata).sort((a, b) => a.iata.localeCompare(b.iata));
  out += `        "${origin.iata}": [\n`;
  for (const d of dests) {
    const provs = Array.from(d.providers).sort().map((p) => `"${p}"`).join(', ');
    out += `            Destination(iata: "${d.iata}", name: "${esc(d.name)}", city: "${esc(d.city)}", country: "${esc(d.country)}", lat: ${d.lat}, lng: ${d.lng}, providers: [${provs}]),\n`;
  }
  out += `        ],\n`;
}
out += `    ]
}\n`;

writeFileSync(OUT, out);
console.log(`wrote ${OUT} (${pl.length} airports)`);