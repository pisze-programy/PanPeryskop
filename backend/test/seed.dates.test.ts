import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysWarsaw, warsawDateOf } from '../src/seed/core/dates';

test('dates: addDaysWarsaw rolls over month/year boundaries', () => {
  assert.equal(addDaysWarsaw('2026-08-17', 3), '2026-08-20');
  assert.equal(addDaysWarsaw('2026-08-31', 1), '2026-09-01');
  assert.equal(addDaysWarsaw('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysWarsaw('2026-08-17', 0), '2026-08-17');
});

test('dates: warsawDateOf returns the Warsaw calendar day (CEST, summer)', () => {
  // 2026-08-17T22:00:00Z = 2026-08-18 00:00 CEST.
  assert.equal(warsawDateOf(Date.parse('2026-08-17T22:00:00Z')), '2026-08-18');
  // 2026-08-17T04:00:00Z = 2026-08-17 06:00 CEST (event created_at for day 17).
  assert.equal(warsawDateOf(Date.parse('2026-08-17T04:00:00Z')), '2026-08-17');
});

test('dates: warsawDateOf handles CET (winter) offset', () => {
  // 2026-12-17T23:30:00Z = 2026-12-18 00:30 CET.
  assert.equal(warsawDateOf(Date.parse('2026-12-17T23:30:00Z')), '2026-12-18');
  // 2026-12-17T05:00:00Z = 2026-12-17 06:00 CET (event created_at for day 17, winter).
  assert.equal(warsawDateOf(Date.parse('2026-12-17T05:00:00Z')), '2026-12-17');
});
