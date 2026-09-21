import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epochDay, dateOfEpochDay, packMask, unpackMask, maskHas, buildRouteList, buildDueRoutes, saveRouteDays, routeId } from '../src/travel/routeDays';
import { monthsBetween, monthDays, buildMonthWindow } from '../src/travel/flightsApi';
import { reachableEvents, type TravelEventRow } from '../src/travel/reachability';
import { destinationsFrom, canonicalIata } from '../src/travel/airports';

test('airports: a multi-code airport appears once in the destination list', () => {
  // EuroAirport Basel Mulhouse Freiburg: Ryanair lists BSL, Wizzair lists MLH.
  assert.equal(canonicalIata('MLH'), 'BSL');
  const codes = destinationsFrom('POZ').map((d) => d.iata);
  assert.ok(codes.includes('BSL'), 'POZ flies to Basel');
  assert.ok(!codes.includes('MLH'), 'MLH is the same airport as BSL');
});

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

test('airports: no origin lists the same physical airport twice', () => {
  for (const origin of ['POZ', 'WAW', 'WMI', 'KRK', 'WRO', 'GDN', 'KTW', 'SZZ']) {
    const dests = destinationsFrom(origin);
    for (let i = 0; i < dests.length; i++) {
      for (let j = i + 1; j < dests.length; j++) {
        const km = distanceKm(dests[i].lat, dests[i].lng, dests[j].lat, dests[j].lng);
        assert.ok(km > 2, `${origin}: ${dests[i].iata} and ${dests[j].iata} are ${km.toFixed(1)} km apart`);
      }
    }
  }
});

test('flights: monthDays covers every day, including leap February', () => {
  assert.deepEqual(monthDays('2026-10-01').length, 31);
  assert.equal(monthDays('2026-10-01')[0], '2026-10-01');
  assert.equal(monthDays('2026-10-01')[30], '2026-10-31');
  assert.equal(monthDays('2026-09-01').length, 30);
  assert.equal(monthDays('2026-02-01').length, 28);
  assert.equal(monthDays('2028-02-01').length, 29);
});

test('flights: buildMonthWindow emits one cell per day', () => {
  const cell = (day: string): { date: string; hour: string | null; price: number | null } => ({
    date: day, hour: null, price: day === '2026-09-15' ? 99 : null,
  });
  const window = buildMonthWindow('2026-09-01', cell, cell);
  assert.equal(window.outbound.length, 30);
  assert.equal(window.returning.length, 30);
  assert.equal(window.outbound.find((c) => c.price === 99)?.date, '2026-09-15');
});

test('routeDays: epoch day round-trips', () => {
  assert.equal(dateOfEpochDay(epochDay('2026-10-15')), '2026-10-15');
  assert.equal(epochDay('1970-01-01'), 0);
});

test('routeDays: bitmask packs, unpacks and tests days', () => {
  const start = epochDay('2026-10-01');
  const days = ['2026-10-01', '2026-10-15', '2026-11-20'];
  const mask = packMask(days, start, 90);
  assert.deepEqual([...unpackMask(mask, start, 90)].sort(), days);
  assert.ok(maskHas(mask, start, 90, '2026-10-15'));
  assert.ok(!maskHas(mask, start, 90, '2026-10-16'));
  // Days outside the horizon are dropped, not wrapped.
  const far = packMask(['2027-05-01'], start, 90);
  assert.deepEqual([...unpackMask(far, start, 90)], []);
});

test('routeDays: monthsBetween covers the whole horizon', () => {
  assert.deepEqual(monthsBetween('2026-10-15', '2027-01-12'), ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01']);
  assert.deepEqual(monthsBetween('2026-10-01', '2026-10-30'), ['2026-10-01']);
});

test('routeDays: the route list is unique and covers every origin', () => {
  const routes = buildRouteList();
  assert.ok(routes.length > 500, `expected the full route set, got ${routes.length}`);
  const ids = new Set(routes.map(routeId));
  assert.equal(ids.size, routes.length, 'one row per (origin, dest, carrier)');
  assert.ok(routes.some((r) => r.origin === 'POZ'));
  assert.ok(routes.every((r) => r.carrier === 'ryanair' || r.carrier === 'wizzair'));
});

/** Minimal D1 stub: only the route_days read that loadRouteDays uses. */
function routeDaysDb(rows: { origin: string; dest: string; carrier: string; horizon_start: number; horizon_days: number; mask: string }[]): D1Database {
  return {
    prepare: () => ({
      bind: (...args: unknown[]) => ({
        all: async () => ({
          results: rows.filter((r) => r.origin === args[0] && (args.slice(1) as string[]).includes(r.dest)),
        }),
      }),
    }),
  } as unknown as D1Database;
}

test('reachableEvents: reads the materialized table and never calls a provider', async () => {
  const origin = 'POZ';
  const dest = destinationsFrom(origin).find((d) => d.providers.has('ryanair'));
  assert.ok(dest, 'POZ needs a Ryanair destination for this test');

  const eventDay = '2026-10-15';
  const start = epochDay('2026-10-01');
  const mask = packMask([`${eventDay}`.replace('15', '14'), `${eventDay}`.replace('15', '16')], start, 90);

  const db = routeDaysDb([
    { origin, dest: dest.iata, carrier: 'ryanair', horizon_start: start, horizon_days: 90, mask },
  ]);
  const event: TravelEventRow = {
    provider: 'test', external_id: '1', title: 'x',
    lat: dest.lat, lng: dest.lng, city: dest.city, country: dest.country,
    start_ms: Date.parse(`${eventDay}T12:00:00Z`), tag: 'pilka-nozna', link: null,
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('a provider call is not allowed on the read path');
  }) as typeof fetch;
  try {
    const result = await reachableEvents(origin, [event], db);
    assert.equal(result.events.length, 1);
    assert.deepEqual(result.events[0].reachableAirports, [dest.iata]);
    assert.deepEqual(result.events[0].reachableCarriers[dest.iata], ['ryanair']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

interface MemoryRow {
  origin: string;
  dest: string;
  carrier: string;
  horizon_start: number;
  horizon_days: number;
  mask: string;
  fetched_at: number;
}

function memoryDb(): D1Database {
  const rows = new Map<string, MemoryRow>();
  return {
    prepare: (sql: string) => {
      const statement = (...args: unknown[]) => ({
        run: async () => {
          if (sql.includes('INSERT INTO route_days')) {
            const [origin, dest, carrier, horizonStart, horizonDays, mask, fetchedAt] = args as [string, string, string, number, number, string, number];
            rows.set(`${origin}|${dest}|${carrier}`, { origin, dest, carrier, horizon_start: horizonStart, horizon_days: horizonDays, mask, fetched_at: fetchedAt });
          }
          return { meta: { changes: 1 } };
        },
        all: async () => ({ results: [...rows.values()] }),
        first: async () => null,
      });
      return { ...statement(), bind: (...args: unknown[]) => statement(...args) };
    },
    batch: async (statements: { run: () => Promise<unknown> }[]) => {
      for (const statement of statements) await statement.run();
      return [];
    },
  } as unknown as D1Database;
}

test('routeDays: every route is due, then saved, then not due', async () => {
  const db = memoryDb();
  const due = await buildDueRoutes(db, 5000);
  assert.ok(due.length > 500, `expected the full route set, got ${due.length}`);
  await saveRouteDays(db, due.map((route) => ({ ...route, days: ['2026-10-15'] })));
  assert.equal((await buildDueRoutes(db, 5000)).length, 0);
});
