import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITY_ENTRIES, cityBreakForDay } from '../src/travel/cities';
import { epochDay, packMask } from '../src/travel/routeDays';

const TIERS = new Set(['metropolis', 'large', 'medium']);

test('cities: the generated list is clean', () => {
  assert.ok(CITY_ENTRIES.length > 100, `expected the top-tier extract, got ${CITY_ENTRIES.length}`);
  const ids = new Set(CITY_ENTRIES.map((c) => c.id));
  assert.equal(ids.size, CITY_ENTRIES.length, 'one row per Urban Audit code');
  for (const city of CITY_ENTRIES) {
    assert.ok(TIERS.has(city.tier), `${city.name}: unexpected tier ${city.tier}`);
    assert.ok(city.tierRank >= 1 && city.tierRank <= 3, `${city.name}: tier rank out of range`);
    assert.ok(city.lat > -90 && city.lat < 90, `${city.name}: bad latitude`);
    assert.ok(city.lng > -180 && city.lng < 180, `${city.name}: bad longitude`);
    // A missing GISCO point must be dropped, not stored as 0,0.
    assert.ok(city.lat !== 0 || city.lng !== 0, `${city.name}: null island`);
  }
  const withAirport = CITY_ENTRIES.filter((c) => c.airports.length > 0);
  assert.ok(withAirport.length > CITY_ENTRIES.length * 0.9, 'almost every city needs a nearby airport');
  assert.ok(CITY_ENTRIES.some((c) => c.airports.includes('KRK')), 'Krakow maps to its own airport');
});

interface RouteRow {
  dest: string;
  carrier: string;
  horizon_start: number;
  horizon_days: number;
  mask: string;
}

function citiesDb(routes: RouteRow[]): D1Database {
  return {
    prepare: (sql: string) => {
      const all = async () => {
        if (sql.includes('FROM route_days')) return { results: routes };
        return {
          results: [
            {
              id: 'FR001C', name: 'Paris', country: 'France', country_code: 'FR',
              lat: 48.84, lng: 2.31, tier: 'metropolis', tier_rank: 1,
              airports: JSON.stringify(['ORY', 'BVA', 'XCR']),
            },
            {
              id: 'XX001C', name: 'Nowhere', country: 'France', country_code: 'FR',
              lat: 45, lng: 2, tier: 'medium', tier_rank: 3,
              airports: JSON.stringify(['ZZZ']),
            },
          ],
        };
      };
      return { all, bind: () => ({ all }) };
    },
  } as unknown as D1Database;
}

test('cities: reachability comes from route_days, not a provider', async () => {
  const day = '2026-10-15';
  const start = epochDay('2026-10-01');
  const db = citiesDb([
    { dest: 'ORY', carrier: 'wizzair', horizon_start: start, horizon_days: 90, mask: packMask([day], start, 90) },
    { dest: 'BVA', carrier: 'ryanair', horizon_start: start, horizon_days: 90, mask: packMask([day], start, 90) },
  ]);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('a provider call is not allowed on the read path');
  }) as typeof fetch;
  try {
    const { cities, airports } = await cityBreakForDay(db, ['POZ'], day);
    const paris = cities.find((c) => c.id === 'FR001C');
    assert.ok(paris, 'Paris must be in the answer');
    assert.equal(paris.reachable, true);
    assert.deepEqual(paris.connections.map((c) => c.iata).sort(), ['BVA', 'ORY']);
    assert.deepEqual(paris.connections.find((c) => c.iata === 'BVA')?.carriers, ['ryanair']);

    const nowhere = cities.find((c) => c.id === 'XX001C');
    assert.equal(nowhere?.reachable, false);
    assert.deepEqual(nowhere?.connections, []);

    assert.deepEqual(airports, [
      { iata: 'BVA', carriers: ['ryanair'] },
      { iata: 'ORY', carriers: ['wizzair'] },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cities: a route outside the horizon day is not reachable', async () => {
  const start = epochDay('2026-10-01');
  const db = citiesDb([
    { dest: 'ORY', carrier: 'wizzair', horizon_start: start, horizon_days: 90, mask: packMask(['2026-10-15'], start, 90) },
  ]);
  const { cities, airports } = await cityBreakForDay(db, ['POZ'], '2026-10-16');
  assert.equal(cities.find((c) => c.id === 'FR001C')?.reachable, false);
  assert.deepEqual(airports, []);
});

test('cities: no origins means nothing is reachable', async () => {
  const start = epochDay('2026-10-01');
  const db = citiesDb([
    { dest: 'ORY', carrier: 'wizzair', horizon_start: start, horizon_days: 90, mask: packMask(['2026-10-15'], start, 90) },
  ]);
  const { cities } = await cityBreakForDay(db, [], '2026-10-15');
  assert.ok(cities.every((c) => !c.reachable));
});
