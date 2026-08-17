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
import { enqueueSeedDay, runQueue, QUEUE_NAMES } from '../src/seed/pipeline/queue';
import { storiesRoutes } from '../src/api/stories';
import { parseStoriesLimit } from '../src/api/stories';
import type { SeedQueueMessage } from '../src/seed/pipeline/queue';
import type { SeedProvider } from '../src/seed/core/types';

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
    enabled: true,
    fetchCandidates: async () => [],
    fetchBytes: async (ctx, url) => {
      if (String(url).includes('boom')) throw new Error(`media boom: ${url}`);
      return WEBP;
    },
    scopes,
    fetchScope: (ctx, scope) => fetchScope(scope),
  };
}

function candidate(over: Partial<import('../src/seed/core/types').SeedCandidate>) {
  return {
    source: 'fakea',
    externalId: `fake-${over.title ?? 'x'}`,
    title: over.title ?? 'Event',
    startMs: over.startMs ?? 1_782_765_000_000,
    lat: 52.2, lng: 21.0,
    city: 'Warszawa', venue: 'Venue', address: 'ul. X',
    link: 'https://x.pl', mediaUrl: 'https://x.pl/m.webp', thumbUrl: null,
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

test('integration: seed pipeline completes end-to-end and catches provider/ingest exceptions', async () => {
  const orig = [...SEED_PROVIDERS];
  const realFetch = globalThis.fetch;
  // Venue-cache build in handleSeedDay is best-effort — stub the network so the
  // test is hermetic (buildVenueCache swallows its own errors anyway).
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;

  const boomCand = candidate({ externalId: 'fake-boom', title: 'Boom', mediaUrl: 'https://x.pl/boom.jpg' });
  const okCand = candidate({ externalId: 'fake-ok', title: 'Koncert', startMs: 1_782_765_000_000 });
  const okCand2 = candidate({ externalId: 'fake-ok2', title: 'Standup', startMs: 1_782_765_000_000 + 3_600_000 });

  SEED_PROVIDERS.splice(0, SEED_PROVIDERS.length);
  SEED_PROVIDERS.push(
    fakeProvider('fakea', ['city1', 'city2'], async (scope) => {
      if (scope === 'city2') throw new Error('scope city2 boom'); // poison scope → DLQ → failed
      return [okCand, boomCand]; // boom candidate fails at media download
    }),
    fakeProvider('fakeb', ['city3'], async () => [okCand2]),
  );

  try {
    const { sqlite, env } = makeEnv();
    await enqueueSeedDay(env as never, '2026-08-20', 'manual');
    await runPipeline(env);

    const batch = sqlite.prepare("SELECT status, scopes_total, scopes_done FROM seed_batches WHERE day='2026-08-20'").get() as any;
    assert.equal(batch.status, 'done', 'batch must reach done despite a poison scope + a failing candidate');

    const scopes = sqlite.prepare('SELECT provider, scope, status FROM seed_scopes ORDER BY scope').all() as any[];
    assert.deepEqual(
      scopes.map((s) => `${s.scope}:${s.status}`).sort(),
      ['city1:done', 'city2:failed', 'city3:done'],
      'poison scope is terminal failed, others done',
    );

    const cands = sqlite.prepare('SELECT external_id, status FROM seed_candidates').all() as any[];
    assert.deepEqual(
      cands.map((c) => `${c.external_id}:${c.status}`).sort(),
      ['fake-boom:error', 'fake-ok2:done', 'fake-ok:done'],
      'failing candidate is terminal error, survivors done',
    );

    // Only the two survivors created posts (the boom candidate never got media).
    const posts = sqlite.prepare("SELECT COUNT(*) AS n FROM posts WHERE category='events'").get() as any;
    assert.equal(posts.n, 2, 'posts created only for successfully ingested candidates');

    // No dead letter should be left behind: everything was re-driven to terminal.
    const dlq = env.SEED_DLQ as FakeQueue;
    assert.equal(dlq.msgs.length, 0, 'DLQ drained (bounded re-drive, no infinite loop)');
  } finally {
    SEED_PROVIDERS.splice(0, SEED_PROVIDERS.length, ...orig);
    globalThis.fetch = realFetch;
  }
});

test('integration: runQueue catches handler exceptions (retry→DLQ, never uncaught)', async () => {
  const orig = [...SEED_PROVIDERS];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
  SEED_PROVIDERS.splice(0, SEED_PROVIDERS.length);
  SEED_PROVIDERS.push(fakeProvider('fakethrow', ['only'], async () => { throw new Error('always throws'); }));

  try {
    const { sqlite, env } = makeEnv();
    await enqueueSeedDay(env as never, '2026-08-20', 'manual');

    // Drive the pipeline; it must NOT reject even though every fetch throws —
    // the poison scope is exhausted via bounded DLQ re-drive and the batch fails.
    await runPipeline(env);

    const batch = sqliteRow(sqlite, "SELECT status FROM seed_batches WHERE day='2026-08-20'");
    assert.ok(['failed', 'done'].includes(batch.status), `batch terminal (got ${batch.status})`);
    const scope = sqliteRow(sqlite, "SELECT status FROM seed_scopes WHERE scope='only'");
    assert.equal(scope.status, 'failed', 'poison scope marked failed after bounded re-drive');
  } finally {
    SEED_PROVIDERS.splice(0, SEED_PROVIDERS.length, ...orig);
    globalThis.fetch = realFetch;
  }
});

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
  const now = Date.now();
  // p_today — event on 2026-08-17, created_at 06:00 Warsaw (inside the live window).
  ins.run('p_today', 52.2, 21.0, 'dzis', Date.parse('2026-08-17T04:00:00Z'), 'events', '2026-08-17');
  // p_future — event on 2026-08-20, created_at 06:00 Warsaw (OUTSIDE the live window).
  ins.run('p_future', 52.3, 21.1, 'jutro', Date.parse('2026-08-20T04:00:00Z'), 'events', '2026-08-20');
  // p_live — live post, event_date NULL, created now (inside the live window).
  ins.run('p_live', 52.25, 21.05, 'live!', now, 'live', null);

  const bbox = 'sw_lat=52.0&sw_lng=20.9&ne_lat=52.5&ne_lng=21.3';

  // Without day → live window only (today's event + live post; future day hidden).
  const resWindow = await storiesRoutes.request(`/?${bbox}`, {}, env);
  assert.equal(resWindow.status, 200);
  const windowBody = (await resWindow.json()) as { stories: { id: string }[] };
  assert.deepEqual(windowBody.stories.map((s) => s.id).sort(), ['p_live', 'p_today']);

  // day=2026-08-20 → only that day's event, despite being outside the TTL window.
  const resDay = await storiesRoutes.request(`/?${bbox}&day=2026-08-20`, {}, env);
  assert.equal(resDay.status, 200);
  const dayBody = (await resDay.json()) as { stories: { id: string }[] };
  assert.deepEqual(dayBody.stories.map((s) => s.id), ['p_future']);

  // Live posts (event_date NULL) never match a day query.
  const resDay17 = await storiesRoutes.request(`/?${bbox}&day=2026-08-17`, {}, env);
  const day17 = (await resDay17.json()) as { stories: { id: string }[] };
  assert.deepEqual(day17.stories.map((s) => s.id), ['p_today']);

  // Invalid day format → 400.
  const resBad = await storiesRoutes.request(`/?${bbox}&day=17-08-2026`, {}, env);
  assert.equal(resBad.status, 400);

  // limit is respected and clamped.
  const resL1 = await storiesRoutes.request(`/?${bbox}&day=2026-08-20&limit=1`, {}, env);
  assert.equal(((await resL1.json()) as { stories: { id: string }[] }).stories.length, 1);
});

test('integration: parseStoriesLimit defaults to 50, caps at 1000, clamps to >=1', () => {
  assert.equal(parseStoriesLimit(undefined), 50);
  assert.equal(parseStoriesLimit('0'), 1);
  assert.equal(parseStoriesLimit('42'), 42);
  assert.equal(parseStoriesLimit('5000'), 1000);
  assert.equal(parseStoriesLimit('abc'), 50);
});
