import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWindowFromCheapest, fetchWizzairWindow, type CheapestDay } from '../src/travel/flightsApi';
import { haversineKm, nearbyCandidates, reachableCarriers, windowHasFlights, type TravelEventRow } from '../src/travel/reachability';
import type { Destination } from '../src/travel/airports';

function dest(iata: string, lat: number, lng: number): Destination {
  return { iata, name: iata, city: iata, country: '', countryCode: '', lat, lng, providers: new Set(['ryanair']) };
}

function event(lat: number, lng: number): TravelEventRow {
  return { provider: 'test', external_id: '1', title: 'x', lat, lng, city: 'x', country: 'x', start_ms: 0, tag: 'x', link: null };
}

function day(day: string, price: number | null, opts: Partial<CheapestDay> = {}): CheapestDay {
  return { day, departureDate: `${day}T09:30:00`, price, unavailable: false, soldOut: false, ...opts };
}

test('buildWindowFromCheapest: slices outbound D-7..D-1 and return D+1..D+7', () => {
  const out = new Map<string, CheapestDay>([
    ['2026-09-08', day('2026-09-08', 95)],
  ]);
  const ret = new Map<string, CheapestDay>([
    ['2026-09-12', day('2026-09-12', 90)],
  ]);
  const w = buildWindowFromCheapest('2026-09-10', out, ret);
  assert.deepEqual(w.outbound.map((c) => c.date), [
    '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09',
  ]);
  assert.deepEqual(w.returning.map((c) => c.date), [
    '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
  ]);
  const d8 = w.outbound.find((c) => c.date === '2026-09-08')!;
  assert.equal(d8.price, 95);
  assert.equal(d8.hour, '09:30'); // destination-local departure hour
});

test('buildWindowFromCheapest: missing / unavailable / soldOut days become price null', () => {
  const out = new Map<string, CheapestDay>([
    ['2026-09-07', day('2026-09-07', 120)],
    // 09-08: no fare at all
    ['2026-09-09', day('2026-09-09', 100, { soldOut: true })],
  ]);
  const w = buildWindowFromCheapest('2026-09-10', out, new Map());
  const cell = (d: string) => w.outbound.find((c) => c.date === d)!;
  assert.equal(cell('2026-09-07').price, 120);
  assert.equal(cell('2026-09-08').price, null);
  assert.equal(cell('2026-09-08').hour, null);
  assert.equal(cell('2026-09-09').price, null); // sold out counts as no fare
  assert.deepEqual(w.returning.map((c) => c.price), [null, null, null, null, null, null, null]);
});

test('buildWindowFromCheapest: window spanning a month boundary merges both months', () => {
  const out = new Map<string, CheapestDay>([
    ['2026-08-30', day('2026-08-30', 40)],
    ['2026-08-31', day('2026-08-31', 45)],
    ['2026-09-01', day('2026-09-01', 50)],
  ]);
  const w = buildWindowFromCheapest('2026-09-02', out, new Map());
  assert.deepEqual(w.outbound.map((c) => c.date), [
    '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01',
  ]);
  assert.deepEqual(w.outbound.map((c) => c.price), [null, null, null, null, 40, 45, 50]);
});

test('haversineKm: nearby vs distant airports', () => {
  // WAW → Łódź (Lodz Władysław Reymont) ≈ 120 km
  assert.ok(haversineKm(52.1657, 20.9671, 51.7592, 19.456) < 200);
  // WAW → Berlin ≈ 520 km
  assert.ok(haversineKm(52.1657, 20.9671, 52.3667, 13.5033) > 200);
});

test('reachableCarriers: only carriers with both outbound and return days', () => {
  const both = { ryanair: new Set(['2026-09-07', '2026-09-11']), wizzair: new Set(['2026-09-07', '2026-09-11']) };
  assert.deepEqual(reachableCarriers(both, '2026-09-10'), ['ryanair', 'wizzair']);

  const outboundOnly = { ryanair: new Set(['2026-09-07']), wizzair: new Set(['2026-09-07', '2026-09-11']) };
  assert.deepEqual(reachableCarriers(outboundOnly, '2026-09-10'), ['wizzair']);

  const none = { ryanair: new Set(['2026-09-10']), wizzair: new Set<string>() };
  assert.deepEqual(reachableCarriers(none, '2026-09-10'), []);
});

test('windowHasFlights: needs ≥1 day before AND ≥1 day after the event (strict)', () => {
  const event = '2026-09-10';
  assert.equal(windowHasFlights(new Set(['2026-09-07', '2026-09-11']), event), true);
  assert.equal(windowHasFlights(new Set(['2026-09-07']), event), false);          // no return day
  assert.equal(windowHasFlights(new Set(['2026-09-11']), event), false);          // no outbound day
  assert.equal(windowHasFlights(new Set(['2026-09-10', '2026-09-11']), event), false); // event-day flight alone is not enough
});

test('nearbyCandidates: only airports within 200 km of an event, once each', () => {
  const candidates = [
    dest('LCJ', 51.7219, 19.3981),   // ~120 km from Warsaw
    dest('BER', 52.3667, 13.5033),   // ~520 km from Warsaw
    dest('WMI', 52.4511, 20.6517),   // ~40 km from Warsaw
  ];
  const nearby = nearbyCandidates(candidates, [event(52.1657, 20.9671)]);
  assert.deepEqual(nearby.map((d) => d.iata).sort(), ['LCJ', 'WMI']);
});

test('nearbyCandidates: a distant-only day needs no fare lookup at all', () => {
  const candidates = [dest('BER', 52.3667, 13.5033)];
  assert.deepEqual(nearbyCandidates(candidates, [event(35.33, 25.1)]), []);
});

test('nearbyCandidates: two events sharing an airport keep it once', () => {
  const candidates = [dest('WMI', 52.4511, 20.6517)];
  const nearby = nearbyCandidates(candidates, [event(52.1657, 20.9671), event(52.4, 16.9)]);
  assert.equal(nearby.length, 1);
});
/** Minimal D1 stub: only the flight_cache read/write path `cachedJson` uses. */
function flightCacheDb(rows: Record<string, string>): D1Database {
  let key = '';
  const statement = {
    bind: (...args: unknown[]) => {
      key = String(args[0] ?? '');
      return {
        first: async () => (rows[key] !== undefined ? { payload: rows[key] } : null),
        run: async () => ({ meta: { changes: 1 } }),
        all: async () => ({ results: [] }),
      };
    },
    first: async () => null,
    run: async () => ({ meta: { changes: 1 } }),
    all: async () => ({ results: [] }),
  };
  return { prepare: () => statement } as unknown as D1Database;
}

test('wizzair: a cached failure marker never blocks a recovered upstream', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = (async () => {
    upstreamCalls += 1;
    return new Response(JSON.stringify({
      outboundFlights: [
        { departureDate: '2026-11-28T00:00:00', priceType: 'price', price: { amount: 199 }, departureDates: ['2026-11-28T10:00:00'] },
      ],
      returnFlights: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    // Both window months are marked as failed, but the upstream is healthy again.
    const db = flightCacheDb({
      'wizz:version': JSON.stringify('29.17.0'),
      'wizz:POZ:LTN:2026-11-01': JSON.stringify({ __failed: true }),
      'wizz:POZ:LTN:2026-12-01': JSON.stringify({ __failed: true }),
    });
    const window = await fetchWizzairWindow('POZ', 'LTN', '2026-12-01', db);
    assert.ok(upstreamCalls > 0, 'the marker must not skip the upstream fetch');
    assert.ok(window.outbound.some((cell) => cell.price === 199), 'recovered data reaches the window');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
