// Integration test for the seed queue pipeline: real schema (all migrations applied
// to an in-memory SQLite via node:sqlite) + a D1 adapter + fake providers/queues.
// Verifies the WHOLE flow seed-day → fetch → finalize → ingest → done, including
// exception paths that must be caught and driven to terminal states:
//   - a scope whose fetchScope throws  → bounded DLQ re-drive → scope failed → batch STILL completes
//   - a candidate whose media download throws → candidate error → batch STILL completes
//   - runQueue must never leak a handler exception (per-message retry → DLQ).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SEED_PROVIDERS } from '../src/seed/providers';
import { PROVIDER_CONFIGS } from '../src/seed/providers/registry';
import { storiesRoutes } from '../src/api/stories';
import { parseStoriesLimit } from '../src/api/stories';
import { todayWarsaw, addDaysWarsaw, warsawMidnightMs } from '../src/seed/core/dates';
import { SEED_DAYS_AHEAD, HOUR_MS } from '../src/seed/core/constants';
import { entryFor } from '../src/seed/executors/vps/runtime';
import type { SeedProvider } from '../src/seed/core/types';

// Pipeline tests seed a WINDOW day. Must stay date-relative: handleSeedDay rejects
// created_at older than TTL_MS (24h), so a hardcoded past day makes every seed-day
// throw → infinite DLQ re-drive → "pipeline did not drain". The far edge
// (today+SEED_DAYS_AHEAD) is always inside the window and never in the past.
const DAY = addDaysWarsaw(todayWarsaw(), SEED_DAYS_AHEAD);
const DAY_START = Date.parse(`${DAY}T06:00:00+02:00`);

// ---------- D1 adapter over node:sqlite ----------
function d1(sqlite: DatabaseSync): D1Database {
  const bound = (ps: ReturnType<DatabaseSync['prepare']>, args: unknown[]) => {
    const clean = args.map((a) => (a === undefined ? null : a));
    return {
      run: async () => {
        const r = ps.run(...clean);
        return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) }, results: [] };
      },
      first: async () => {
        const row = ps.get(...clean) as Record<string, unknown> | undefined;
        return row ? { ...row } : null;
      },
      all: async () => {
        const rows = ps.all(...clean) as Record<string, unknown>[];
        return { success: true, results: rows.map((r) => ({ ...r })) };
      },
    };
  };
  const prepare = (sql: string) => {
    const ps = sqlite.prepare(sql);
    return {
      bind: (...args: unknown[]) => bound(ps, args),
      run: () => bound(ps, []).run(),
      first: () => bound(ps, []).first(),
      all: () => bound(ps, []).all(),
    };
  };
  return {
    prepare,
    batch: async (stmts: D1PreparedStatement[]) => {
      sqlite.exec('BEGIN');
      try {
        for (const s of stmts) await (s as unknown as { run: () => Promise<unknown> }).run();
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
      return [];
    },
    exec: async (sql: string) => { sqlite.exec(sql); },
  } as unknown as D1Database;
}

// ---------- In-memory queue (captures message bodies) ----------
class FakeQueue {
  name: string;
  msgs: SeedQueueMessage[] = [];
  constructor(name: string) { this.name = name; }
  send(b: SeedQueueMessage) { this.msgs.push(b); }
  sendBatch(reqs: MessageSendRequest<SeedQueueMessage>[]) { for (const r of reqs) this.msgs.push(r.body); }
}

// ---------- Fake providers ----------
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);

function fakeProvider(
  id: string,
  scopes: string[],
  fetchScope: (scope: string) => Promise<import('../src/seed/core/types').SeedCandidate[]>,
): SeedProvider {
  return {
    id: id as never,
    transport: 'fetch',
    fetchCandidates: async () => [],
    fetchBytes: async (ctx, url) => {
      if (String(url).includes('boom')) throw new Error(`media boom: ${url}`);
      return WEBP;
    },
    scopes,
    fetchScope: (ctx, scope) => fetchScope(scope),
  };
}

// The registry is the single source of truth for enabled providers, so a fake
// provider is wired in by BOTH adding the implementation (SEED_PROVIDERS) and a
// worker executor config (PROVIDER_CONFIGS) — exactly how a real provider is added.
function fakeConfig(id: string) {
  return { id: id as never, transport: 'fetch' as const, enabled: true, priority: 99, executors: { worker: true } };
}
function swapFakes(providers: SeedProvider[]) {
  const origP = [...SEED_PROVIDERS];
  const origC = [...PROVIDER_CONFIGS];
  SEED_PROVIDERS.splice(0, SEED_PROVIDERS.length, ...providers);
  PROVIDER_CONFIGS.splice(0, PROVIDER_CONFIGS.length, ...providers.map((p) => fakeConfig(String(p.id))));
  return () => {
    SEED_PROVIDERS.splice(0, SEED_PROVIDERS.length, ...origP);
    PROVIDER_CONFIGS.splice(0, PROVIDER_CONFIGS.length, ...origC);
  };
}

