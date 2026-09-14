import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWindowFromCheapest, type CheapestDay } from '../src/travel/flightsApi';
import { haversineKm, windowHasFlights } from '../src/travel/reachability';

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

test('windowHasFlights: needs ≥1 day before AND ≥1 day after the event (strict)', () => {
  const event = '2026-09-10';
  assert.equal(windowHasFlights(new Set(['2026-09-07', '2026-09-11']), event), true);
  assert.equal(windowHasFlights(new Set(['2026-09-07']), event), false);          // no return day
  assert.equal(windowHasFlights(new Set(['2026-09-11']), event), false);          // no outbound day
  assert.equal(windowHasFlights(new Set(['2026-09-10', '2026-09-11']), event), false); // event-day flight alone is not enough
});