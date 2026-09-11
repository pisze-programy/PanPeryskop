// Automatic cleanup of seed audit data (raw/units/runs/batches). Runs daily via
// a dedicated cron trigger; keeps only the last 4 days. The shared `venues` table
// (persistent venue geo) is NEVER pruned.
import { RunType } from '../core/types';
import { DAY_MS } from '../core/constants';

const SEED_RETENTION_MS = 4 * DAY_MS; // 4 days

export interface PruneResult {
  removedUnits: number;
  removedRaw: number;
  removedBatches: number;
  removedRuns: number;
  runType: RunType;
}

export async function pruneSeedData(env: Env, runType: RunType = 'cron'): Promise<PruneResult> {
  const cutoff = Date.now() - SEED_RETENTION_MS;
  // Delete children BEFORE seed_batches: seed_units/seed_raw/reconciliation_failures
  // all carry a batch FK. Deleting a batch first would violate the constraint.
  const delRaw = await env.DB.prepare('DELETE FROM seed_raw WHERE created_at < ?').bind(cutoff).run();
  const delFail = await env.DB.prepare('DELETE FROM reconciliation_failures WHERE created_at < ?').bind(cutoff).run();
  const delUnits = await env.DB.prepare('DELETE FROM seed_units WHERE created_at < ?').bind(cutoff).run();
  await env.DB.prepare('DELETE FROM seed_days WHERE updated_at < ?').bind(cutoff).run();
  const delBatches = await env.DB.prepare('DELETE FROM seed_batches WHERE created_at < ?').bind(cutoff).run();
  const delRuns = await env.DB.prepare('DELETE FROM seed_runs WHERE created_at < ?').bind(cutoff).run();

  const result: PruneResult = {
    removedUnits: delUnits.meta.changes,
    removedRaw: delRaw.meta.changes + delFail.meta.changes,
    removedBatches: delBatches.meta.changes,
    removedRuns: delRuns.meta.changes,
    runType,
  };
  console.log(`seed cleanup ${runType}: ${JSON.stringify(result)}`);
  return result;
}

// Keep only the last `keepDays` daily kupbilecik manifests in R2
// (seed/kupbilecik/<day>.json) — they accumulate one file per day otherwise.
export async function pruneSeedManifests(env: Env, keepDays = 10): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * DAY_MS).toISOString().slice(0, 10);
  let cursor: string | undefined;
  let removed = 0;
  do {
    const page = await env.MEDIA.list({ prefix: 'seed/kupbilecik/', cursor });
    for (const o of page.objects) {
      const m = /seed\/kupbilecik\/(\d{4}-\d{2}-\d{2})\.json$/.exec(o.key);
      if (m && m[1] < cutoff) { await env.MEDIA.delete(o.key); removed += 1; }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  if (removed) console.log(`seed manifests pruned: ${removed} (kept last ${keepDays} days)`);
  return removed;
}
