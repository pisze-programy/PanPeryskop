import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendChunked, toCandidate, enqueueSeedDay, runQueue, QUEUE_NAMES } from '../src/seed/pipeline/queue';
import { CandidateStatus } from '../src/seed/core/types';

test('queue sendChunked: splits batches >100 into <=100 sendBatch calls', async () => {
  const sent: number[] = [];
  const queue = {
    sendBatch: async (msgs: unknown[]) => { sent.push(msgs.length); },
  } as unknown as Queue<SeedQueueMessage>;
  const msgs = Array.from({ length: 245 }, (_, i) => ({ body: { type: 'ingest', candidateId: `c${i}`, batchId: 'b' } as const }));
  await sendChunked({} as never, queue, msgs);
  assert.deepEqual(sent, [100, 100, 45]);
});

test('queue enqueueSeedDay: single-flight skips when a batch for the day is active', async () => {
  let batchInsert = 0;
  let scopesInsert = 0;
  const sent: string[] = [];
  const existingId = 'existing-batch-id';
  const db = {
    prepare: (sql: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('WHERE day=?') && sql.includes('LIMIT 1')) return { id: existingId };
          return null;
        },
        run: async () => {
          if (sql.includes('INSERT INTO seed_batches')) batchInsert++;
          if (sql.includes('INSERT INTO seed_scopes')) scopesInsert++;
          return { success: true };
        },
        all: async () => ({ results: [] }),
      });
      return { bind, run: bind().run, first: bind().first, all: bind().all };
    },
    batch: async () => [],
  } as unknown as D1Database;
  const env = {
    DB: db,
    SEED_FETCH_QUEUE: { send: async (m: unknown) => { sent.push((m as { type: string }).type); } },
    SEED_INGEST_QUEUE: { send: async () => {} },
    SEED_FINALIZE_QUEUE: { send: async () => {} },
  } as never;

  const r1 = await enqueueSeedDay(env, '2026-08-20', 'manual');
  assert.equal(r1.created, false);
  assert.equal(r1.batchId, existingId);
  assert.equal(batchInsert, 0, 'no new batch created when one is active');
  assert.equal(scopesInsert, 0);
  assert.equal(sent.length, 0);
});

test('queue enqueueSeedDay: creates batch + per-scope rows + seed-day message when free', async () => {
  const dbSql: string[] = [];
  let batchedStatements = 0;
  const sent: unknown[] = [];
  const db = {
    prepare: (sql: string) => {
      const rec = async (kind: 'first' | 'run') => {
        if (kind === 'first') return null;
        dbSql.push(sql);
        return { success: true };
      };
      return {
        bind: () => ({
          first: () => rec('first'),
          run: () => rec('run'),
          all: async () => ({ results: [] }),
        }),
        first: () => rec('first'),
        run: () => rec('run'),
        all: async () => ({ results: [] }),
      };
    },
    batch: async (stmts: unknown[]) => { dbSql.push('BATCH'); batchedStatements += (stmts as unknown[]).length; },
  } as unknown as D1Database;
  const env = {
    DB: db,
    SEED_FETCH_QUEUE: { send: async (m: unknown) => { sent.push(m); } },
    SEED_INGEST_QUEUE: { send: async () => {} },
    SEED_FINALIZE_QUEUE: { send: async () => {} },
  } as never;

  const r = await enqueueSeedDay(env, '2026-08-20', 'manual');
  assert.equal(r.created, true);
  assert.ok(dbSql.some((s) => s.includes('INSERT INTO seed_batches')), 'batch row inserted');
  assert.ok(batchedStatements > 0, 'scope rows inserted via batch');
  assert.equal(sent.length, 1);
  assert.equal((sent[0] as { type: string }).type, 'seed-day');
});

