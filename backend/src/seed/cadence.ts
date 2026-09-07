// Seed cadence: the full window is refilled every SEED_INTERVAL_DAYS instead of
// rolling daily. The marker (last_seed_day in D1) lets missed cycles catch up
// (a run happens whenever >= interval days have passed). Warms and the VPS
// orchestrator read the same cadence via GET /admin/seed/cadence so they only
// run on seed days.
import { SEED_INTERVAL_DAYS } from './core/constants';

const KEY = 'last_seed_day';

export async function getLastSeedDay(db: D1Database): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM seed_cadence WHERE key=?').bind(KEY).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setLastSeedDay(db: D1Database, day: string): Promise<void> {
  await db
    .prepare('INSERT INTO seed_cadence (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(KEY, day)
    .run();
}

/** Due iff never seeded (bootstrap) or >= SEED_INTERVAL_DAYS since the last seed. */
export function seedDue(lastSeedDay: string | null, today: string): boolean {
  if (!lastSeedDay) return true;
  const last = Date.parse(`${lastSeedDay}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  const days = Math.round((now - last) / 86_400_000);
  return days >= SEED_INTERVAL_DAYS;
}