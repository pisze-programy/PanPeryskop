import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESTAURANTS } from '../src/seed/manual/restaurants';

test('restaurants: curated list shape', () => {
  assert.equal(RESTAURANTS.length, 49);
  const ids = new Set(RESTAURANTS.map((r) => r.id));
  assert.equal(ids.size, RESTAURANTS.length, 'ids are unique');
  for (const r of RESTAURANTS) {
    assert.ok(['1*', '2*', '3*', 'bib'].includes(r.award), `${r.name}: award`);
    assert.ok(r.website.startsWith('https://'), `${r.name}: https website`);
    assert.ok(r.lat > 49 && r.lat < 55, `${r.name}: lat in Poland`);
    assert.ok(r.lng > 14 && r.lng < 24.2, `${r.name}: lng in Poland`);
    assert.ok(r.name.trim().length > 0 && r.city.trim().length > 0, `${r.name}: name + city`);
  }
});

test('restaurants: 11 starred + 38 Bib Gourmand', () => {
  const starred = RESTAURANTS.filter((r) => r.award !== 'bib').length;
  assert.equal(starred, 11);
  assert.equal(RESTAURANTS.length - starred, 38);
});
