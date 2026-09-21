import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITY_ENTRIES, cityBreakForDay } from '../src/travel/cities';
import { epochDay, packMask } from '../src/travel/routeDays';
import { destinationsFrom } from '../src/travel/airports';

test('cities: the generated list is clean', () => {
  assert.ok(CITY_ENTRIES.length > 300, `expected the full European list, got ${CITY_ENTRIES.length}`);
  const ids = new Set(CITY_ENTRIES.map((c) => c.id));
  assert.equal(ids.size, CITY_ENTRIES.length, 'one row per city slug');
  for (const city of CITY_ENTRIES) {
    assert.ok(city.namePl.length > 1, `${city.name}: no Polish name`);
    assert.ok(city.countryCode.length === 2, `${city.name}: bad country code`);
    assert.ok(city.bandRank >= 1 && city.bandRank <= 5, `${city.name}: band rank out of range`);
    assert.ok(city.costUsd > 0, `${city.name}: no cost`);
    assert.ok(city.lat > -90 && city.lat < 90, `${city.name}: bad latitude`);
    assert.ok(city.lng > -180 && city.lng < 180, `${city.name}: bad longitude`);
    assert.ok(city.imageUrl.startsWith('https://'), `${city.name}: no image`);
  }
  // The carriers name their own cities, so a small resort has no airport here.
  const withAirport = CITY_ENTRIES.filter((c) => c.airports.length > 0);
  assert.ok(withAirport.length > CITY_ENTRIES.length * 0.4, 'the main cities need their airport');
  assert.ok(CITY_ENTRIES.some((c) => c.airports.includes('KRK')), 'Krakow maps to its own airport');
  assert.ok(CITY_ENTRIES.some((c) => c.airports.includes('LGW')), 'London maps to its airports');
});

test('cities: a city reaches through the airports around it', () => {
  const milan = CITY_ENTRIES.find((c) => c.name === 'Milan');
  assert.ok(milan, 'Milan must be in the list');
  assert.ok(milan.airports.includes('BGY'), 'Milan reaches through Bergamo');
  const paris = CITY_ENTRIES.find((c) => c.name === 'Paris');
  assert.ok(paris?.airports.includes('ORY'), 'Paris reaches through Orly');
  const rome = CITY_ENTRIES.find((c) => c.name === 'Rome');
  assert.ok(rome?.airports.includes('CIA') && rome?.airports.includes('FCO'), 'Rome has both airports');

  // The regression: Poznan flies to Bergamo, so Milan must be reachable from it.
  const poz = new Set(destinationsFrom('POZ').map((d) => d.iata));
  assert.ok(milan.airports.some((a) => poz.has(a)), 'POZ has a flight to Milan');

  const withoutAirport = CITY_ENTRIES.filter((c) => c.airports.length === 0);
  assert.ok(withoutAirport.length > 0, 'a few small cities have no airport');
  assert.ok(withoutAirport.length < CITY_ENTRIES.length * 0.2, 'but not many');
});

test('cities: the cost bands cover every rank and the dearest leads', () => {
  const bands = new Set(CITY_ENTRIES.map((c) => c.bandRank));
  assert.deepEqual([...bands].sort(), [1, 2, 3, 4, 5], 'all five bands are used');
  const dearest = CITY_ENTRIES.reduce((a, b) => (a.costUsd >= b.costUsd ? a : b));
  assert.equal(dearest.bandRank, 1, 'the dearest city is in band 1');
  const cheapest = CITY_ENTRIES.reduce((a, b) => (a.costUsd <= b.costUsd ? a : b));
  assert.equal(cheapest.bandRank, 5, 'the cheapest city is in band 5');
});

test('cities: the neighbour lists hold city ids', () => {
  const ids = new Set(CITY_ENTRIES.map((c) => c.id));
  const withNear = CITY_ENTRIES.filter((c) => c.nearby.length > 0);
  assert.ok(withNear.length > CITY_ENTRIES.length * 0.9, 'almost every city has neighbours');
  for (const city of withNear) {
    assert.ok(!city.nearby.includes(city.id), `${city.name}: lists itself`);
    assert.ok(city.nearby.some((id) => ids.has(id)), `${city.name}: no known neighbour`);
  }
});

interface RouteRow {
  dest: string;
  carrier: string;
  horizon_start: number;
  horizon_days: number;
  mask: string;
}

function cityRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'x', name: 'X', name_pl: 'X', country: 'France', country_code: 'FR',
    lat: 45, lng: 2, band_rank: 3, cost_usd: 1200, population: 100000,
    airports: '[]',
    image_url: 'https://example.test/x.jpg', image_large_url: 'https://example.test/xl.jpg',
    video_url: null, nearby: '[]', next: '[]', similar: '[]',
    facts: JSON.stringify(CITY_ENTRIES[0].facts),
    ...overrides,
  };
}

function citiesDb(routes: RouteRow[]): D1Database {
  return {
    prepare: (sql: string) => {
      const all = async () => {
        if (sql.includes('FROM route_days')) return { results: routes };
        return {
          results: [
            cityRow({ id: 'paris-france', name: 'Paris', name_pl: 'Paryż', airports: JSON.stringify(['ORY', 'BVA', 'XCR']) }),
            cityRow({ id: 'nowhere-france', name: 'Nowhere', name_pl: 'Nigdzie', airports: JSON.stringify(['ZZZ']) }),
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
    const paris = cities.find((c) => c.id === 'paris-france');
    assert.ok(paris, 'Paris must be in the answer');
    assert.equal(paris.namePl, 'Paryż');
    assert.equal(paris.reachable, true);
    assert.deepEqual(paris.connections.map((c) => c.iata).sort(), ['BVA', 'ORY']);
    assert.deepEqual(paris.connections.find((c) => c.iata === 'BVA')?.carriers, ['ryanair']);

    const nowhere = cities.find((c) => c.id === 'nowhere-france');
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
  assert.equal(cities.find((c) => c.id === 'paris-france')?.reachable, false);
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