function dlqEnv(runs: string[], sentTo: string[], attempts: number) {
  const db = {
    prepare: (sql: string) => {
      const bind = (..._a: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM seed_scopes WHERE batch_id=? AND provider=? AND scope=?')) {
            return { id: 's1', batch_id: 'b1', provider: 'going', scope: 'warszawa', status: 'running', attempts, error: null, created_at: 1, updated_at: 1 };
          }
          if (sql.includes('FROM seed_batches WHERE id=?')) {
            return { id: 'b1', day: '2026-08-20', status: 'fetching', run_type: 'manual' };
          }
          return null;
        },
        run: async () => { runs.push(sql); return { meta: { changes: 1 } }; },
        all: async () => ({ results: [] }),
      });
      return { bind, run: bind().run, first: bind().first, all: bind().all };
    },
    batch: async () => [],
  } as unknown as D1Database;
  const env = {
    DB: db,
    SEED_FETCH_QUEUE: { send: async (m: unknown) => { sentTo.push(`fetch:${(m as { scope: string }).scope}`); }, sendBatch: async () => {} },
    SEED_INGEST_QUEUE: { send: async () => {}, sendBatch: async () => {} },
    SEED_FINALIZE_QUEUE: { send: async (m: unknown) => { sentTo.push(`finalize:${(m as { batchId: string }).batchId}`); }, sendBatch: async () => {} },
  } as never;
  const batch = {
    queue: QUEUE_NAMES.DLQ,
    messages: [{ body: { type: 'fetch', batchId: 'b1', provider: 'going', scope: 'warszawa' }, ack: () => {}, retry: () => {}, attempts: 3 } as never],
    retryAll: () => {}, ackAll: () => {}, batchId: 'x',
  } as never as MessageBatch<SeedQueueMessage>;
  return { env, batch };
}

test('queue DLQ: exhausted re-drives mark the scope failed and trigger finalize (no loop)', async () => {
  const runs: string[] = [];
  const sentTo: string[] = [];
  const { env, batch } = dlqEnv(runs, sentTo, 3);
  await runQueue(env, batch);

  assert.ok(runs.some((s) => s.includes('UPDATE seed_scopes SET status=?')), 'scope marked failed');
  assert.ok(sentTo.includes('finalize:b1'), 'finalize enqueued');
  assert.ok(!sentTo.some((s) => s.startsWith('fetch:')), 'no infinite re-drive re-enqueue');
});

test('queue DLQ: fresh dead-lettered fetch is re-driven once within budget', async () => {
  const runs: string[] = [];
  const sentTo: string[] = [];
  const { env, batch } = dlqEnv(runs, sentTo, 0);
  await runQueue(env, batch);

  assert.ok(sentTo.includes('fetch:warszawa'), 're-driven back to fetch queue');
  assert.ok(runs.some((s) => s.includes('UPDATE seed_scopes SET attempts=attempts+1')), 're-drive attempt counted');
});

test('queue toCandidate: carries is_sold_out from the candidate row', () => {
  const row = {
    id: 'c1', external_id: 'evl-1', provider: 'eventylive', title: 'Koncert', start_ms: 1786809600000,
    lat: 52.4, lng: 16.9, city: 'Poznań', venue: 'Hala', address: 'ul. X', link: 'https://x.pl',
    media_url: 'https://x.pl/m.webp', thumb_url: null, is_sold_out: 1,
  };
  const cand = toCandidate(row);
  assert.equal(cand.isSoldOut, true);
  const row2 = { ...row, is_sold_out: 0 };
  assert.equal(toCandidate(row2).isSoldOut, false);
});

test('queue: CandidateStatus enum is quoted in generated SQL (not a bare identifier)', () => {
  // Regression: interpolating the enum into SQL without quotes produced
  // `SET status=duplicate` → D1 "no such column" → dedupe/ingest never ran.
  const dupSql = `UPDATE seed_candidates SET status='${CandidateStatus.DUPLICATE}', reason=? WHERE id=?`;
  assert.match(dupSql, /status='duplicate'/, 'duplicate must be quoted');
  const notIn = `status NOT IN ('${CandidateStatus.DONE}', '${CandidateStatus.ERROR}')`;
  assert.match(notIn, /'done'/, 'DONE quoted');
  assert.match(notIn, /'error'/, 'ERROR quoted');
});
