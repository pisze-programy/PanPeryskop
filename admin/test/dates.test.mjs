import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warsawMidnightMs, parseCreatedAt } from '../src/seed/dates.mjs';

// ---------- warsawMidnightMs ----------

test('warsawMidnightMs: CEST (summer) → previous-day 22:00Z', () => {
  // Warsaw is UTC+2 in summer; midnight local = 22:00Z the day before.
  assert.equal(new Date(warsawMidnightMs('2026-08-05')).toISOString(), '2026-08-04T22:00:00.000Z');
});

test('warsawMidnightMs: CET (winter) → previous-day 23:00Z', () => {
  // Warsaw is UTC+1 in winter; midnight local = 23:00Z the day before.
  assert.equal(new Date(warsawMidnightMs('2026-01-01')).toISOString(), '2025-12-31T23:00:00.000Z');
});

test('warsawMidnightMs: DST spring-forward and fall-back boundaries', () => {
  assert.equal(new Date(warsawMidnightMs('2026-03-29')).toISOString(), '2026-03-28T23:00:00.000Z'); // still CET
  assert.equal(new Date(warsawMidnightMs('2026-10-25')).toISOString(), '2026-10-24T22:00:00.000Z'); // still CEST
});

test('warsawMidnightMs: result formats back to the same Warsaw calendar date', () => {
  for (const d of ['2026-01-01', '2026-03-29', '2026-06-15', '2026-08-05', '2026-10-25', '2026-12-31']) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
    });
    assert.equal(fmt.format(new Date(warsawMidnightMs(d))), d);
  }
});

// ---------- parseCreatedAt ----------

test('parseCreatedAt: date-only resolves to Warsaw midnight', () => {
  assert.equal(parseCreatedAt('2026-08-05', 0), warsawMidnightMs('2026-08-05'));
});

test('parseCreatedAt: full timestamp parses as-is (offset preserved)', () => {
  const ms = parseCreatedAt('2026-08-05T06:00:00+02:00', 0);
  assert.equal(ms, Date.parse('2026-08-05T06:00:00+02:00'));
});

test('parseCreatedAt: non-string returns `now`', () => {
  assert.equal(parseCreatedAt(undefined, 123), 123);
  assert.equal(parseCreatedAt(null, 456), 456);
  assert.equal(parseCreatedAt(789, 999), 999);
});

test('parseCreatedAt: unparseable string throws with the value in the message', () => {
  assert.throws(() => parseCreatedAt('not-a-date', 0), /Invalid created_at: not-a-date/);
});