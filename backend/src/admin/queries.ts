// Shared D1 query helpers for the dashboard (per-day series, budget, cron state).
import { browserBudget } from '../seed/log';
import { CITIES, cityBbox } from './cities';
import { CRON_SCHEDULES, nextCronRunMs, cronSummary } from './cron';

// Per-day series grouped by Warsaw date. `table`/`col` come only from callers'
// fixed literals (never user input).
export async function daySeries(
  db: D1Database,
  table: string,
  col: string,
  sinceMs: number,
  extraWhere = ''
): Promise<{ d: string; n: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT date(${col}/1000,'unixepoch','+2 hours') AS d, COUNT(*) AS n
       FROM ${table} WHERE ${col}>=?${extraWhere} GROUP BY d ORDER BY d`
    )
    .bind(sinceMs)
    .all<{ d: string; n: number }>();
  return results;
}

// last cron run + next run + summary.
export async function cronInfo(db: D1Database): Promise<{
  schedules: string[];
  summary: string;
  nextRunMs: number | null;
  lastCronRunMs: number | null;
}> {
  const last = await db
    .prepare("SELECT MAX(created_at) AS m FROM seed_runs WHERE run_type='cron'")
    .first<{ m: number | null }>();
  return {
    schedules: CRON_SCHEDULES,
    summary: cronSummary(),
    nextRunMs: nextCronRunMs(),
    lastCronRunMs: last?.m ?? null,
  };
}

export interface EventFilter {
  cityId: string | null;
  source: string | null;
  status: string | null;
  day: string | null;
  fromMs: number | null;
  toMs: number | null;
  limit: number;
}

// Build SQL + binds for events, with optional city bbox + day window.
export function eventsSql(f: EventFilter): { sql: string; binds: unknown[] } {
  let sql = `SELECT p.id, p.external_id, p.description, p.created_at, p.status, p.link_url, p.thumb_key,
             p.lat, p.lng,
             substr(p.external_id,1,instr(p.external_id,'-')-1) AS source
             FROM posts p WHERE p.category='events'`;
  const binds: unknown[] = [];
  const bbox = f.cityId ? cityBbox(f.cityId) : null;
  if (bbox) { sql += ' AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?'; binds.push(bbox.swLat, bbox.neLat, bbox.swLng, bbox.neLng); }
  if (f.source) { sql += " AND substr(p.external_id,1,instr(p.external_id,'-')-1)=?"; binds.push(f.source); }
  if (f.status) { sql += ' AND p.status=?'; binds.push(f.status); }
  if (f.day) { sql += ' AND date(p.created_at/1000,\'unixepoch\',\'+2 hours\')=?'; binds.push(f.day); }
  if (f.fromMs) { sql += ' AND p.created_at>=?'; binds.push(f.fromMs); }
  if (f.toMs) { sql += ' AND p.created_at<=?'; binds.push(f.toMs); }
  sql += ' ORDER BY p.created_at DESC LIMIT ?';
  binds.push(f.limit);
  return { sql, binds };
}

// Simple haversine distance (km).
export { distKm, nearestCity } from './cities';

export { browserBudget };