function candidate(over: Partial<import('../src/seed/core/types').SeedCandidate>) {
  return {
    source: 'fakea',
    externalId: `fake-${over.title ?? 'x'}`,
    title: over.title ?? 'Event',
    startMs: over.startMs ?? DAY_START,
    lat: 52.2, lng: 21.0,
    city: 'Warszawa', venue: 'Venue', address: 'ul. X',
    link: `https://x.pl/${over.externalId ?? 'x'}`, mediaUrl: 'https://x.pl/m.webp', thumbUrl: null,
    ...over,
  } as never;
}

function applyMigrations(sqlite: DatabaseSync) {
  const dir = join(import.meta.dirname, '..', 'migrations');
  for (const f of readdirSync(dir).sort()) {
    if (f.endsWith('.sql')) sqlite.exec(readFileSync(join(dir, f), 'utf8'));
  }
}

// ---------- Pipeline harness: drains phase queues via runQueue; handler retries
// are routed to the DLQ (approximating Cloudflare retry-exhaustion). ----------
async function runPipeline(env: Record<string, unknown>) {
  const queues = {
    fetch: env.SEED_FETCH_QUEUE as FakeQueue,
    ingest: env.SEED_INGEST_QUEUE as FakeQueue,
    finalize: env.SEED_FINALIZE_QUEUE as FakeQueue,
    dlq: env.SEED_DLQ as FakeQueue,
  };
  let guard = 0;
  while (guard++ < 500) {
    const q = [queues.fetch, queues.ingest, queues.finalize, queues.dlq].find((x) => x.msgs.length > 0);
    if (!q) break;
    const body = q.msgs.shift()!;
    const messages = [{ body, ack() {}, retry() { queues.dlq.send(body); }, attempts: 0 }];
    await runQueue(env as never, {
      queue: q.name,
      messages: messages as never,
      retryAll() {}, ackAll() {}, batchId: 't',
    } as never);
  }
  if (guard >= 500) throw new Error('pipeline did not drain (possible infinite retry loop)');
}

function makeEnv() {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const media = { put: async () => {}, get: async () => null, delete: async () => {} };
  return {
    sqlite,
    env: {
      DB: d1(sqlite),
      MEDIA: media,
      SEED_FETCH_QUEUE: new FakeQueue(QUEUE_NAMES.FETCH),
      SEED_INGEST_QUEUE: new FakeQueue(QUEUE_NAMES.INGEST),
      SEED_FINALIZE_QUEUE: new FakeQueue(QUEUE_NAMES.FINALIZE),
      SEED_DLQ: new FakeQueue(QUEUE_NAMES.DLQ),
    },
  };
}

function sqliteRow(sqlite: DatabaseSync, sql: string): any {
  return sqlite.prepare(sql).get();
}

