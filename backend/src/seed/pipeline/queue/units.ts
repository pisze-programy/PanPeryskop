// Durable unit work-list (the "Kafka-like" list) for the queue redesign.
// One row per (day, provider, slice). CF consumers claim via queue wake-ups;
// the VPS poller claims via POST /seed/units/claim. Exactly one winner per unit:
// the claim UPDATE flips status only from 'pending', and ownership is verified
// by the claim token. A stuck claim (lease expiry) goes back to pending via the
// watchdog path (step 6+; lease is recorded here already).
//
// Shadow mode: the producer writes these rows next to seed_scopes, but nothing
// routes through them yet. All writes here are best-effort and must never break
// the existing pipeline.
import { nanoid } from 'nanoid';
import { SEED_PROVIDERS } from '../../providers';
import { configOf } from '../../providers/registry';
import { now } from './state';

// How long a claim lives before the unit may be re-claimed by someone else.
export const UNIT_LEASE_MS = 30 * 60_000;

export interface UnitRow {
  id: string;
  day: string;
  batch_id: string;
  provider: string;
  slice: string;
  executor: 'worker' | 'vps';
}

/** Pure planner: one unit per (enabled provider with an executor, scope).
 *  Manual providers (no executor, e.g. facebook) produce no units. */
export function planDayUnits(day: string, batchId: string): UnitRow[] {
  const out: UnitRow[] = [];
  for (const p of SEED_PROVIDERS) {
    const config = configOf(p.id);
    if (!config?.enabled) continue;
    const executor = config.executors.vps ? 'vps' : config.executors.worker ? 'worker' : null;
    if (!executor) continue;
    for (const scope of p.scopes) {
      out.push({ id: nanoid(24), day, batch_id: batchId, provider: p.id, slice: scope, executor });
    }
  }
  return out;
}

/** Persist planned units. INSERT OR IGNORE: re-enqueueing the same day must not
 *  explode on the UNIQUE(day, provider, slice) index. Chunked like seed_scopes. */
export async function writeDayUnits(
  db: D1Database,
  units: UnitRow[],
  t: number,
  chunkSize: number,
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const u of units) {
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO seed_units
          (id, day, batch_id, provider, slice, executor, status, attempts, rows_written, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)`,
      ).bind(u.id, u.day, u.batch_id, u.provider, u.slice, u.executor, t, t),
    );
  }
  for (let i = 0; i < stmts.length; i += chunkSize) await db.batch(stmts.slice(i, i + chunkSize));
}

export interface ClaimedUnit extends UnitRow {
  attempts: number;
}

/** Claim one pending unit for an executor. Returns the unit when THIS caller won
 *  it (verified by claim token), null otherwise. Race-safe: the UPDATE flips the
 *  row only from 'pending', so concurrent claimants get changes=0 except one. */
export async function claimUnit(db: D1Database, executor: 'worker' | 'vps'): Promise<ClaimedUnit | null> {
  const token = nanoid(16);
  const t = now();
  const pending = await db
    .prepare(`SELECT id FROM seed_units WHERE status='pending' AND executor=? ORDER BY created_at LIMIT 1`)
    .bind(executor)
    .first<{ id: string }>();
  if (!pending) return null;
  const flipped = await db
    .prepare(
      `UPDATE seed_units SET status='claimed', claimed_by=?, claimed_at=?, lease_expires_at=?, attempts=attempts+1, updated_at=?
        WHERE id=? AND status='pending'`,
    )
    .bind(token, t, t + UNIT_LEASE_MS, t, pending.id)
    .run();
  if (Number(flipped?.meta?.changes ?? 0) !== 1) return null; // someone else won it
  const row = await db
    .prepare(`SELECT id, day, batch_id, provider, slice, executor, attempts FROM seed_units WHERE id=? AND claimed_by=?`)
    .bind(pending.id, token)
    .first<ClaimedUnit>();
  return row;
}

/** Mark a unit done (rowsWritten = Phase-1 rows staged). */
export async function completeUnit(db: D1Database, unitId: string, rowsWritten: number): Promise<boolean> {
  const r = await db
    .prepare(`UPDATE seed_units SET status='done', rows_written=?, updated_at=? WHERE id=? AND status IN ('claimed','pending')`)
    .bind(rowsWritten, now(), unitId)
    .run();
  return Number(r?.meta?.changes ?? 0) === 1;
}

/** Mark a unit failed with a reason. Never throws: called from error paths. */
export async function failUnit(db: D1Database, unitId: string, error: string): Promise<void> {
  await db
    .prepare(`UPDATE seed_units SET status='failed', error=?, updated_at=? WHERE id=?`)
    .bind(error.slice(0, 500), now(), unitId)
    .run();
}

/** Counts by status for one day — the future reconcile gate and today's debug view. */
export async function unitDayStatus(db: D1Database, day: string): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(`SELECT status, COUNT(*) n FROM seed_units WHERE day=? GROUP BY status`)
    .bind(day)
    .all<{ status: string; n: number }>();
  const out: Record<string, number> = {};
  for (const r of results || []) out[r.status] = r.n;
  return out;
}
