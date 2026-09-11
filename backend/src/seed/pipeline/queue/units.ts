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
import { SEED_REFILL_AHEAD } from '../../core/constants';
import { now } from './state';

// How long a claim lives before the unit may be re-claimed by someone else.
export const UNIT_LEASE_MS = 30 * 60_000;

// A unit that fails this many times is terminal — never re-opened by a refresh.
export const MAX_UNIT_ATTEMPTS = 3;

export interface UnitRow {
  id: string;
  day: string;      // day units: the event day; window units: the window anchor (start)
  batch_id: string;
  provider: string;
  slice: string;
  executor: 'worker' | 'vps';
  kind: 'day' | 'window';
  generation: number;
}

/** Pure planner: one unit per (enabled provider with an executor, scope).
 *  Manual providers (no executor, e.g. facebook) produce no units.
 *
 *  Granularity follows the provider's `scopeKind`:
 *    'window' — ONE unit per (provider, scope) covering the whole window; the
 *               provider's fetch already returns every day at once, so planning
 *               per day would re-fetch the same payload N times.
 *    'day'    — one unit per (provider, scope, day) for every day in the window.
 *  `windowStart` anchors window-unit rows (and is the unique-key day component
 *  for them), so a later seed run (new window) creates fresh rows. */
export function planSeedUnits(opts: {
  windowStart: string;
  days: string[];
  batchId: string;
  generation: number;
}): UnitRow[] {
  const { windowStart, days, batchId, generation } = opts;
  const out: UnitRow[] = [];
  for (const p of SEED_PROVIDERS) {
    const config = configOf(p.id);
    if (!config?.enabled) continue;
    const executor = config.executors.vps ? 'vps' : config.executors.worker ? 'worker' : null;
    if (!executor) continue;
    const kind = config.scopeKind;
    if (kind === 'window') {
      for (const scope of p.scopes) {
        out.push({ id: nanoid(24), day: windowStart, batch_id: batchId, provider: p.id, slice: scope, executor, kind, generation });
      }
    } else {
      for (const day of days) {
        for (const scope of p.scopes) {
          out.push({ id: nanoid(24), day, batch_id: batchId, provider: p.id, slice: scope, executor, kind, generation });
        }
      }
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
          (id, day, batch_id, provider, slice, executor, kind, generation, status, attempts, rows_written, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)`,
      ).bind(u.id, u.day, u.batch_id, u.provider, u.slice, u.executor, u.kind, u.generation, t, t),
    );
  }
  for (let i = 0; i < stmts.length; i += chunkSize) await db.batch(stmts.slice(i, i + chunkSize));
}

export interface ClaimedUnit extends UnitRow {
  attempts: number;
  token: string;
}

/** Claim one unit for an executor: a pending unit, or a claimed one whose lease
 *  expired (its owner crashed). Returns the unit + the claim token THIS caller
 *  must present to complete/fail it, or null when nothing is claimable. Race-safe:
 *  the UPDATE flips the row only while it is still claimable, so concurrent
 *  claimants get changes=0 except one. */
export async function claimUnit(db: D1Database, executor: 'worker' | 'vps'): Promise<ClaimedUnit | null> {
  const token = nanoid(16);
  const t = now();
  const candidate = await db
    .prepare(
      `SELECT id FROM seed_units
        WHERE executor=? AND (status='pending' OR (status='claimed' AND lease_expires_at < ?))
        ORDER BY created_at LIMIT 1`,
    )
    .bind(executor, t)
    .first<{ id: string }>();
  if (!candidate) return null;
  const flipped = await db
    .prepare(
      `UPDATE seed_units SET status='claimed', claimed_by=?, claimed_at=?, lease_expires_at=?, attempts=attempts+1, updated_at=?
        WHERE id=? AND (status='pending' OR (status='claimed' AND lease_expires_at < ?))`,
    )
    .bind(token, t, t + UNIT_LEASE_MS, t, candidate.id, t)
    .run();
  if (Number(flipped?.meta?.changes ?? 0) !== 1) return null; // someone else won it
  const row = await db
    .prepare(`SELECT id, day, batch_id, provider, slice, executor, kind, generation, attempts FROM seed_units WHERE id=? AND claimed_by=?`)
    .bind(candidate.id, token)
    .first<Omit<ClaimedUnit, 'token'>>();
  return row ? { ...row, token } : null;
}

/** Mark a unit done. Only the claim owner (token) may complete a claimed unit. */
export async function completeUnit(db: D1Database, unitId: string, token: string, rowsWritten: number): Promise<boolean> {
  const r = await db
    .prepare(`UPDATE seed_units SET status='done', rows_written=?, updated_at=? WHERE id=? AND status='claimed' AND claimed_by=?`)
    .bind(rowsWritten, now(), unitId, token)
    .run();
  return Number(r?.meta?.changes ?? 0) === 1;
}

/** Mark a unit failed. Only the claim owner (token) may fail a claimed unit. */
export async function failUnit(db: D1Database, unitId: string, token: string, error: string): Promise<boolean> {
  const r = await db
    .prepare(`UPDATE seed_units SET status='failed', error=?, updated_at=? WHERE id=? AND status='claimed' AND claimed_by=?`)
    .bind(error.slice(0, 500), now(), unitId, token)
    .run();
  return Number(r?.meta?.changes ?? 0) === 1;
}

/** Lease repair (watchdog): a claimed unit whose lease expired goes back to
 *  pending for a retry, unless it already exhausted MAX_UNIT_ATTEMPTS — then it
 *  is marked failed. Returns the number of units touched. Never schedules work. */
export async function watchdogUnits(db: D1Database): Promise<{ requeued: number; failed: number }> {
  const t = now();
  const requeued = await db
    .prepare(
      `UPDATE seed_units SET status='pending', claimed_by=NULL, claimed_at=NULL, lease_expires_at=NULL, updated_at=?
        WHERE status='claimed' AND lease_expires_at < ? AND attempts < ?`,
    )
    .bind(t, t, MAX_UNIT_ATTEMPTS)
    .run();
  const failed = await db
    .prepare(
      `UPDATE seed_units SET status='failed', error='lease expired after max attempts', updated_at=?
        WHERE status='claimed' AND lease_expires_at < ? AND attempts >= ?`,
    )
    .bind(t, t, MAX_UNIT_ATTEMPTS)
    .run();
  return { requeued: Number(requeued?.meta?.changes ?? 0), failed: Number(failed?.meta?.changes ?? 0) };
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

/** Units that can still write raw rows for the event day `day` and are NOT yet
 *  terminal: a day unit for `day`, or a window unit whose anchor window covers it.
 *  Used as the reconcile gate (0 = the day's fetch work is complete). */
export async function countOpenUnitsForDay(db: D1Database, day: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM seed_units
        WHERE status IN ('pending','claimed')
          AND ((kind='day' AND day=?) OR (kind='window' AND day<=? AND date(day, '+' || ? || ' day') >= ?))`,
    )
    .bind(day, day, SEED_REFILL_AHEAD, day)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
