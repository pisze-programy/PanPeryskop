import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface CityEntry {
  id: string;
  imageUrl: string;
  imageLargeUrl: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const THUMBS = join(HERE, '..', '..', 'ios', 'PanPeryskop', 'Resources', 'CityThumbs');

const CITIES: CityEntry[] = JSON.parse(
  readFileSync(join(HERE, '..', 'src', 'travel', 'data', 'cities.json'), 'utf8')
);

function size(url: string): { width: number; height: number } {
  const match = /[?&]w=(\d+)&h=(\d+)/.exec(url);
  assert.ok(match, `no w/h in ${url}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function photoId(url: string): string {
  return /photo-([0-9a-z-]+)/.exec(url)?.[1] ?? url;
}

test('every city photo is 2:1, the bundled thumb ratio', () => {
  for (const city of CITIES) {
    const card = size(city.imageUrl);
    assert.equal(card.width / card.height, 2, `${city.id} card is ${card.width}x${card.height}`);
    const hero = size(city.imageLargeUrl);
    assert.equal(hero.width / hero.height, 2, `${city.id} hero is ${hero.width}x${hero.height}`);
  }
});

test('every city has a bundled thumb', () => {
  const missing = CITIES.filter((city) => !existsSync(join(THUMBS, `${city.id}.webp`)));
  assert.deepEqual(missing.map((city) => city.id), [], 'a city without a thumb loads the network image on the map pin');
});

test('the bundle holds no thumb without a city', () => {
  const ids = new Set(CITIES.map((city) => city.id));
  const orphans = readdirSync(THUMBS)
    .filter((name) => name.endsWith('.webp'))
    .map((name) => name.replace(/\.webp$/, ''))
    .filter((id) => !ids.has(id));
  assert.deepEqual(orphans, [], 'a thumb without a city is dead weight in the app bundle');
});

test('the live API serves the same photo and ratio as the bundle source', { skip: !process.env.PP_LIVE_API }, async () => {
  const day = new Date().toISOString().slice(0, 10);
  const res = await fetch(`https://api.panperyskop.app/travel/cities?day=${day}`);
  assert.equal(res.ok, true, `the API answered ${res.status}`);
  const body = (await res.json()) as { cities: CityEntry[] };
  const live = new Map(body.cities.map((city) => [city.id, city]));

  for (const city of CITIES) {
    const served = live.get(city.id);
    assert.ok(served, `${city.id} is missing from the API`);
    assert.equal(photoId(served.imageUrl), photoId(city.imageUrl), `${city.id} card photo`);
    assert.equal(photoId(served.imageLargeUrl), photoId(city.imageUrl), `${city.id} hero photo`);
    const card = size(served.imageUrl);
    assert.equal(card.width / card.height, 2, `${city.id} card is ${card.width}x${card.height}`);
  }
});
