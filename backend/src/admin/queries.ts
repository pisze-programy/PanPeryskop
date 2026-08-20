// Shared D1 query helpers for the dashboard (per-day series, budget, cron state).
import { browserBudget } from '../seed/core/log';
import { CITIES, cityBbox } from './cities';
import { cronSchedules, nextCronRunMs, cronSummary, CronInfo } from './cron';

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
export async function cronInfo(env: Env, db: D1Database): Promise<CronInfo> {
  const last = await db
    .prepare("SELECT MAX(created_at) AS m FROM seed_runs WHERE run_type='cron'")
    .first<{ m: number | null }>();
  const schedules = cronSchedules(env);
  return {
    schedules,
    summary: cronSummary(),
    nextRunMs: nextCronRunMs(schedules[0] ?? ''),
    lastCronRunMs: last?.m ?? null,
  };
}

export interface EventFilter {
  cityId: string | null;
  source: string | null;
  status: string | null;
  from: string | null;
  to: string | null;
  tag: string | null;
  geo: string | null;
  fromMs: number | null;
  toMs: number | null;
  limit: number;
  offset?: number;
}

// "Default bbox" geo = the seed fallback pin at a city's bbox center (CITIES lat/lng).
const GEO_DEFAULT_EPS = 0.002;

function eventsWhere(f: EventFilter): { where: string; binds: unknown[] } {
  let where = `p.category='events'`;
  const binds: unknown[] = [];
  const bbox = f.cityId ? cityBbox(f.cityId) : null;
  if (bbox) { where += ' AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?'; binds.push(bbox.swLat, bbox.neLat, bbox.swLng, bbox.neLng); }
  if (f.source) { where += " AND substr(p.external_id,1,instr(p.external_id,'-')-1)=?"; binds.push(f.source); }
  if (f.status) { where += ' AND p.status=?'; binds.push(f.status); }
  if (f.from) { where += ' AND p.event_date >= ?'; binds.push(f.from); }
  if (f.to) { where += ' AND p.event_date <= ?'; binds.push(f.to); }
  if (f.tag) { where += f.tag === 'none' ? ' AND (p.tags IS NULL OR p.tags = ?)' : ' AND p.tags LIKE ?'; binds.push(f.tag === 'none' ? '[]' : `%"${f.tag}"%`); }
  if (f.geo === 'default') {
    const eps = GEO_DEFAULT_EPS;
    const ors = CITIES.map((c) => `(ABS(p.lat - ${c.lat}) < ${eps} AND ABS(p.lng - ${c.lng}) < ${eps})`).join(' OR ');
    where += ` AND (${ors})`;
  }
  if (f.fromMs) { where += ' AND p.created_at>=?'; binds.push(f.fromMs); }
  if (f.toMs) { where += ' AND p.created_at<=?'; binds.push(f.toMs); }
  return { where, binds };
}

// Build SQL + binds for events, with optional city bbox + date window.
export function eventsSql(f: EventFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = eventsWhere(f);
  const offset = f.offset ?? 0;
  return {
    sql: `SELECT p.id, p.external_id, p.description, p.created_at, p.status, p.link_url,
          p.thumb_key, p.media_key, p.tags, p.event_date, p.showtimes, p.showtime_booking,
          p.lat, p.lng,
          substr(p.external_id,1,instr(p.external_id,'-')-1) AS source
          FROM posts p WHERE ${where} ORDER BY p.event_date DESC, p.created_at DESC LIMIT ? OFFSET ?`,
    binds: [...binds, f.limit, offset],
  };
}

// Count query matching eventsSql filters — used for pagination.
export function eventsCountSql(f: EventFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = eventsWhere(f);
  return { sql: `SELECT COUNT(*) AS n FROM posts p WHERE ${where}`, binds };
}

// Simple haversine distance (km).
export { distKm, nearestCity } from './cities';

export { browserBudget };
