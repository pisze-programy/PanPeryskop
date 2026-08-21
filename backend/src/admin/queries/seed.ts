// Seed aggregates for the dashboard (excludes legacy provider='total' rows).
export async function seedDaySeries(db: D1Database, sinceMs: number): Promise<{ day: string; ingested: number; errors: number }[]> {
  const { results } = await db.prepare(
    `SELECT day, COALESCE(SUM(ingested),0) AS ingested, COALESCE(SUM(errors),0) AS errors
     FROM seed_runs WHERE created_at>=? AND provider<>'total' GROUP BY day ORDER BY day`
  ).bind(sinceMs).all<{ day: string; ingested: number; errors: number }>();
  return results ?? [];
}

export async function batchStatusCounts(db: D1Database, sinceMs = Date.now() - 30 * 86_400_000): Promise<{ status: string; n: number }[]> {
  const { results } = await db.prepare(
    'SELECT status, COUNT(*) n FROM seed_batches WHERE created_at>=? GROUP BY status'
  ).bind(sinceMs).all<{ status: string; n: number }>();
  return results ?? [];
}

export async function failedAdminLogins(db: D1Database, sinceMs: number): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) n FROM admin_login_attempts WHERE success=0 AND attempted_at>=?')
    .bind(sinceMs).first<{ n: number }>();
  return row?.n ?? 0;
}