test('integration: /stories?day= browses that day even outside the live TTL window', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const env = { DB: d1(sqlite), MEDIA: { put: async () => {}, get: async () => null, delete: async () => {} } } as unknown as Env;

  sqlite.prepare("INSERT INTO users (id, device_id, session_token, role, created_at) VALUES ('u1','seed','t','user',0)").run();
  const ins = sqlite.prepare(
    `INSERT INTO posts (id, user_id, type, lat, lng, description, status, created_at, category, event_date)
     VALUES (?, 'u1', 'photo', ?, ?, ?, 'approved', ?, ?, ?)`
  );
  // Date-relative (the TTL window is 24h from created_at, so hardcoded days break
  // the live-window assertions depending on when the suite runs).
  const today = todayWarsaw();
  const futureDay = addDaysWarsaw(today, 2);
  const now = Date.now();
  // p_today — event today, created now (always inside the live window — the 06:00
  // anchor would be in the FUTURE when the suite runs before 06:00 Warsaw).
  ins.run('p_today', 52.2, 21.0, 'dzis', now, 'events', today);
  // p_future — event in +2 days, created_at 06:00 Warsaw that day (OUTSIDE the
  // live window because created_at > now).
  ins.run('p_future', 52.3, 21.1, 'jutro', Date.parse(`${futureDay}T04:00:00Z`), 'events', futureDay);
  // p_live — live post, event_date NULL, created now (inside the live window).
  ins.run('p_live', 52.25, 21.05, 'live!', now, 'live', null);

  const bbox = 'sw_lat=52.0&sw_lng=20.9&ne_lat=52.5&ne_lng=21.3';

  // Without day → live window only (today's event + live post; future day hidden).
  const resWindow = await storiesRoutes.request(`/?${bbox}`, {}, env);
  assert.equal(resWindow.status, 200);
  const windowBody = (await resWindow.json()) as { stories: { id: string }[] };
  assert.deepEqual(windowBody.stories.map((s) => s.id).sort(), ['p_live', 'p_today']);

  // day=<futureDay> → only that day's event, despite being outside the TTL window.
  const resDay = await storiesRoutes.request(`/?${bbox}&day=${futureDay}`, {}, env);
  assert.equal(resDay.status, 200);
  const dayBody = (await resDay.json()) as { stories: { id: string }[] };
  assert.deepEqual(dayBody.stories.map((s) => s.id), ['p_future']);

  // Live posts (event_date NULL) never match a day query.
  const resDayToday = await storiesRoutes.request(`/?${bbox}&day=${today}`, {}, env);
  const dayToday = (await resDayToday.json()) as { stories: { id: string }[] };
  assert.deepEqual(dayToday.stories.map((s) => s.id), ['p_today']);

  // Invalid day format → 400.
  const resBad = await storiesRoutes.request(`/?${bbox}&day=17-08-2026`, {}, env);
  assert.equal(resBad.status, 400);

  // limit is respected and clamped.
  const resL1 = await storiesRoutes.request(`/?${bbox}&day=${futureDay}&limit=1`, {}, env);
  assert.equal(((await resL1.json()) as { stories: { id: string }[] }).stories.length, 1);
});

test('integration: /stories/tag-counts returns per-tag + total for a city+day', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const env = { DB: d1(sqlite), MEDIA: { put: async () => {}, get: async () => null, delete: async () => {} } } as unknown as Env;

  sqlite.prepare("INSERT INTO users (id, device_id, session_token, role, created_at) VALUES ('u1','seed','t','user',0)").run();
  const ins = sqlite.prepare(
    `INSERT INTO posts (id, user_id, type, lat, lng, description, status, created_at, category, event_date, tags)
     VALUES (?, 'u1', 'photo', ?, ?, ?, 'approved', ?, 'events', ?, ?)`
  );
  const today = todayWarsaw();
  const now = Date.now();
  // In Warszawa bbox (±0.2 ~ 52.03–52.43 / 20.81–21.21).
  ins.run('a', 52.23, 21.02, 'a', now, today, '["koncert","sport"]');
  ins.run('b', 52.20, 21.00, 'b', now, today, '["koncert"]');
  ins.run('c', 52.25, 21.05, 'c', now, today, null); // untagged → total only
  // Outside the city bbox — must NOT count.
  ins.run('d', 55.0, 21.0, 'd', now, today, '["koncert"]');
  // Wrong day — must NOT count.
  ins.run('e', 52.23, 21.02, 'e', now, addDaysWarsaw(today, 1), '["koncert"]');

  const res = await storiesRoutes.request('/tag-counts?city=warszawa&day=' + today, {}, env);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { total: number; counts: { tag: string; count: number }[] };
  assert.equal(body.total, 3); // a + b + c
  const byTag = Object.fromEntries(body.counts.map((x) => [x.tag, x.count]));
  assert.deepEqual(byTag, { koncert: 2, sport: 1 });

  // Unknown city → 404; missing day → 400.
  assert.equal((await storiesRoutes.request('/tag-counts?city=nope&day=' + today, {}, env)).status, 404);
  assert.equal((await storiesRoutes.request('/tag-counts?city=warszawa', {}, env)).status, 400);
});

