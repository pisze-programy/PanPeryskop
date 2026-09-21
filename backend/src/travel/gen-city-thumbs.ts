// Downloads and re-encodes the city pin thumbnails into the iOS bundle.
// Run: npx tsx backend/src/travel/gen-city-thumbs.ts
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CITIES = join(__dirname, 'data', 'cities.json');
const CACHE = join(__dirname, '..', '..', '..', '_internal', 'city-thumbs-cache');
const OUT = join(__dirname, '..', '..', '..', 'ios', 'PanPeryskop', 'Resources', 'CityThumbs');
const AGENT = 'PanPeryskop/1.0 (city thumbs; contact: dev@panperyskop.app)';

interface CityEntry {
  id: string;
  imageUrl: string;
}

function thumbUrl(imageUrl: string): string {
  return imageUrl.replace(/width=\d+,height=\d+,quality=\d+/, 'width=200,height=200,quality=70');
}

async function download(id: string, url: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${id}.webp`);
  if (existsSync(file)) return file;
  const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, buffer);
  return file;
}

function encode(source: string, target: string): void {
  execFileSync('cwebp', ['-quiet', '-q', '82', '-resize', '200', '200', source, '-o', target]);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const cities = JSON.parse(readFileSync(CITIES, 'utf8')) as CityEntry[];
  let raw = 0;
  let encoded = 0;
  let failed = 0;
  for (const city of cities) {
    const target = join(OUT, `${city.id}.webp`);
    if (!existsSync(target)) {
      try {
        const source = await download(city.id, thumbUrl(city.imageUrl));
        raw += statSync(source).size;
        encode(source, target);
        await new Promise((resolve) => setTimeout(resolve, 40));
      } catch (error) {
        failed += 1;
        console.log(`${city.id}: ${(error as Error).message}`);
        continue;
      }
    }
    encoded += statSync(target).size;
  }
  console.log(`thumbs: ${cities.length} cities, ${failed} failed`);
  console.log(`downloaded: ${(raw / 1024 / 1024).toFixed(2)} MB`);
  console.log(`bundle: ${(encoded / 1024 / 1024).toFixed(2)} MB (${(encoded / cities.length / 1024).toFixed(1)} KB each)`);
}

void main();
