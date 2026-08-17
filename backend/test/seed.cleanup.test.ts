import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneSeedData, watchdogSeedBatches } from '../src/seed/pipeline/cleanup';

test('cleanup: watchdogSeedBatches marks stale batches failed with a reason', async () => {
  const updates: { sql: string }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        all: async () => ({
          results: sql.includes('SELECT id, status FROM seed_batches')
            ? [{ id: 'stuck1', status: 'fetching' }]
            : [],
        }),
        run: async () => { updates.push({ sql }); return { meta: { changes: 1 } }; },
        first: async () => null,
      }),
      all: async () => ({ results: [] }),
      run: async () => { updates.push({ sql }); return { meta: { changes: 1 } }; },
      first: async () => null,
    }),
  } as unknown as D1Database;
  const env = { DB: db } as unknown as Env;

  const r = await watchdogSeedBatches(env, 'cron');
  assert.equal(r.stuckBatches, 1);
  const failSql = updates.find((u) => u.sql.includes('SET status=?, reason=?'));
  assert.ok(failSql, 'batch marked failed');
  assert.ok(updates.some((u) => u.sql.includes('UPDATE seed_scopes')), 'scopes marked failed');
  assert.ok(updates.some((u) => u.sql.includes('UPDATE seed_candidates')), 'candidates marked error');
});

test('cleanup: pruneSeedData removes audit older than 4 days, keeps venues', async () => {
  // Fake D1 recording DELETE statements and their WHERE bindings.
  const deletes: { sql: string; cutoff: number }[] = [];
  const db = {
    prepare: (sql: string) => {
      const record = (cutoff?: number) => ({
        run: async () => {
          deletes.push({ sql, cutoff: cutoff ?? NaN });
          return { meta: { changes: sql.includes('seed_venue_cache') ? 42 : 5 } };
        },
      });
      return {
        bind: (cutoff: number) => record(cutoff),
        run: async () => { deletes.push({ sql, cutoff: NaN }); return { meta: { changes: 42 } }; },
      };
    },
  } as unknown as D1Database;

  const env = { DB: db } as unknown as Env;
  const old = Date.now() - 10 * 24 * 3_600_000; // 10 days ago — should be pruned
  await pruneSeedData(env, 'manual');

  // seed_candidates / seed_scopes / seed_batches / seed_runs pruned by cutoff; venue_cache fully cleared.
  const cands = deletes.find((d) => d.sql.includes('seed_candidates'));
  const scopes = deletes.find((d) => d.sql.includes('seed_scopes'));
  const batches = deletes.find((d) => d.sql.includes('seed_batches'));
  const runs = deletes.find((d) => d.sql.includes('seed_runs'));
  const vc = deletes.find((d) => d.sql.includes('seed_venue_cache'));
  assert.ok(cands && cands.cutoff <= Date.now() - 4 * 24 * 3_600_000);
  assert.ok(scopes && scopes.cutoff <= Date.now() - 4 * 24 * 3_600_000, 'scopes pruned');
  assert.ok(batches, 'batches pruned');
  assert.ok(runs, 'runs pruned');
  assert.ok(vc && !vc.cutoff, 'venue cache fully cleared (no cutoff)');
  // The persistent venues store must never be pruned.
  assert.ok(!deletes.some((d) => d.sql.includes('FROM venues')), 'venues untouched');
  void old;
});
