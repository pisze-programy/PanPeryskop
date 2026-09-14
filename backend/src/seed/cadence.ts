import { CONFIG } from '../config/index';


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
  const days = Math.round((now - last) / CONFIG.time.dayMs);
  return days >= CONFIG.seed.window.intervalDays;
}