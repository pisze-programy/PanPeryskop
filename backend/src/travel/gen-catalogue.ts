// Writes the iOS bundled catalogue baseline from the live airport + destination
// data. Run before an app build so a fresh install has the current catalogue
// offline. The backend serves the same payload at GET /travel/catalogue.
//
//   npx tsx backend/src/travel/gen-catalogue.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogue } from './catalogue';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', '..', 'ios', 'PanPeryskop', 'Resources', 'catalogue.json');

const catalogue = buildCatalogue(new Date().toISOString());
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`wrote ${OUT} (version ${catalogue.version.slice(0, 12)}, ${catalogue.cities.length} cities)`);