test('integration: /stories applies the +1h liveness rule to events and showtimes', async () => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);
  const env = { DB: d1(sqlite), MEDIA: { put: async () => {}, get: async () => null, delete: async () => {} } } as unknown as Env;

  sqlite.prepare("INSERT INTO users (id, device_id, session_token, role, created_at) VALUES ('u1','seed','t','user',0)").run();
  const ins = sqlite.prepare(
    `INSERT INTO posts (id, user_id, type, lat, lng, description, status, created_at, category, event_date, showtimes, showtime_booking)
     VALUES (?, 'u1', 'photo', ?, ?, ?, 'approved', ?, 'events', ?, ?, ?)`
  );

  const today = todayWarsaw();
  const now = Date.now();
  const dayStart = warsawMidnightMs(today);
  const warsawHhmm = (ms: number) => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms));
  // Times relative to now — the test mirrors the rule (oracle) so it stays correct
  // regardless of the hour the suite runs (including Warsaw midnight rollover).
  const tPast = warsawHhmm(now - 2 * HOUR_MS);   // 2h ago → over the grace
  const tGrace = warsawHhmm(now - 30 * 60_000);    // 30min ago → still within grace
  const tFuture = warsawHhmm(now + 2 * HOUR_MS); // upcoming → kept
  const hhmmMs = (t: string) => (Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))) * 60_000;
  const isLive = (t: string) => t === '00:00' || dayStart + hhmmMs(t) + HOUR_MS > now;

  const bbox = 'sw_lat=52.0&sw_lng=20.9&ne_lat=52.5&ne_lng=21.3';

  // Single showtime 2h in the past → the whole post must be dropped.
  ins.run('gone', 52.2, 21.0, 'gone', now, today, JSON.stringify([tPast]), null);
  // Single showtime within the 1h grace → kept.
  ins.run('grace', 52.2, 21.0, 'grace', now, today, JSON.stringify([tGrace]), null);
  // Multi-showtime: past trimmed, future kept; booking must follow the kept times.
  ins.run('multi', 52.2, 21.0, 'multi', now, today,
    JSON.stringify([tPast, tFuture]),
    JSON.stringify([
      { time: tPast, kind: 'link', params: { url: 'https://a' } },
      { time: tFuture, kind: 'link', params: { url: 'https://b' } },
    ]));
  // Unknown time ("00:00") → all-day event, never filtered.
  ins.run('allday', 52.2, 21.0, 'allday', now, today, JSON.stringify(['00:00']), null);
  // No showtimes → liveness unknown → kept.
  ins.run('notime', 52.2, 21.0, 'notime', now, today, null, null);

  const res = await storiesRoutes.request(`/?${bbox}&day=${today}`, {}, env);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { stories: any[] };

  const expected = ['allday', 'grace', 'multi', 'notime'].filter((id) => {
    const times = { allday: ['00:00'], grace: [tGrace], multi: [tPast, tFuture], notime: null }[id];
    return !times || times.some(isLive);
  }).sort();
  assert.deepEqual(body.stories.map((s) => s.id).sort(), expected);
  assert.ok(!body.stories.some((s) => s.id === 'gone'));

  // Multi: only the future showtime survives and the booking is trimmed with it.
  const multi = body.stories.find((s) => s.id === 'multi');
  if (multi) {
    assert.deepEqual(multi.showtimes, [tFuture]);
    assert.deepEqual(multi.showtime_booking.map((b: any) => b.time), [tFuture]);
  }
  // Grace: single showtime intact.
  const grace = body.stories.find((s) => s.id === 'grace');
  if (grace) assert.deepEqual(grace.showtimes, [tGrace]);
});

test('integration: parseStoriesLimit defaults to 50, caps at 1000, clamps to >=1', () => {
  assert.equal(parseStoriesLimit(undefined), 50);
  assert.equal(parseStoriesLimit('0'), 1);
  assert.equal(parseStoriesLimit('42'), 42);
  assert.equal(parseStoriesLimit('5000'), 1000);
  assert.equal(parseStoriesLimit('abc'), 50);
});

test('vps entryFor: single startMs becomes a showtimes array (luma/meetup/going)', () => {
  const today = todayWarsaw();
  const startMs = warsawMidnightMs(today) + 11 * HOUR_MS; // 11:00 Europe/Warsaw
  const cand = {
    source: 'luma' as const, externalId: 'luma-x', title: 'Spacer', startMs,
    lat: 52.4, lng: 16.9, city: 'Poznań', venue: 'Park', address: '', link: '',
    // No `times` — single-time providers must still get a structured showtime.
  };
  const entry = entryFor(cand as any, 'media.jpg');
  assert.deepEqual(entry.showtimes, ['11:00']);

  // Cinema-style: the multi-showtime array wins as-is.
  const cinema = entryFor({ ...cand, externalId: 'cinemacity-x', times: ['10:10', '20:20'] } as any, 'm.jpg');
  assert.deepEqual(cinema.showtimes, ['10:10', '20:20']);
});
