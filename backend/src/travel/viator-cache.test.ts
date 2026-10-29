import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetViatorCityCache, viatorNearestCity, type ViatorCity } from './viator';

interface RawRow {
  destinationId: number;
  name: string;
  type: string;
  iata: string | null;
  lat: number | null;
  lng: number | null;
}

const ROWS: RawRow[] = [
  { destinationId: 1, name: 'Poznan', type: 'CITY', iata: 'POZ', lat: 52.4064, lng: 16.9252 },
  { destinationId: 2, name: 'Warsaw', type: 'CITY', iata: 'WAW', lat: 52.2297, lng: 21.0122 },
  { destinationId: 3, name: 'Berlin', type: 'CITY', iata: 'BER', lat: 52.52, lng: 13.405 },
  { destinationId: 4, name: 'NoIata', type: 'CITY', iata: null, lat: 52.4, lng: 16.9 },
  { destinationId: 5, name: 'NoCoords', type: 'CITY', iata: 'XXX', lat: null, lng: null },
  { destinationId: 6, name: 'Region', type: 'REGION', iata: 'RGN', lat: 52.4, lng: 16.9 },
];

function eligible(row: RawRow): row is RawRow & { lat: number; lng: number } {
  return row.type === 'CITY' && row.iata !== null && row.lat !== null && row.lng !== null;
}

function toCity(row: RawRow & { lat: number; lng: number }): ViatorCity {
  return { destinationId: row.destinationId, name: row.name, lat: row.lat, lng: row.lng };
}

function legacyNearest(lat: number, lng: number): ViatorCity | null {
  let best: ViatorCity | null = null;
  let bestDist = Infinity;
  for (const row of ROWS) {
    if (!eligible(row)) continue;
    const dist = (row.lat - lat) ** 2 + (row.lng - lng) ** 2;
    if (dist >= bestDist) continue;
    best = toCity(row);
    bestDist = dist;
  }
  return best;
}

function fakeDb(count: { all: number; first: number }): D1Database {
  const statement = {
    all: async () => {
      count.all += 1;
      return { results: ROWS.filter(eligible).map(toCity) };
    },
    bind: (lat: number, lng: number) => ({
      all: async () => {
        count.all += 1;
        return { results: ROWS.filter(eligible).map(toCity) };
      },
      first: async () => {
        count.first += 1;
        return legacyNearest(lat, lng);
      },
    }),
  };
  return { prepare: () => statement } as unknown as D1Database;
}

const POINTS: Array<[number, number]> = [
  [52.4064, 16.9252],
  [52.23, 21.01],
  [52.0, 17.0],
  [51.0, 10.0],
];

test('viatorNearestCity: cache matches the D1 query on a sample', async () => {
  resetViatorCityCache();
  const count = { all: 0, first: 0 };
  const db = fakeDb(count);
  for (const [lat, lng] of POINTS) {
    assert.deepEqual(await viatorNearestCity(db, lat, lng), legacyNearest(lat, lng));
  }
});

test('viatorNearestCity: repeated calls read D1 once, reset re-reads', async () => {
  resetViatorCityCache();
  const count = { all: 0, first: 0 };
  const db = fakeDb(count);
  await viatorNearestCity(db, 52.4, 16.9);
  await viatorNearestCity(db, 52.23, 21.01);
  await viatorNearestCity(db, 51.0, 10.0);
  assert.equal(count.all, 1);
  resetViatorCityCache();
  await viatorNearestCity(db, 52.4, 16.9);
  assert.equal(count.all, 2);
});

test('viatorNearestCity: empty catalogue is null', async () => {
  resetViatorCityCache();
  const db = {
    prepare: () => ({ all: async () => ({ results: [] }) }),
  } as unknown as D1Database;
  assert.equal(await viatorNearestCity(db, 52.4, 16.9), null);
  resetViatorCityCache();
});
