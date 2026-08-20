import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTags, CANONICAL_TAGS, CANONICAL_TAG_SET } from '../src/seed/core/tags';
import { ProviderId } from '../src/seed/core/types';

test('tags: canonical set is closed and small', () => {
  assert.deepEqual(CANONICAL_TAGS, ['filmy', 'muzyka', 'meetup', 'komedia']);
  assert.equal(CANONICAL_TAG_SET.size, CANONICAL_TAGS.length);
});

test('tags: cinemas are always filmy', () => {
  for (const src of [ProviderId.HELIOS, ProviderId.MULTIKINO, ProviderId.CINEMACITY]) {
    assert.deepEqual(normalizeTags({ source: src }), ['filmy']);
  }
});

test('tags: meetup + luma are always meetup', () => {
  assert.deepEqual(normalizeTags({ source: ProviderId.MEETUP }), ['meetup']);
  assert.deepEqual(normalizeTags({ source: ProviderId.LUMA }), ['meetup']);
});

test('tags: dzisapp categorySlugs map to the canonical set', () => {
  assert.deepEqual(normalizeTags({ source: ProviderId.DZISAPP, rawTags: ['koncert'] }), ['muzyka']);
  assert.deepEqual(normalizeTags({ source: ProviderId.DZISAPP, rawTags: ['komedia', 'standup'] }), ['komedia']);
  assert.deepEqual(normalizeTags({ source: ProviderId.DZISAPP, rawTags: ['sztuka'] }), []);
});

test('tags: going category names map to the canonical set', () => {
  assert.deepEqual(normalizeTags({ source: ProviderId.GOING, rawTags: ['Koncert'] }), ['muzyka']);
  assert.deepEqual(normalizeTags({ source: ProviderId.GOING, rawTags: ['Stand-up'] }), ['komedia']);
  assert.deepEqual(normalizeTags({ source: ProviderId.GOING, rawTags: ['Spotkanie'] }), []);
});

test('tags: kupbilecik listing path maps to the canonical set', () => {
  assert.deepEqual(normalizeTags({ source: ProviderId.KUPBILECIK, rawTags: ['/koncerty/?q='] }), ['muzyka']);
  assert.deepEqual(normalizeTags({ source: ProviderId.KUPBILECIK, rawTags: ['/kabarety/?q='] }), ['komedia']);
  assert.deepEqual(normalizeTags({ source: ProviderId.KUPBILECIK, rawTags: ['/festiwal/?q='] }), []);
});

test('tags: eventylive title heuristic (no structured category)', () => {
  assert.deepEqual(normalizeTags({ source: ProviderId.EVENTYLIVE, title: 'Wielki Koncert Chopinowski' }), ['muzyka']);
  assert.deepEqual(normalizeTags({ source: ProviderId.EVENTYLIVE, title: 'Stand-up z Rafałem' }), ['komedia']);
  assert.deepEqual(normalizeTags({ source: ProviderId.EVENTYLIVE, title: 'Spotkanie autorskie' }), []);
});

test('tags: deterministic and deduped', () => {
  const a = normalizeTags({ source: ProviderId.DZISAPP, rawTags: ['koncert', 'koncert', 'MUZYKA'] });
  const b = normalizeTags({ source: ProviderId.DZISAPP, rawTags: ['koncert', 'koncert', 'MUZYKA'] });
  assert.deepEqual(a, ['muzyka']);
  assert.deepEqual(a, b);
});

test('tags: never invents tags outside the closed set', () => {
  for (const value of ['cyrk', 'wystawa', 'festiwal', 'sport', 'taneczne']) {
    assert.deepEqual(normalizeTags({ source: ProviderId.GOING, rawTags: [value] }), []);
  }
});
