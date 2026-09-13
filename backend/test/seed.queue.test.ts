import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendChunked, type SeedQueueMessage } from '../src/seed/pipeline/queue';
import { handleFinalizeWake, INGEST_CHUNK } from '../src/seed/pipeline/queue/finalize';

test('queue sendChunked: splits batches >100 into <=100 sendBatch calls', async () => {
  const sent: number[] = [];
  const queue = {
    sendBatch: async (msgs: unknown[]) => { sent.push(msgs.length); },
  } as unknown as Queue<SeedQueueMessage>;
  const msgs = Array.from({ length: 245 }, () => ({ body: { type: 'unit' } as const }));
  await sendChunked({} as never, queue, msgs);
  assert.deepEqual(sent, [100, 100, 45]);
});

// Minimal D1 for the finalize path. Reconcile is a no-op (no open units, no raw
// rows). Winners are staged with an UNKNOWN provider so ingestWinnerRow is never
// reached — the test exercises the chunk loop + remaining bookkeeping, not ingest.
class FakeFinalizeDB {
  winners: { id: string; provider: string; external_id: string }[];
  constructor(n: number) {
    this.winners = Array.from({ length: n }, (_, i) => ({ id: `r${i}`, provider: 'nonexistent', external_id: `e${i}` }));
  }
  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: unknown[]) {
        return {
          async first<T>(): Promise<T | null> {
            if (sql.includes('FROM seed_units')) return { n: 0 } as T;            // no open units
            if (sql.includes("status='raw'")) return { n: 0 } as T;               // nothing to reconcile
            if (sql.includes('FROM users WHERE device_id')) return { id: 'u1' } as T;
            if (sql.includes('COUNT(*) AS n FROM seed_raw')) return { n: db.winners.length } as T;
            throw new Error(`unexpected first: ${sql.slice(0, 60)}`);
          },
          async all<T>(): Promise<{ results: T[] }> {
            if (sql.includes("FROM seed_raw WHERE day=? AND status='winner'")) {
              return { results: db.winners.slice(0, Number(args[1])) as T[] };
            }
            throw new Error(`unexpected all: ${sql.slice(0, 60)}`);
          },
          async run(): Promise<{ meta: { changes: number } }> {
            if (sql.includes("SET status='winner'")) return { meta: { changes: 0 } }; // sweepStuckRaw no-op
            if (sql.includes("SET status='error'")) {
              const before = db.winners.length;
              db.winners = db.winners.filter((w) => w.id !== String(args[2]));
              return { meta: { changes: before - db.winners.length } };
            }
            throw new Error(`unexpected run: ${sql.slice(0, 60)}`);
          },
        };
      },
    };
  }
}

test('finalize: ingests in chunks, re-enqueues while winners remain, stops at 0', async () => {
  const db = new FakeFinalizeDB(INGEST_CHUNK + 50);
  const sent: SeedQueueMessage[] = [];
  const env = {
    DB: db as unknown as D1Database,
    SEED_FETCH_QUEUE: { send: async (m: SeedQueueMessage) => { sent.push(m); } },
  } as never;

  await handleFinalizeWake(env, '2026-09-08', 'b1');
  assert.equal(db.winners.length, 50, 'one bounded chunk consumed');
  assert.deepEqual(sent, [{ type: 'finalize', day: '2026-09-08', batchId: 'b1' }], 'chain while winners remain');

  sent.length = 0;
  await handleFinalizeWake(env, '2026-09-08', 'b1');
  assert.equal(db.winners.length, 0, 'second wake drained the rest');
  assert.deepEqual(sent, [], 'no chain once nothing remains');
});
