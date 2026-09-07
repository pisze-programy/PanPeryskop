import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedDue } from '../src/seed/cadence';

const TODAY = '2026-09-07';

test('seedDue: never seeded → due (bootstrap)', () => {
  assert.equal(seedDue(null, TODAY), true);
});

test('seedDue: due only after >= 3 days since the last seed', () => {
  assert.equal(seedDue('2026-09-07', '2026-09-07'), false);
  assert.equal(seedDue('2026-09-06', '2026-09-07'), false);
  assert.equal(seedDue('2026-09-05', '2026-09-07'), false);
  assert.equal(seedDue('2026-09-04', '2026-09-07'), true);
  assert.equal(seedDue('2026-09-01', '2026-09-07'), true);
});