import { CONFIG } from '../../config/index';


export interface SeedRunSummary {
  id: string;
  day: string;
  run_type: string;
  created_at: number;
  updated_at: number;
  total: number;
  done: number;
  failed: number;
  active: number;
  status: string;
  last_error: string | null;
}

// Derived run status from its units — the batch row itself carries no state.
const RUN_STATUS_EXPR = `CASE
  WHEN COALESCE(SUM(CASE WHEN u.status='failed' THEN 1 ELSE 0 END),0) > 0 THEN 'failed'
  WHEN COALESCE(SUM(CASE WHEN u.status IN ('pending','claimed') THEN 1 ELSE 0 END),0) > 0 THEN 'running'
  WHEN COUNT(u.id) = 0 THEN 'created'
  ELSE 'done' END`;

/** Runs (batches) with their unit rollup, newest first. */
export async function seedRuns(db: D1Database, sinceMs: number, limit = 60): Promise<SeedRunSummary[]> {
  const { results } = await db.prepare(
    `SELECT b.id, b.day, b.run_type, b.created_at, COALESCE(MAX(u.updated_at), b.created_at) AS updated_at,
            COUNT(u.id) AS total,
            COALESCE(SUM(CASE WHEN u.status='done' THEN 1 ELSE 0 END),0) AS done,
            COALESCE(SUM(CASE WHEN u.status='failed' THEN 1 ELSE 0 END),0) AS failed,
            COALESCE(SUM(CASE WHEN u.status IN ('pending','claimed') THEN 1 ELSE 0 END),0) AS active,
            ${RUN_STATUS_EXPR} AS status,
            MAX(CASE WHEN u.status='failed' THEN u.error END) AS last_error
       FROM seed_batches b LEFT JOIN seed_units u ON u.batch_id=b.id
      WHERE b.created_at>=? GROUP BY b.id ORDER BY b.created_at DESC LIMIT ?`,
  ).bind(sinceMs, limit).all<SeedRunSummary>();
  return results ?? [];
}

/** Count of runs per derived status. */
export async function runStatusCounts(db: D1Database, sinceMs = Date.now() - 30 * CONFIG.time.dayMs): Promise<{ status: string; n: number }[]> {
  const { results } = await db.prepare(
    `SELECT status, COUNT(*) n FROM (
       SELECT b.id, ${RUN_STATUS_EXPR} AS status
         FROM seed_batches b LEFT JOIN seed_units u ON u.batch_id=b.id
        WHERE b.created_at>=? GROUP BY b.id
     ) GROUP BY status`,
  ).bind(sinceMs).all<{ status: string; n: number }>();
  return results ?? [];
}

/** Runs per Warsaw day, stacked by derived status. */
export async function runStatusSeries(db: D1Database, sinceMs: number): Promise<{ d: string; done: number; failed: number; running: number }[]> {
  const { results } = await db.prepare(
    `SELECT d, COALESCE(SUM(status='done'),0) done, COALESCE(SUM(status='failed'),0) failed,
            COALESCE(SUM(status='running'),0) running
       FROM (
         SELECT date(b.created_at/1000,'unixepoch','+2 hours') AS d, ${RUN_STATUS_EXPR} AS status
           FROM seed_batches b LEFT JOIN seed_units u ON u.batch_id=b.id
          WHERE b.created_at>=? GROUP BY b.id
       ) GROUP BY d ORDER BY d`,
  ).bind(sinceMs).all<{ d: string; done: number; failed: number; running: number }>();
  return results ?? [];
}

/** Unit rows for the run drill-down. */
export async function unitsForRuns(db: D1Database, batchIds: string[]): Promise<Record<string, unknown>[]> {
  if (batchIds.length === 0) return [];
  const ph = batchIds.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT batch_id, day, provider, slice, executor, kind, status, attempts, rows_written, error, updated_at
       FROM seed_units WHERE batch_id IN (${ph}) ORDER BY provider, slice, day`,
  ).bind(...batchIds).all<Record<string, unknown>>();
  return results ?? [];
}

/** Per-provider unit health for the current window. */
export async function providerUnitHealth(db: D1Database, sinceMs: number): Promise<Record<string, number & string>[]> {
  const { results } = await db.prepare(
    `SELECT provider, COUNT(*) units,
            COALESCE(SUM(CASE WHEN status='done' THEN 1 ELSE 0 END),0) done,
            COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) failed,
            COALESCE(SUM(rows_written),0) rows,
            MAX(updated_at) updated_at
       FROM seed_units WHERE updated_at>=? GROUP BY provider ORDER BY done DESC`,
  ).bind(sinceMs).all<Record<string, number & string>>();
  return results ?? [];
}

/** Per-Warsaw-day ingest series from the raw rows (done = ingested, error/failure = errors). */
export async function seedIngestSeries(db: D1Database, sinceMs: number): Promise<{ d: string; ingested: number; errors: number }[]> {
  const { results } = await db.prepare(
    `SELECT date(created_at/1000,'unixepoch','+2 hours') AS d,
            COALESCE(SUM(CASE WHEN status='done' THEN 1 ELSE 0 END),0) AS ingested,
            COALESCE(SUM(CASE WHEN status IN ('error','failure') THEN 1 ELSE 0 END),0) AS errors
       FROM seed_raw WHERE created_at>=? GROUP BY d ORDER BY d`,
  ).bind(sinceMs).all<{ d: string; ingested: number; errors: number }>();
  return results ?? [];
}

export async function failedAdminLogins(db: D1Database, sinceMs: number): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) n FROM admin_login_attempts WHERE success=0 AND attempted_at>=?')
    .bind(sinceMs).first<{ n: number }>();
  return row?.n ?? 0;
}
