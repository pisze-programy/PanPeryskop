// One lead photo per city-break destination. Fetches the Wikipedia article image,
// scales it to a compressed thumbnail, and posts it to the backend, which stores
// it in R2 and records the key. Run once, or again after the city list changes:
//
//   npx tsx backend/src/travel/fetch-city-photos.ts [--limit=N] [--all]
//
// Cities that already have a photo are skipped unless --all is passed. Needs
// BASE_URL and ADMIN_SECRET (read from backend/.dev.vars by default).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import citiesJson from './data/cities.json';

const __dirname = dirname(fileURLToPath(import.meta.url));

const THUMB_WIDTH = 640;
const MAX_BYTES = 700_000;
const CONCURRENCY = 2;
const ATTEMPTS = 3;
const USER_AGENT = { 'User-Agent': 'PanPeryskop/1.0 (https://panperyskop.app)' };

interface CityEntry {
  id: string;
  name: string;
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
async function getWithRetry(url: string, timeoutMs: number): Promise<Response | null> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const res = await fetch(url, { headers: USER_AGENT, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status !== 429) return res;
    await sleep(2_000 * (attempt + 1));
  }
  return null;
}

async function fetchSummary(title: string): Promise<WikipediaSummary | null> {
  const res = await getWithRetry(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    15_000,
  );
  if (!res || !res.ok) return null;
  return (await res.json()) as WikipediaSummary;
}

/** The Commons file name behind a Wikipedia article image. */
function fileName(summary: WikipediaSummary): string | null {
  const raw = summary.originalimage?.source ?? summary.thumbnail?.source;
  if (!raw) return null;
  const clean = raw.split('?')[0];
  const parts = clean.split('/');
  const name = clean.includes('/thumb/') ? parts[parts.length - 2] : parts[parts.length - 1];
  return name ? decodeURIComponent(name) : null;
}

/** Wikimedia renders the requested width on demand; a hand-built thumb URL 400s. */
function photoUrl(name: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${THUMB_WIDTH}`;
}

/** "San Sebastián/Donostia" is one article, not a slash path. */
function titleCandidates(city: CityEntry): string[] {
  const override = TITLE_OVERRIDES[city.id];
  const first = city.name.split('/')[0].trim();
  const candidates = [override, city.name, first];
  return [...new Set(candidates.filter((c): c is string => Boolean(c)))];
}

async function findPhoto(city: CityEntry): Promise<{ url: string; credit: string } | null> {
  for (const title of titleCandidates(city)) {
    const summary = await fetchSummary(title);
    if (!summary) continue;
    const name = fileName(summary);
    if (!name) continue;
    return {
      url: photoUrl(name),
      credit: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`,
    };
  }
  return null;
}

async function processCity(city: CityEntry): Promise<string> {
  const photo = await findPhoto(city);
  if (!photo) return `${city.id} ${city.name}: no photo`;
  const bytes = await download(photo.url);
  if (!bytes) return `${city.id} ${city.name}: image unavailable`;
  if (bytes.length > MAX_BYTES) return `${city.id} ${city.name}: too large (${bytes.length})`;
  const response = await fetch(`${BASE_URL}/admin/seed/cities/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: city.id,
      image: Buffer.from(bytes).toString('base64'),
      credit: photo.credit,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return `${city.id} ${city.name}: upload ${response.status}`;
  return `ok ${city.id} ${city.name} (${Math.round(bytes.length / 1024)} KB)`;
}

/** Smallest first: a wide PNG can stay heavy even at 640 px. */
async function download(url: string): Promise<Uint8Array | null> {
  for (const width of [THUMB_WIDTH, 400, 240]) {
    const res = await getWithRetry(url.replace(/width=\d+/, `width=${width}`), 30_000);
    if (!res || !res.ok) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length <= MAX_BYTES) return bytes;
  }
  return null;
}

async function storedIds(): Promise<Set<string>> {
  const day = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${BASE_URL}/travel/cities?day=${day}`);
  if (!res.ok) return new Set();
  const body = (await res.json()) as { cities: { id: string; imageKey: string | null }[] };
  return new Set(body.cities.filter((c) => c.imageKey).map((c) => c.id));
}

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
  const skipStored = !process.argv.includes('--all');
  const stored = skipStored ? await storedIds() : new Set<string>();

  const queue = (citiesJson as CityEntry[])
    .filter((c) => !stored.has(c.id))
    .slice(0, limit);
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
  console.log(`done: ${ok}/${total} photos stored`);
}

main();
