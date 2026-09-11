import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneSeedData } from '../src/seed/pipeline/cleanup';
import { DAY_MS } from '../src/seed/core/constants';

test('cleanup: pruneSeedData removes audit older than 4 days, keeps venues', async () => {
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
  const batches = deletes.find((d) => d.sql.includes('seed_batches'));
  const runs = deletes.find((d) => d.sql.includes('seed_runs'));
  assert.ok(raw && raw.cutoff <= Date.now() - 4 * DAY_MS, 'raw pruned');
  assert.ok(units && units.cutoff <= Date.now() - 4 * DAY_MS, 'units pruned');
  assert.ok(batches, 'batches pruned');
  assert.ok(runs, 'runs pruned');
  // The persistent venues store must never be pruned.
  assert.ok(!deletes.some((d) => d.sql.includes('FROM venues')), 'venues untouched');
});
