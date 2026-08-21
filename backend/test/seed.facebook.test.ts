// Facebook manual provider — dedupe rank + existing-post guard.
// The guard functions are pure (no DB), so they're tested directly; the dedupe
// rank is verified through the same `dedupe()` the Worker batch uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dedupe } from '../src/seed/core/dedupe';
import { ProviderId } from '../src/seed/core/types';
import { priorityOf } from '../src/seed/providers/registry';
import {
  parseDescription, venueFromLoc, sourceFromExternalId, postToMatchable,
  matchesExisting, findWinner, ingestFacebookEvent, previewFacebookEvents, previewGeo, fallbackGeo,
} from '../src/seed/manual/facebook';
import type { Matchable, ExistingEvent } from '../src/seed/manual/facebook';

function cand(source: ProviderId, ext: string, title = 'Koncert', venue = 'Venue', startMs = 1_782_765_000_000) {
  return {
    source,
    externalId: ext,
    title,
    startMs,
    lat: 52.2, lng: 21.0,
    city: 'Warszawa',
    venue,
    address: 'ul. Testowa 1',
    link: `https://example.com/${ext}`,
    mediaUrl: 'https://example.com/m.webp',
    thumbUrl: 'https://example.com/m_m.webp',
  };
}

function matchable(source: string, title: string, venue: string, startMs = 1_782_765_000_000): Matchable {
  return { source, title, venue, lat: 52.2, lng: 21.0, startMs };
}

function existing(over: Partial<ExistingEvent> & { title: string; venue: string }): ExistingEvent {
  const ext = over.externalId ?? 'going-1';
  return {
    postId: 'p-1',
    externalId: ext,
    link: 'https://goingapp.pl/wydarzenie/x',
    m: matchable(sourceFromExternalId(ext), over.title, over.venue),
    ...over,
  };
}

test('facebook: dedupe rank is below going and kupbilecik', () => {
  const going = cand(ProviderId.GOING, 'going-1');
  const kup = cand(ProviderId.KUPBILECIK, 'kup-1');
  const fb = cand(ProviderId.FACEBOOK, 'facebook-1');

  assert.equal(dedupe([fb, going])[0].externalId, 'going-1');
  assert.equal(dedupe([fb, kup])[0].externalId, 'kup-1');
});

test('facebook: dedupe rank is above dzisapp and eventylive', () => {
  const fb = cand(ProviderId.FACEBOOK, 'facebook-1');
  const dzis = cand(ProviderId.DZISAPP, 'dzis-1');
  const evl = cand(ProviderId.EVENTYLIVE, 'evl-1');

  assert.equal(dedupe([fb, dzis])[0].externalId, 'facebook-1');
  assert.equal(dedupe([fb, evl])[0].externalId, 'facebook-1');
});

test('facebook: priority sits between kupbilecik and dzisapp', () => {
  assert.ok(priorityOf(ProviderId.KUPBILECIK) < priorityOf(ProviderId.FACEBOOK));
  assert.ok(priorityOf(ProviderId.FACEBOOK) < priorityOf(ProviderId.DZISAPP));
});

test('parseDescription: extracts title and loc from a seed description', () => {
  const d = parseDescription('LOT Kino Letnie: 22:00, Plac Defilad 1, Warszawa');
  assert.deepEqual(d, { title: 'LOT Kino Letnie', loc: 'Plac Defilad 1, Warszawa' });
  assert.equal(parseDescription('no comma-separated seed shape'), null);
});

test('venueFromLoc: first comma segment is the venue name', () => {
  assert.equal(venueFromLoc('Plac Defilad 1, 00-901 Warsaw'), 'Plac Defilad 1');
  assert.equal(venueFromLoc('Park Czechowicki'), 'Park Czechowicki');
});

test('sourceFromExternalId: provider prefix of the external_id', () => {
  assert.equal(sourceFromExternalId('dzisapp-123-2026-08-18'), 'dzisapp');
  assert.equal(sourceFromExternalId(null), 'unknown');
});

test('postToMatchable: reconstructs a matchable from a post row', () => {
  const row = {
    external_id: 'going-abc',
    description: 'Koncert: 21:00, Klub Tama, Poznań',
    lat: 52.4064, lng: 16.9252, created_at: 1_782_765_000_000,
  };
  const m = postToMatchable(row);
  assert.equal(m.source, 'going');
  assert.equal(m.title, 'Koncert');
  assert.equal(m.venue, 'Klub Tama');
  assert.equal(m.lat, 52.4064);
  assert.equal(m.startMs, 1_782_765_000_000);
});

test('matchesExisting: same title + venue matches, different venue does not', () => {
  const candM = matchable('facebook', 'Koncert', 'Klub Tama');
  assert.equal(matchesExisting(candM, existing({ title: 'Koncert', venue: 'Klub Tama' })), true);
  assert.equal(matchesExisting(candM, existing({ title: 'Koncert', venue: 'Stary Browar' })), false);
});

