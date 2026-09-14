import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaces, isPlaceKind } from '../src/travel/places';

test('buildPlaces: is deterministic and stays near the event', () => {
  const a = buildPlaces('hotel', 41.41, 2.2);
  const b = buildPlaces('hotel', 41.41, 2.2);
  assert.deepEqual(a, b);
  assert.ok(a.length > 3);
  for (const p of a) {
    assert.equal(p.kind, 'hotel');
    assert.ok(Math.abs(p.lat - 41.41) < 0.05);
    assert.ok(Math.abs(p.lng - 2.2) < 0.05);
    assert.ok(p.price > 0);
    assert.ok(/^https:\/\//.test(p.image));
  }
});

test('buildPlaces: hotels carry all three filter tiers', () => {
  const tiers = new Set(buildPlaces('hotel', 50, 20).map((p) => p.tier));
  assert.deepEqual([...tiers].sort(), ['economy', 'premium', 'recommended']);
  assert.equal(buildPlaces('attraction', 50, 20)[0].tier, undefined);
});

test('isPlaceKind: accepts the four kinds only', () => {
  for (const k of ['hotel', 'attraction', 'car', 'insurance']) assert.equal(isPlaceKind(k), true);
  assert.equal(isPlaceKind('flight'), false);
  assert.equal(isPlaceKind(''), false);
});
