import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doSavePost } from '../src/api/posts';
import { eventsSql } from '../src/admin/queries';
import { venueTagId, finalCandidateTags } from '../src/seed/core/autoTag';

function recordingDb() {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...binds: unknown[]) => ({ run: async () => { calls.push({ sql, binds }); } }),
    }),
  } as unknown as D1Database;
  return { db, calls };
}

// ---- doSavePost guards ----------------------------------------------------

test('doSavePost: UPDATE guards is_sold_out by sold_out_locked', async () => {
  const { db, calls } = recordingDb();
  const env = { DB: db } as unknown as Env;
  const now = Date.parse('2026-08-17T04:00:00Z');
  await doSavePost(env, { id: 'u1' }, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', true, true);
  const upd = calls.find((c) => /UPDATE posts/i.test(c.sql));
  assert.ok(upd, 'UPDATE executed');
  assert.ok(/is_sold_out\s*=\s*CASE WHEN sold_out_locked = 1 THEN is_sold_out ELSE \? END/.test(upd!.sql), 'is_sold_out guarded by sold_out_locked');
});

test('doSavePost: UPDATE guards showtimes/booking by time_locked, description by geo OR time', async () => {
  const { db, calls } = recordingDb();
  const env = { DB: db } as unknown as Env;
  const now = Date.parse('2026-08-17T04:00:00Z');
  await doSavePost(env, { id: 'u1' }, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', true, false, '["19:30"]', null, '["teatr"]');
  const upd = calls.find((c) => /UPDATE posts/i.test(c.sql));
  assert.ok(upd, 'UPDATE executed');
  assert.ok(/showtimes\s*=\s*CASE WHEN time_locked = 1 THEN showtimes ELSE \? END/.test(upd!.sql), 'showtimes guarded by time_locked');
  assert.ok(/showtime_booking\s*=\s*CASE WHEN time_locked = 1 THEN showtime_booking ELSE \? END/.test(upd!.sql), 'showtime_booking guarded by time_locked');
  assert.ok(/description\s*=\s*CASE WHEN geo_locked = 1 OR time_locked = 1 THEN description ELSE \? END/.test(upd!.sql), 'description guarded by geo_locked OR time_locked');
});

// ---- time filter ----------------------------------------------------------

test('eventsSql: time filter builds the right showtime clause per bucket', () => {
  const base = { cityId: null, source: null, status: null, from: null, to: null, tag: null, geo: null, fromMs: null, toMs: null, limit: 50 };
  const zero = eventsSql({ ...base, time: 'zero' });
  assert.ok(zero.sql.includes("json_extract(p.showtimes,'$[0]')='00:00'"), 'zero bucket covers 00:00 placeholder');
  assert.ok(zero.sql.includes('p.showtimes IS NULL'), 'zero bucket covers no-time events');
  for (const [key, bound] of [['06', '06:00'], ['12', '12:00'], ['18', '18:00'], ['2359', '23:59']] as const) {
    const { sql } = eventsSql({ ...base, time: key });
    assert.ok(sql.includes(`json_extract(p.showtimes,'$[0]')>='${bound}'`), `time=${key} uses ${bound}`);
  }
  const none = eventsSql(base);
  assert.ok(!none.sql.includes('json_extract(p.showtimes'), 'no time filter → no showtime clause');
});

// ---- auto-tagger ----------------------------------------------------------

test('auto-tagger: venueTagId maps Kino Luna → filmy, Teatr → teatr', () => {
  assert.equal(venueTagId('Kino Luna'), 'filmy');
  assert.equal(venueTagId('Kino Luna Multikino'), 'filmy', 'kino-luna rule wins over later rules');
  assert.equal(venueTagId('Teatr Wielki im. St. Wyspiańskiego'), 'teatr');
  assert.equal(venueTagId('TEATR WIELKI'), 'teatr', 'case-insensitive');
  assert.equal(venueTagId('Klub Studencki'), null);
  assert.equal(venueTagId(''), null);
  assert.equal(venueTagId(null), null);
  assert.equal(venueTagId(undefined), null);
});

test('auto-tagger: finalCandidateTags keeps existing tags, applies venue rule when empty', async () => {
  const tagSet = new Set(['filmy', 'teatr']);
  assert.deepEqual(await finalCandidateTags(tagSet, { venue: 'Kino Luna', tags: ['muzyka'] }), ['muzyka'], 'existing tags win');
  assert.deepEqual(await finalCandidateTags(tagSet, { venue: 'Kino Luna', tags: [] }), ['filmy'], 'empty tags + venue rule assigns filmy');
  assert.deepEqual(await finalCandidateTags(tagSet, { venue: 'Teatr im. Słowackiego' }), ['teatr']);
  assert.deepEqual(await finalCandidateTags(tagSet, { venue: 'Klub' }), [], 'no rule → empty');
  assert.deepEqual(await finalCandidateTags(tagSet, { venue: null, tags: ['muzyka', 'muzyka'] }), ['muzyka'], 'sorted + deduped');
});

test('auto-tagger: deleted tag is skipped with a warning', async () => {
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (m?: unknown) => warns.push(String(m));
  try {
    const tagSet = new Set<string>([]); // "teatr" was deleted from the catalog
    const tags = await finalCandidateTags(tagSet, { venue: 'Teatr Wielki' });
    assert.deepEqual(tags, [], 'deleted tag never re-applied');
    assert.equal(warns.length, 1, 'one warning logged');
    assert.ok(warns[0].includes('teatr'), 'warning names the dropped tag');
  } finally {
    console.warn = orig;
  }
});

// ---- tag catalog order ----------------------------------------------------

test('tagCatalog: explicit tag_order positions win, deleted tags are dropped', async () => {
  // admin_tags: sport, wystawa. tag_order: wystawa=0, sport=1, usuniety=2 (ghost).
  const db = {
    prepare: (sql: string) => ({
      all: async () =>
        sql.includes('admin_tags')
          ? { results: [{ id: 'sport', label: 'Sport' }, { id: 'wystawa', label: 'Wystawa' }] }
          : { results: [{ tag_id: 'wystawa', position: 0 }, { tag_id: 'sport', position: 1 }, { tag_id: 'usuniety', position: 2 }] },
    }),
  } as unknown as D1Database;
  const { tagCatalog } = await import('../src/core/tagCatalog');
  const catalog = await tagCatalog(db);
  const ids = catalog.map((t) => t.id);
  assert.deepEqual(ids.slice(0, 2), ['wystawa', 'sport'], 'positioned tags first, in order');
  assert.deepEqual(ids.slice(2), ['filmy', 'muzyka', 'meetup', 'komedia', 'teatr', 'inne'], 'canonical follows in default order');
  assert.ok(!ids.includes('usuniety'), 'ghost tag_order entry never surfaces');
});

test('tagCatalog: no tag_order → default order (canonical then custom by label)', async () => {
  const db = {
    prepare: (sql: string) => ({
      all: async () =>
        sql.includes('admin_tags')
          ? { results: [{ id: 'wystawa', label: 'Wystawa' }, { id: 'sport', label: 'Sport' }] }
          : { results: [] },
    }),
  } as unknown as D1Database;
  const { tagCatalog } = await import('../src/core/tagCatalog');
  const catalog = await tagCatalog(db);
  assert.deepEqual(catalog.slice(0, 6).map((t) => t.id), ['filmy', 'muzyka', 'meetup', 'komedia', 'teatr', 'inne']);
  assert.deepEqual(catalog.slice(6).map((t) => t.id), ['sport', 'wystawa'], 'admin tags ordered by label');
});

test('registry: dzisapp + eventylive are disabled (retired), worker core still enabled', async () => {
  const { enabledProviders } = await import('../src/seed/providers');
  const ids = enabledProviders().map((p) => p.id);
  assert.ok(!ids.includes('dzisapp'), 'dzisapp disabled');
  assert.ok(!ids.includes('eventylive'), 'eventylive disabled');
  assert.ok(ids.includes('going'), 'going still runs');
  assert.ok(ids.includes('kupbilecik'), 'kupbilecik still runs');
  assert.ok(ids.includes('helios'), 'helios still runs');
});