test('findWinner: higher-priority provider beats facebook', () => {
  const candM = matchable('facebook', 'Koncert', 'Klub Tama');
  const going = existing({ postId: 'g', externalId: 'going-1', title: 'Koncert', venue: 'Klub Tama' });
  assert.equal(findWinner(candM, [going]), going);
});

test('findWinner: facebook beats a lower-priority provider', () => {
  const candM = matchable('facebook', 'Koncert', 'Klub Tama');
  const dzis = existing({ postId: 'd', externalId: 'dzisapp-1', title: 'Koncert', venue: 'Klub Tama' });
  assert.equal(findWinner(candM, [dzis]), 'facebook');
});

test('findWinner: no matches -> null', () => {
  const candM = matchable('facebook', 'Unikalny', 'Teatr');
  assert.equal(findWinner(candM, [existing({ title: 'Koncert', venue: 'Klub Tama' })]), null);
});

// ---------- ingest integration (in-memory D1 + migrations + stubbed geo) ----------

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);

function d1(sqlite: DatabaseSync): D1Database {
  const bound = (ps: ReturnType<DatabaseSync['prepare']>, args: unknown[]) => {
    const clean = args.map((a) => (a === undefined ? null : a));
    return {
      run: async () => ({ success: true, meta: { changes: ps.run(...clean).changes, last_row_id: 1 }, results: [] }),
      first: async () => { const row = ps.get(...clean); return row ? { ...row } : null; },
      all: async () => ({ success: true, results: (ps.all(...clean) as Record<string, unknown>[]).map((r) => ({ ...r })) }),
    };
  };
  const prepare = (sql: string) => {
    const ps = sqlite.prepare(sql);
    return { bind: (...args: unknown[]) => bound(ps, args), run: () => bound(ps, []).run(), first: () => bound(ps, []).first(), all: () => bound(ps, []).all() };
  };
  return { prepare, batch: async () => [], exec: async (s: string) => { sqlite.exec(s); } } as unknown as D1Database;
}

function applyMigrations(sqlite: DatabaseSync) {
  const dir = join(import.meta.dirname, '..', 'migrations');
  for (const f of readdirSync(dir).sort()) {
    if (f.endsWith('.sql')) sqlite.exec(readFileSync(join(dir, f), 'utf8'));
  }
}

function makeFbEnv() {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  sqlite.exec(
    "INSERT INTO users (id, device_id, session_token, role, username, auth_provider, created_at) VALUES ('seed-user', 'fb-test-user', 't', 'user', 'Test', 'device', 1)"
  );
  const media = { put: async () => {}, get: async () => null, delete: async () => {} };
  return { sqlite, env: { DB: d1(sqlite), MEDIA: media } as unknown as Env };
}

async function insertEventPost(env: Env, over: { provider: string; title: string; venue: string; day: string }) {
  const id = `${over.provider}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const createdAt = Date.parse(`${over.day}T06:00:00+02:00`);
  await env.DB.prepare(
    `INSERT INTO posts (id, user_id, type, lat, lng, description, status, media_key, thumb_key, created_at, grid_cell_id, is_sponsored, category, link_url, external_id, event_date)
     VALUES (?, 'seed-user', 'photo', 52.4, 16.9, ?, 'approved', NULL, NULL, ?, '1:1', 1, 'events', ?, ?, ?)`
  ).bind(id, `${over.title}: 21:00, ${over.venue}, Warszawa`, createdAt, `https://${over.provider}.pl/x`, `${over.provider}-1`, over.day).run();
  return id;
}

