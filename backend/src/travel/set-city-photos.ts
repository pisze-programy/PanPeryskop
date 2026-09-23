// Replace the Nomads photos with the Unsplash originals the credit already
// names. Run: npm run set:photos
//
// The city list links a Nomads file today. That is not our photo, and a hotlink
// to it is not a licence. Every city carries an Unsplash credit instead
// (imageCredit.photoUrl), so the same photo lives on Unsplash under a licence we
// can use. This tool resolves each credit page to its images.unsplash.com file
// id and writes the pair back into data/cities.json.
//
// The page to file id step needs no API key: /download answers a redirect whose
// Location carries photo-XXXX. The Unsplash API allows 50 calls an hour, too few
// for 300 cities, so it is not used here.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data', 'cities.json');
const ID_CACHE = join(__dirname, 'data', 'unsplash-ids.json');

const PIN_WIDTH = 600;
const PIN_HEIGHT = 600;
const HERO_WIDTH = 1000;
const HERO_HEIGHT = 500;
const QUALITY = 80;
const AGENT = 'PanPeryskop/1.0 (city photos; contact: dev@panperyskop.app)';
const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY ?? 'NrXiGkYCcmozMxTPcB4ZsUnx5dfE4RsIbIDGFYdZIKY';

interface Credit {
  photoUrl: string;
  author: string;
  authorUrl: string;
}

interface City {
  id: string;
  name: string;
  country: string;
  imageUrl: string;
  imageLargeUrl: string;
  imageCredit: Credit | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The Unsplash photo id. A credit URL ends with the id, sometimes after a
 *  descriptive slug ("big-ben-london-iP8ElEhqHeY"); /download accepts the id
 *  alone and answers 404 for the whole slug. */
function pageId(photoUrl: string): string | null {
  const raw = (photoUrl || '').split('?')[0].replace(/\/+$/, '');
  const last = raw.split('/').pop() ?? '';
  const id = last.slice(-11);
  return id.length === 11 ? id : null;
}

/** The `photo-XXXX` file id from an images.unsplash.com URL. */
function fileId(rawUrl: string): string | null {
  const m = /(photo-[0-9a-z-]+)/i.exec(rawUrl);
  return m ? m[1] : null;
}

function pinUrl(file: string): string {
  return `https://images.unsplash.com/${file}?w=${PIN_WIDTH}&h=${PIN_HEIGHT}&fit=crop&auto=format&q=${QUALITY}`;
}

function heroUrl(file: string): string {
  return `https://images.unsplash.com/${file}?w=${HERO_WIDTH}&h=${HERO_HEIGHT}&fit=crop&auto=format&q=${QUALITY}`;
}


async function resolveFile(id: string): Promise<string | null> {
  const res = await fetch(`https://unsplash.com/photos/${id}/download`, {
    redirect: 'manual',
    headers: { 'User-Agent': AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  const location = res.headers.get('location');
  return location ? fileId(location) : null;
}

interface SearchHit {
  file: string;
  page: string;
  author: string;
  profile: string;
}

/** A landscape photo for the city. The first query carries the country, which
 *  helps a name shared by several places; a small place may have no photo under
 *  that pair, so the city name alone is the second try. */
async function searchCity(name: string, country: string): Promise<SearchHit | null> {
  const queries = [`${name} ${country} city`, `${name} city`];
  for (const query of queries) {
    const hit = await searchOnce(query);
    if (hit) return hit;
  }
  return null;
}

async function searchOnce(text: string): Promise<SearchHit | null> {
  const query = encodeURIComponent(text);
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${query}&per_page=5&orientation=landscape`,
    { headers: { Authorization: `Client-ID ${ACCESS_KEY}` }, signal: AbortSignal.timeout(20_000) }
  );
  if (!res.ok) {
    console.log(`search ${text}: HTTP ${res.status}`);
    return null;
  }
  const body = (await res.json()) as {
    results?: {
      id: string;
      urls?: { raw?: string };
      links?: { html?: string };
      user?: { name?: string; links?: { html?: string } };
    }[];
  };
  for (const hit of body.results ?? []) {
    const file = fileId(hit.urls?.raw ?? '');
    if (!file) continue;
    return {
      file,
      page: hit.links?.html ?? `https://unsplash.com/photos/${hit.id}`,
      author: hit.user?.name ?? '',
      profile: hit.user?.links?.html ?? '',
    };
  }
  return null;
}

async function main(): Promise<void> {
  const cities: City[] = JSON.parse(readFileSync(DATA, 'utf8'));
  const cache: Record<string, string> = existsSync(ID_CACHE)
    ? JSON.parse(readFileSync(ID_CACHE, 'utf8'))
    : {};

  let done = 0;
  let searched = 0;
  let failed = 0;

  for (const city of cities) {
    if (/images\.unsplash\.com/.test(city.imageUrl)) {
      done++;
      continue;
    }
    const id = city.imageCredit ? pageId(city.imageCredit.photoUrl) : null;
    let file = id ? cache[id] : undefined;
    if (id && !file) {
      file = (await resolveFile(id)) ?? undefined;
      if (file) cache[id] = file;
      await sleep(250);
    }
    if (!file) {
      const hit = await searchCity(city.name, city.country);
      if (hit) {
        file = hit.file;
        city.imageCredit = { photoUrl: hit.page, author: hit.author, authorUrl: hit.profile };
        searched++;
      }
      await sleep(400);
    }
    if (!file) {
      console.log(`no photo: ${city.id}`);
      failed++;
      continue;
    }
    city.imageUrl = pinUrl(file);
    city.imageLargeUrl = heroUrl(file);
    done++;
  }

  writeFileSync(DATA, JSON.stringify(cities, null, 1) + '\n');
  writeFileSync(ID_CACHE, JSON.stringify(cache, null, 1) + '\n');
  console.log(`ready ${done} (found by search ${searched}), failed ${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
