import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doSavePost } from '../src/api/posts';
import { eventsSql } from '../src/admin/queries';
import { propagationTargets, venueFromDescription } from '../src/admin/propagation';

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

// ---- geo propagation (by NAME + CITY, never by geo) ------------------------

const RZESZOW_EDIT = { name: 'Rzeszów Galeria Rzeszów', lat: 50.042089197498946, lng: 21.998718240191135 };

function post(id: string, description: string, lat: number, lng: number) {
  return { id, description, lat, lng };
}

test('venueFromDescription: first comma segment of the location = venue', () => {
  assert.equal(venueFromDescription('Tylko jedna noc: 11:30, Rzeszów Galeria Rzeszów, Al. Piłsudskiego'), 'Rzeszów Galeria Rzeszów');
  assert.equal(venueFromDescription('Bez czasu, Lokalizacja X'), 'Bez czasu', 'no time → first comma segment of the whole string');
  assert.equal(venueFromDescription(''), '');
});

test('propagation: same venue name + same city matches (Rzeszów 65/65)', () => {
  const posts = [
    post('a', 'Film A: 11:00, Rzeszów Galeria Rzeszów, Al. Piłsudskiego', 50.041957, 21.998118),   // old bbox pin
    post('b', 'Film B: 12:00, Rzeszów Galeria Rzeszów, Al. Piłsudskiego', 50.042089, 21.998718),   // already-correct pin
    post('c', 'Film C: 13:00, Rzeszów Galeria Rzeszów', 50.0425, 21.9990),                        // near-center
  ];
  const targets = propagationTargets(posts, RZESZOW_EDIT).map((p) => p.id).sort();
  assert.deepEqual(targets, ['a', 'b', 'c'], 'all same-name same-city events match');
});

test('propagation: same name in a DIFFERENT city never matches (Katedra Kraków ≠ Katedra Szczecin)', () => {
  const posts = [
    post('krakow', 'Koncert: 20:00, Katedra, Kraków', 50.0647, 19.945),      // Kraków
    post('szczecin', 'Koncert: 20:00, Katedra, Szczecin', 53.4285, 14.5528), // Szczecin
  ];
  const targets = propagationTargets(posts, { name: 'Katedra', lat: 50.0647, lng: 19.945 }).map((p) => p.id);
  assert.deepEqual(targets, ['krakow'], 'only the Kraków Katedra matches');
});

test('propagation: different venue name in the same city never matches', () => {
  const posts = [
    post('kat', 'Koncert: 20:00, Katedra', 50.0647, 19.945),
    post('rynek', 'Koncert: 20:00, Rynek Główny', 50.0617, 19.9372),
  ];
  const targets = propagationTargets(posts, { name: 'Katedra', lat: 50.0647, lng: 19.945 }).map((p) => p.id);
  assert.deepEqual(targets, ['kat'], 'different name in the same city is not caught');
});

test('propagation: 1:1 venueKey is strict — "Galeria Rzeszów" ≠ "Rzeszów Galeria Rzeszów"', () => {
  const posts = [
    post('short', 'Film: 20:00, Galeria Rzeszów', 50.042, 21.999),
    post('long', 'Film: 20:00, Rzeszów Galeria Rzeszów', 50.042, 21.999),
  ];
  // Edit the SHORT name → only the short-name event matches, never the prefixed one.
  const targets = propagationTargets(posts, { name: 'Galeria Rzeszów', lat: 50.042, lng: 21.999 }).map((p) => p.id);
  assert.deepEqual(targets, ['short'], 'prefix variants do NOT cross-match');
});

test('propagation: posts without coordinates are excluded', () => {
  const posts = [
    post('a', 'Film: 20:00, Rzeszów Galeria Rzeszów', 50.042, 21.999),
    post('b', 'Film: 21:00, Rzeszów Galeria Rzeszów', 0, 0),
  ];
  const targets = propagationTargets(posts, RZESZOW_EDIT).map((p) => p.id);
  assert.deepEqual(targets, ['a'], '0,0 / missing coords are excluded');
});
