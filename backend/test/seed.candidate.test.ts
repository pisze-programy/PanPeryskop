import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidate, isProviderId } from '../src/seed/core/candidate';
import { ProviderId } from '../src/seed/core/types';

const base = {
  externalId: 'going-1',
  title: 'Koncert',
  startMs: 1_700_000_000_000,
  link: 'https://x/event',
  mediaUrl: 'https://cdn/x.jpg',
};

test('parseCandidate: accepts a minimal valid candidate and keeps nulls null', () => {
  const r = parseCandidate(base, ProviderId.GOING, 0);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.cand.externalId, 'going-1');
  assert.equal(r.cand.price, null);
  assert.equal(r.cand.thumbUrl, null);
  assert.equal(r.cand.partnerId, undefined);
});

test('parseCandidate: rejects each missing required field with a reason', () => {
  for (const field of ['externalId', 'title', 'startMs', 'link', 'mediaUrl'] as const) {
    const r = parseCandidate({ ...base, [field]: undefined }, ProviderId.GOING, 3);
    assert.equal(r.ok, false, `${field} must be rejected`);
    if (!r.ok) assert.match(r.reason, new RegExp(`#3: missing`));
  }
});

test('parseCandidate: rejects a non-positive or non-finite date (no epoch)', () => {
  assert.equal(parseCandidate({ ...base, startMs: 0 }, ProviderId.GOING, 0).ok, false);
  assert.equal(parseCandidate({ ...base, startMs: -1 }, ProviderId.GOING, 0).ok, false);
  assert.equal(parseCandidate({ ...base, startMs: NaN }, ProviderId.GOING, 0).ok, false);
});

test('parseCandidate: rejects malformed optional arrays instead of guessing', () => {
  assert.equal(parseCandidate({ ...base, tags: [1, 2] }, ProviderId.GOING, 0).ok, false);
  assert.equal(parseCandidate({ ...base, times: 'x' }, ProviderId.GOING, 0).ok, false);
  assert.equal(parseCandidate({ ...base, showtimeBooking: [{ time: '20:00' }] }, ProviderId.GOING, 0).ok, false);
});

test('parseCandidate: keeps price null distinct from 0', () => {
  const withNull = parseCandidate({ ...base, price: null }, ProviderId.GOING, 0);
  const withZero = parseCandidate({ ...base, price: 0 }, ProviderId.GOING, 0);
  assert.equal(withNull.ok && withNull.cand.price, null);
  assert.equal(withZero.ok && withZero.cand.price, 0);
});

test('isProviderId: only known provider ids pass', () => {
  assert.equal(isProviderId('going'), true);
  assert.equal(isProviderId('nope'), false);
});
