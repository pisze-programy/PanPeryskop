// Automatic cleanup of seed audit data (batches/candidates/runs + the legacy
// seed_venue_cache). Runs daily via a dedicated cron trigger; keeps only the last
// 4 days of audit (matching the queue's 4-day message retention). The shared
// `venues` table (persistent venue geo) is NEVER pruned — it is the long-lived
// geo store that makes per-event venue fetches unnecessary.
import { RunType } from './types';

const SEED_RETENTION_MS = 4 * 24 * 3600 * 1000; // 4 days

export interface PruneResult {
  removedCandidates: number;
  removedBatches: number;
  removedRuns: number;
  removedVenueCache: number;
  runType: RunType;
}

export async function pruneSeedData(env: Env, runType: RunType = 'cron'): Promise<PruneResult> {
  const cutoff = Date.now() - SEED_RETENTION_MS;
  // Delete candidates older than the cutoff; then batches/runs (no FK to posts).
  const delCands = await env.DB.prepare('DELETE FROM seed_candidates WHERE created_at < ?').bind(cutoff).run();
  const delBatches = await env.DB.prepare('DELETE FROM seed_batches WHERE created_at < ?').bind(cutoff).run();
  const delRuns = await env.DB.prepare('DELETE FROM seed_runs WHERE created_at < ?').bind(cutoff).run();
  // Legacy table no longer referenced by the code — drop entirely each run.
  const delVc = await env.DB.prepare('DELETE FROM seed_venue_cache').run();

  const result: PruneResult = {
    removedCandidates: delCands.meta.changes,
    removedBatches: delBatches.meta.changes,
    removedRuns: delRuns.meta.changes,
    removedVenueCache: delVc.meta.changes,
    runType,
  };
  console.log(`seed cleanup ${runType}: ${JSON.stringify(result)}`);
  return result;
}
