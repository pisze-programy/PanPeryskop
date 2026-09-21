// City-break photo gallery. Fetches the Wikipedia article image plus nearby
// Commons photos, scales them to compressed thumbnails, and posts them to the
// backend, which stores them in R2 and records the keys. Run once, or again
// after the city list changes:
//
//   npx tsx backend/src/travel/fetch-city-photos.ts [--limit=N] [--all]
//
// Cities that already have a gallery are skipped unless --all is passed. Needs
// BASE_URL and ADMIN_SECRET (read from backend/.dev.vars by default).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import citiesJson from './data/cities.json';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HERO_WIDTH = 640;
const THUMB_WIDTH = 160;
const MAX_PHOTOS = 1;
const MAX_BYTES = 400_000;
const CONCURRENCY = 2;
const ATTEMPTS = 3;
const USER_AGENT = { 'User-Agent': 'PanPeryskop/1.0 (https://panperyskop.app)' };


interface CityEntry {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface WikipediaSummary {
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
}

function devVar(name: string): string {
  const raw = readFileSync(join(__dirname, '..', '..', '.dev.vars'), 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : '';
}

const BASE_URL = process.env.BASE_URL ?? 'https://api.panperyskop.app';
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? devVar('ADMIN_SECRET');

// The extract uses the local name. These cities resolve to a disambiguation page
// under it, so the English article title is given here.
const TITLE_OVERRIDES: Record<string, string> = {
  IT001C: 'Rome',
  IE002C: 'Cork (city)',
  HR005C: 'Split, Croatia',
  BE003C: 'Ghent',
  BG003C: 'Varna, Bulgaria',
  MT001C: 'Valletta',
  FR014C: 'Cannes',
  ES061C: 'Cartagena, Spain',
  IT027C: 'Padua',
  ES020C: 'Córdoba, Spain',
  ES008C: 'Las Palmas',
  BE011C: 'Ostend',
  ES015C: 'Santander, Spain',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET with a backoff: Wikimedia answers 429 when hit too fast. */
async function getJson(url: string): Promise<any | null> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const res = await fetch(url, { headers: USER_AGENT, signal: AbortSignal.timeout(20_000) });
    if (res.status === 429) {
      await sleep(2_000 * (attempt + 1));
      continue;
    }
    if (!res.ok) return null;
    return await res.json();
  }
  return null;
}

async function fetchSummary(title: string): Promise<WikipediaSummary | null> {
  return await getJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
  );
}

/** The Commons file name behind an upload URL. */
function fileName(raw: string): string | null {
  const clean = raw.split('?')[0];
  const parts = clean.split('/');
  const name = clean.includes('/thumb/') ? parts[parts.length - 2] : parts[parts.length - 1];
  return name ? decodeURIComponent(name) : null;
}

/** Wikimedia renders the requested width on demand; a hand-built thumb URL 400s. */
function filePathUrl(name: string, width: number): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}

/** "San Sebastián/Donostia" is one article, not a slash path. */
function titleCandidates(city: CityEntry): string[] {
  const first = city.name.split('/')[0].trim();
  const candidates = [TITLE_OVERRIDES[city.id], city.name, first];
  return [...new Set(candidates.filter((c): c is string => Boolean(c)))];
}

/** The Wikipedia lead image: the only source good enough to keep. */
async function photoNames(city: CityEntry): Promise<string[]> {
  for (const title of titleCandidates(city)) {
    const summary = await fetchSummary(title);
    if (!summary) continue;
    const raw = summary.originalimage?.source ?? summary.thumbnail?.source;
    const name = raw ? fileName(raw) : null;
    if (name) return [name];
  }
  return [];
}

async function download(name: string, width: number): Promise<Uint8Array | null> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const res = await fetch(filePathUrl(name, width), {
      headers: USER_AGENT,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) {
      await sleep(2_000 * (attempt + 1));
      continue;
    }
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }
  return null;
}

async function processCity(city: CityEntry): Promise<string> {
  const names = await photoNames(city);
  if (names.length === 0) return `${city.id} ${city.name}: no photo`;

  const images: string[] = [];
  for (const name of names) {
    const bytes = await download(name, HERO_WIDTH);
    if (!bytes || bytes.length > MAX_BYTES) continue;
    images.push(Buffer.from(bytes).toString('base64'));
  }
  if (images.length === 0) return `${city.id} ${city.name}: nothing under the size cap`;

  const thumb = await download(names[0], THUMB_WIDTH);
  if (!thumb) return `${city.id} ${city.name}: no thumb`;

  const response = await fetch(`${BASE_URL}/admin/seed/cities/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: city.id, images, thumb: Buffer.from(thumb).toString('base64') }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) return `${city.id} ${city.name}: upload ${response.status}`;
  return `ok ${city.id} ${city.name} (${images.length} photos)`;
}

async function storedIds(): Promise<Set<string>> {
  const day = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${BASE_URL}/travel/cities?day=${day}`);
  if (!res.ok) return new Set();
  const body = (await res.json()) as { cities: { id: string; imageKeys: string[] }[] };
  return new Set(body.cities.filter((c) => (c.imageKeys ?? []).length > 0).map((c) => c.id));
}

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
  const skipStored = !process.argv.includes('--all');
  const stored = skipStored ? await storedIds() : new Set<string>();

  const queue = (citiesJson as CityEntry[]).filter((c) => !stored.has(c.id)).slice(0, limit);
  const total = queue.length;
  console.log(`${total} cities to fetch (${stored.size} already stored)`);
  let ok = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const city = queue.shift();
      if (!city) return;
      const line = await processCity(city).catch((e: Error) => `${city.id} ${city.name}: ${e.message}`);
      if (line.startsWith('ok ')) ok += 1;
      else console.log(line);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`done: ${ok}/${total} cities stored`);
}

main();
