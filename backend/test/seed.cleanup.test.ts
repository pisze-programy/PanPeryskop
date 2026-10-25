import { CONFIG } from '../src/config/index';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneExpiredPosts, pruneSeedData, pruneViatorCache } from '../src/seed/pipeline/cleanup';

test('cleanup: pruneSeedData keeps window + audit, skips open units/reconciling days', async () => {
  // Fake D1 recording DELETE statements and their WHERE bindings.
  const deletes: { sql: string; cutoff: number }[] = [];
  const db = {
    prepare: (sql: string) => {
      const record = (cutoff?: number) => ({
        run: async () => {
          deletes.push({ sql, cutoff: cutoff ?? NaN });
          return { meta: { changes: 5 } };
        },
      });
      return {
        bind: (cutoff: number) => record(cutoff),
        run: async () => { deletes.push({ sql, cutoff: NaN }); return { meta: { changes: 42 } }; },
      };
    },
  } as unknown as D1Database;

  const env = { DB: db } as unknown as Env;
  await pruneSeedData(env, 'manual');

  const raw = deletes.find((d) => d.sql.includes('seed_raw'));
  const units = deletes.find((d) => d.sql.includes('seed_units'));
  const days = deletes.find((d) => d.sql.includes('seed_days'));
  const batches = deletes.find((d) => d.sql.includes('seed_batches'));
  const runs = deletes.find((d) => d.sql.includes('seed_runs'));
  // Retention must exceed the live refill window.
  const retention = (CONFIG.seed.window.refillAhead + 6) * CONFIG.time.dayMs;
  assert.ok(retention > (CONFIG.seed.window.refillAhead + 1) * CONFIG.time.dayMs, 'retention exceeds the window');
  assert.ok(raw && raw.cutoff <= Date.now() - retention, 'raw pruned');
  assert.ok(units && units.cutoff <= Date.now() - retention, 'units pruned');
  assert.ok(units!.sql.includes("status IN ('done','failed')"), 'open units never pruned');
  assert.ok(days && days.sql.includes('reconciling=0'), 'reconciling days never pruned');
  assert.ok(batches && batches.sql.includes('NOT IN (SELECT DISTINCT batch_id FROM seed_units)'), 'batches with live units kept');
  assert.ok(runs, 'runs pruned');
  // The persistent venues store must never be pruned.
  assert.ok(!deletes.some((d) => d.sql.includes('FROM venues')), 'venues untouched');
});

test('cleanup: pruneExpiredPosts deletes non-locked past posts and child rows', async () => {
  const deletedSqls: string[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: () => ({
        all: async () => {
          if (sql.includes('FROM posts')) {
            return { results: [{ id: 'p1' }, { id: 'p2' }] };
          }
          return { results: [] };
        },
        run: async () => {
          deletedSqls.push(sql);
          return { meta: { changes: 1 } };
        },
      }),
    }),
    batch: async (stmts: Array<{ run?: () => Promise<unknown> }>) => {
      for (const s of stmts) {
        if (s.run) await s.run();
      }
      return [];
    },
  } as unknown as D1Database;

  const count = await pruneExpiredPosts(db, 7);
  assert.equal(count, 2);
  assert.ok(deletedSqls.some((s) => s.includes('DELETE FROM views')));
  assert.ok(deletedSqls.some((s) => s.includes('DELETE FROM posts')));
});

test('cleanup: pruneViatorCache deletes expired products and city cache', async () => {
  const deletedSqls: string[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: () => ({
        all: async () => {
          if (sql.includes('FROM viator_city_cache')) {
            return { results: [{ cache_key: 'k1' }] };
          }
          return { results: [] };
        },
        run: async () => {
          deletedSqls.push(sql);
          return { meta: { changes: 1 } };
        },
      }),
    }),
    batch: async (stmts: Array<{ run?: () => Promise<unknown> }>) => {
      for (const s of stmts) {
        if (s.run) await s.run();
      }
      return [];
    },
  } as unknown as D1Database;

  const count = await pruneViatorCache(db, 3);
  assert.equal(count, 1);
  assert.ok(deletedSqls.some((s) => s.includes('DELETE FROM viator_products')));
  assert.ok(deletedSqls.some((s) => s.includes('DELETE FROM viator_city_cache')));
});
