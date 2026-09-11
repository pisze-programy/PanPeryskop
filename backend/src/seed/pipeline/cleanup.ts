// Automatic cleanup of seed audit data (batches/scopes/candidates/runs).
// Runs daily via a dedicated cron trigger; keeps only the last
// 4 days of audit (matching the queue's 4-day message retention). The shared
// `venues` table (persistent venue geo) is NEVER pruned — it is the long-lived
// geo store that makes per-event venue fetches unnecessary.
import { RunType } from '../core/types';
import { DAY_MS, HOUR_MS } from '../core/constants';

const SEED_RETENTION_MS = 4 * DAY_MS; // 4 days

export interface PruneResult {
  removedCandidates: number;
  removedScopes: number;
  removedUnits: number;
  removedRaw: number;
  removedBatches: number;
  removedRuns: number;
  runType: RunType;
}

export async function pruneSeedData(env: Env, runType: RunType = 'cron'): Promise<PruneResult> {
  const cutoff = Date.now() - SEED_RETENTION_MS;
  // Delete children BEFORE seed_batches: seed_units/seed_raw/reconciliation_failures
  // (and the legacy seed_scopes/seed_candidates) all carry a batch FK. Deleting a
  // batch first would violate the constraint and fail the cron.
  const delRaw = await env.DB.prepare('DELETE FROM seed_raw WHERE created_at < ?').bind(cutoff).run();
  const delFail = await env.DB.prepare('DELETE FROM reconciliation_failures WHERE created_at < ?').bind(cutoff).run();
  const delUnits = await env.DB.prepare('DELETE FROM seed_units WHERE created_at < ?').bind(cutoff).run();
  await env.DB.prepare('DELETE FROM seed_days WHERE updated_at < ?').bind(cutoff).run();
  const delCands = await env.DB.prepare('DELETE FROM seed_candidates WHERE created_at < ?').bind(cutoff).run();
  const delScopes = await env.DB.prepare('DELETE FROM seed_scopes WHERE created_at < ?').bind(cutoff).run();
  const delBatches = await env.DB.prepare('DELETE FROM seed_batches WHERE created_at < ?').bind(cutoff).run();
  const delRuns = await env.DB.prepare('DELETE FROM seed_runs WHERE created_at < ?').bind(cutoff).run();

  const result: PruneResult = {
    removedCandidates: delCands.meta.changes,
    removedScopes: delScopes.meta.changes,
    removedUnits: delUnits.meta.changes,
    removedRaw: delRaw.meta.changes + delFail.meta.changes,
    removedBatches: delBatches.meta.changes,
    removedRuns: delRuns.meta.changes,
    runType,
  };
  console.log(`seed cleanup ${runType}: ${JSON.stringify(result)}`);
  return result;
}

// Liveness watchdog: batches stuck in 'created'/'fetching'/'ingesting' with no
// activity for STUCK_MS are marked 'failed' with a visible reason. This is the
// backstop for anything the DLQ re-drive couldn't resolve — without it a single
// lost message would leave a batch in 'fetching' forever (the old deadlock).
const STUCK_MS = 2 * HOUR_MS; // 2h without any batch activity

export interface WatchdogResult {
  stuckBatches: number;
  runType: RunType;
}

export async function watchdogSeedBatches(env: Env, runType: RunType = 'cron'): Promise<WatchdogResult> {
  const cutoff = Date.now() - STUCK_MS;
  const { results } = await env.DB.prepare(
    `SELECT id, status FROM seed_batches
     WHERE status IN ('created','fetching','ingesting') AND updated_at < ?`
  ).bind(cutoff).all<{ id: string; status: string }>();

  for (const b of results || []) {
    const t = Date.now();
    await env.DB.prepare('UPDATE seed_batches SET status=?, reason=?, updated_at=? WHERE id=?')
      .bind('failed', `watchdog: no activity while in ${b.status} for ${STUCK_MS / HOUR_MS}h`, t, b.id).run();
    // Mark any non-terminal scopes/candidates so audit stays consistent.
    await env.DB.prepare(`UPDATE seed_scopes SET status='failed', error='watchdog: batch timed out', updated_at=? WHERE batch_id=? AND status NOT IN ('done','failed')`)
      .bind(t, b.id).run();
    await env.DB.prepare(`UPDATE seed_candidates SET status='${'error'}', reason='watchdog: batch timed out', updated_at=? WHERE batch_id=? AND status NOT IN ('done','duplicate','no_media','no_coords','error')`)
      .bind(t, b.id).run();
  }
  const stuck = (results || []).length;
  if (stuck) console.log(`seed watchdog ${runType}: ${stuck} stuck batch(es) marked failed`);
  return { stuckBatches: stuck, runType };
}
