import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANONICAL_TAGS, CANONICAL_TAG_SET, TAG_LABELS, tagLabel } from '../src/seed/core/tags';

test('tags: canonical set is closed and small', () => {
  assert.deepEqual(CANONICAL_TAGS, ['filmy', 'muzyka', 'meetup', 'komedia', 'teatr', 'sport', 'inne']);
  assert.equal(CANONICAL_TAG_SET.size, CANONICAL_TAGS.length);
});

test('tags: every canonical tag has a display label', () => {
  const mapped = CANONICAL_TAGS.map((id) => ({ id, label: tagLabel(id) }));
  assert.deepEqual(mapped, [
    { id: 'filmy', label: 'Filmy' },
    { id: 'muzyka', label: 'Muzyka' },
    { id: 'meetup', label: 'Meetup' },
    { id: 'komedia', label: 'Komedia' },
    { id: 'teatr', label: 'Teatr' },
    { id: 'sport', label: 'Sport' },
    { id: 'inne', label: 'Inne' },
  ]);
  assert.equal(TAG_LABELS['nieznany'], undefined);
  assert.equal(tagLabel('nieznany'), 'nieznany', 'unknown tag falls back to its id');
});

test('tagCatalog: canonical vocabulary first, then admin-created tags', async () => {
  const db = { prepare: () => ({ all: async () => ({ results: [{ id: 'sztuka', label: 'Sztuka' }, { id: 'wystawa', label: 'Wystawa' }] }) }) } as unknown as D1Database;
  const { tagCatalog, tagIdSet } = await import('../src/core/tagCatalog');
  const catalog = await tagCatalog(db);
  assert.deepEqual(catalog.slice(0, 7).map((t) => t.id), ['filmy', 'muzyka', 'meetup', 'komedia', 'teatr', 'sport', 'inne']);
  assert.deepEqual(catalog.slice(7), [{ id: 'sztuka', label: 'Sztuka' }, { id: 'wystawa', label: 'Wystawa' }]);
  const ids = await tagIdSet(db);
  assert.ok(ids.has('filmy'));
  assert.ok(ids.has('sport'));
  assert.ok(!ids.has('cyrk'));
});
