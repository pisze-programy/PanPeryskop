// Resolve each city to a Radical Storage slug. The site answers 200 for a slug
// it does not know, so the check is a storage point in the page, not the status.
// The sitemap is not a source: it misses cities that do have a page.
//
// Run: npx tsx src/travel/gen-radical-cities.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CITIES = join(__dirname, 'data', 'cities.json');
const OUT = join(__dirname, 'data', 'radical-cities.json');
const BASE = 'https://radicalstorage.com/pl/storage-list';
const AGENT = 'PanPeryskop/1.0 (luggage banner; contact: dev@panperyskop.app)';
const PAUSE_MS = 60;

// Our name and their slug disagree for a few cities.
const ALIASES: Record<string, string> = {
  frankfurt: 'frankfurt-main',
  cluj: 'cluj-napoca',
  'a-coruna': 'a-coru-a',
  paphos: 'pafos',
};

interface City {
  id: string;
  name: string;
  namePl?: string;
}

const POLISH: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (letter) => POLISH[letter] ?? letter)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// The /pl/ site serves a translated slug: london is 404, londyn is 200. The
// Polish name goes first, and the English one stays as a fallback for the
// cities that answer to both.
function candidates(city: City): string[] {
  const names = [city.namePl ? normalize(city.namePl) : '', normalize(city.name)];
  const slugs = names.flatMap((name) => [name, ALIASES[name] ?? '']);
  return [...new Set(slugs)].filter((slug) => slug.length > 1);
}

async function serves(slug: string): Promise<boolean> {
  const res = await fetch(`${BASE}/${slug}`, { headers: { 'User-Agent': AGENT } });
  return res.ok;
}

async function main(): Promise<void> {
  const cities = JSON.parse(readFileSync(CITIES, 'utf8')) as City[];
  const map: Record<string, string> = {};
  const misses: string[] = [];
  for (const city of cities) {
    let found = '';
    for (const slug of candidates(city)) {
      if (await serves(slug)) {
        found = slug;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
    if (found) map[city.id] = found;
    else misses.push(city.id);
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
  writeFileSync(OUT, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`luggage: ${Object.keys(map).length} of ${cities.length} cities covered`);
  console.log(`without coverage (${misses.length}): ${misses.join(', ')}`);
}

void main();