function stubNominatim() {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('nominatim.openstreetmap.org')) {
      return new Response(JSON.stringify([{ lat: '52.4064', lon: '16.9252', display_name: 'Klub Tama, Poznań, Polska' }]), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  return () => { globalThis.fetch = real; };
}

function fbInput(over: Partial<import('../src/seed/manual/facebook').IngestInput> = {}): import('../src/seed/manual/facebook').IngestInput {
  return {
    title: 'Koncert',
    startMs: Date.parse('2026-08-20T21:00:00+02:00'),
    venue: 'Klub Tama',
    address: '',
    city: 'Warszawa',
    link: 'https://www.facebook.com/events/111/',
    externalId: 'facebook-111',
    tags: [],
    times: [],
    file: JPEG,
    thumb: null,
    ...over,
  };
}

test('facebook ingest: beats a lower-priority (dzisapp) post -> rejects it, creates a pending post', async () => {
  const restore = stubNominatim();
  try {
    const { sqlite, env } = makeFbEnv();
    const dzisId = await insertEventPost(env, { provider: 'dzisapp', title: 'Koncert', venue: 'Klub Tama', day: '2026-08-20' });

    const res = await ingestFacebookEvent(env, fbInput());
    assert.equal(res.status, 'pending');
    assert.ok(res.postId);
    assert.equal(res.lat, 52.4064);

    const rejected = sqlite.prepare('SELECT status FROM posts WHERE id=?').get(dzisId) as any;
    assert.equal(rejected.status, 'rejected', 'dzisapp copy must be rejected when facebook wins');

    const post = sqlite.prepare('SELECT link_url, external_id, is_sponsored, status FROM posts WHERE id=?').get(res.postId!) as any;
    assert.equal(post.link_url, 'https://www.facebook.com/events/111/');
    assert.equal(post.external_id, 'facebook-111');
    assert.equal(post.is_sponsored, 1);
    assert.equal(post.status, 'pending', 'facebook ingest queues for moderation');
  } finally {
    restore();
  }
});

test('facebook ingest: re-submitting the same external_id upserts and stays pending', async () => {
  const restore = stubNominatim();
  try {
    const { sqlite, env } = makeFbEnv();
    const first = await ingestFacebookEvent(env, fbInput());
    assert.equal(first.status, 'pending');
    const second = await ingestFacebookEvent(env, fbInput());
    assert.equal(second.status, 'pending');
    assert.equal(second.postId, first.postId, 'same post id across re-submits');

    const count = sqlite.prepare("SELECT COUNT(*) AS n FROM posts WHERE external_id='facebook-111'").get() as any;
    assert.equal(count.n, 1, 'no duplicate post created');
    const status = sqlite.prepare('SELECT status FROM posts WHERE id=?').get(first.postId!) as any;
    assert.equal(status.status, 'pending');
  } finally {
    restore();
  }
});

test('facebook ingest: loses to a higher-priority (going) post -> duplicate, nothing rejected', async () => {
  const restore = stubNominatim();
  try {
    const { sqlite, env } = makeFbEnv();
    const goingId = await insertEventPost(env, { provider: 'going', title: 'Koncert', venue: 'Klub Tama', day: '2026-08-20' });

    const res = await ingestFacebookEvent(env, fbInput());
    assert.equal(res.status, 'duplicate');
    assert.equal(res.winner!.provider, 'going');

    const still = sqlite.prepare('SELECT status FROM posts WHERE id=?').get(goingId) as any;
    assert.equal(still.status, 'approved', 'higher-priority post is untouched');

    const count = sqlite.prepare("SELECT COUNT(*) AS n FROM posts WHERE external_id='facebook-111'").get() as any;
    assert.equal(count.n, 0, 'facebook event not ingested');
  } finally {
    restore();
  }
});

test('facebook geo preview: resolves with stubbed nominatim, reports unresolved + reasons', async () => {
  const restore = stubNominatim();
  try {
    const { env } = makeFbEnv();
    const results = await previewGeo(env, [
      { externalId: 'facebook-1', venue: 'Klub Tama', address: '', city: 'Poznań' },
      { externalId: 'facebook-2', venue: '', address: 'ul. Kordeckiego 12', city: '' },
    ]);
    assert.equal(results[0].resolved, true);
    assert.equal(results[0].lat, 52.4064);
    assert.equal(results[1].resolved, false, 'no city -> refused');
    assert.equal(results[1].reason, 'no_city');
    assert.equal(results[1].lat, null);
  } finally {
    restore();
  }
});

test('facebook ingest: missing city -> zero_fallback pending (0,0, fix in admin)', async () => {
  const { sqlite, env } = makeFbEnv();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('[{ "lat": "52.0560", "lon": "20.9997" }]', { status: 200 })) as typeof fetch;
  try {
    const res = await ingestFacebookEvent(env, fbInput({ city: '' }));
    assert.equal(res.status, 'pending');
    assert.equal(res.geo, 'zero_fallback', 'no city -> 0,0 fallback (never a random city pin)');
    assert.equal(res.lat, 0);
    assert.equal(res.lng, 0);
    const post = sqlite.prepare("SELECT status, lat, lng FROM posts WHERE external_id='facebook-111'").get() as any;
    assert.equal(post.status, 'pending');
    assert.equal(post.lat, 0);
    assert.equal(post.lng, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('facebook ingest: geocoding miss -> city_fallback pending (city center)', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch; // Nominatim misses
  try {
    const { sqlite, env } = makeFbEnv();
    const res = await ingestFacebookEvent(env, fbInput());
    assert.equal(res.status, 'pending');
    assert.equal(res.geo, 'city_fallback', 'known city -> CITIES center');
    assert.equal(res.lat, 52.2297, 'Warszawa center');
    assert.equal(res.lng, 21.0122);
    const count = sqlite.prepare("SELECT COUNT(*) AS n FROM posts WHERE external_id='facebook-111'").get() as any;
    assert.equal(count.n, 1, 'post created with fallback geo');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('fallbackGeo: known city -> CITIES center, unknown/empty -> 0,0, diacritics folded', () => {
  assert.deepEqual(fallbackGeo('Warszawa'), { lat: 52.2297, lng: 21.0122 });
  assert.deepEqual(fallbackGeo('Poznan'), { lat: 52.4064, lng: 16.9252 }, 'diacritics folded');
  assert.deepEqual(fallbackGeo('Warszawa, Poland'), { lat: 52.2297, lng: 21.0122 }, 'suffix matched');
  assert.deepEqual(fallbackGeo('Nieznane Miasto'), { lat: 0, lng: 0 });
  assert.deepEqual(fallbackGeo(''), { lat: 0, lng: 0 });
  assert.deepEqual(fallbackGeo('  '), { lat: 0, lng: 0 });
});
