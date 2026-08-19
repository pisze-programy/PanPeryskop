import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dedupe, dropCancelled, rescueRealShows, isCancelled } from '../src/seed';
import type { SeedCandidate, ProviderId } from '../src/seed/core/types';

// Golden regression over REAL production data (2026-08-18..21, whole Poland).
// The fixture is trimmed to the rows that participate in a duplicate group (plus
// the cancelled event) — singletons never affect the day-scoped grouping, so this
// reproduces the full-run result exactly (verified: identical removed set).
const windowRows = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'dedupe-window.json'), 'utf8')) as Array<Record<string, unknown>>;
const expectedRemoved = new Set(JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'dedupe-removed.json'), 'utf8')) as string[]);

function toCand(r: Record<string, unknown>): SeedCandidate {
  const desc: string = String(r.description || '');
  const m = desc.match(/^(.*?):\s*(\d{2}:\d{2})\s*,\s*(.*)$/s);
  const title = (m ? m[1] : desc).trim();
  const hm = m ? m[2] : '00:00';
  const venue = (m ? m[3] : '').trim();
  const src = String(r.external_id || '').split('-')[0];
  return {
    source: src as ProviderId,
    externalId: String(r.external_id || ''),
    title,
    startMs: Date.parse(`${String(r.event_date)}T${hm}:00+02:00`),
    lat: typeof r.lat === 'number' ? r.lat : null,
    lng: typeof r.lng === 'number' ? r.lng : null,
    city: '',
    venue,
    address: '',
    link: String(r.link_url || ''),
    mediaUrl: '',
    thumbUrl: null,
  };
}

test('golden: real-data dedupe pipeline removes exactly the expected posts (49 + 1 cancelled)', () => {
  const all = windowRows.map(toCand);
  const cancelled = all.filter((c) => isCancelled(c.title));
  const pre = dropCancelled(all);
  const deduped = dedupe(pre);
  const merged = rescueRealShows(pre, deduped);
  const removed = pre.filter((c) => !merged.includes(c));

  assert.equal(cancelled.length, 1, '*CANCELLED* Missio must be dropped by the pre-filter');
  assert.equal(pre.length - deduped.length, 51, 'dedupe alone removes 51 losers (non-cinema only)');
  assert.equal(merged.length - deduped.length, 2, 'rescue re-keeps the two real SKOLIM 20:00 shows');
  assert.equal(removed.length, 49, 'final dedupe losers to remove');

  const removedIds = new Set(removed.map((c) => c.externalId));
  assert.equal(removedIds.size, 49, 'no duplicate external ids in the removal set');
  assert.deepEqual(removedIds, expectedRemoved, 'removal set must match the golden snapshot');

  // Cinema providers are never deduped — no multikino/cinemacity post is removed.
  for (const id of removedIds) {
    assert.ok(!id.startsWith('multikino-') && !id.startsWith('cinemacity-') && !id.startsWith('cc-'),
      `${id} is a cinema post — cinema is exempt from dedupe`);
  }

  // Key guarded cases stay OUT of the removal set.
  const kept = new Set(merged.map((c) => c.externalId));
  for (const id of ['kupbilecik-208719-2026-08-18', 'kupbilecik-208732-2026-08-20']) {
    assert.ok(kept.has(id), `${id} (SKOLIM 20:00) must be rescued back`);
  }
});
