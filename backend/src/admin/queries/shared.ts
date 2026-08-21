// Shared query helpers: Warsaw-day bucketing, series, totals, cron info.
import { browserBudget } from '../../seed/core/log';
import { todayWarsaw, addDaysWarsaw, warsawOffset } from '../../seed/core/dates';
import { cronSchedules, nextCronRunMs, cronSummary, CronInfo } from '../cron';

// SQLite unixepoch day-bucket offset for Europe/Warsaw (+2 summer / +1 winter) —
// derived from the TZ at call time so the bucketing is DST-correct.
function warsawBucketHours(): string {
  return `+${parseInt(warsawOffset())} hours`;
}

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
      `SELECT date(${col}/1000,'unixepoch','${warsawBucketHours()}') AS d, COUNT(*) AS n
       FROM ${table} WHERE ${col}>=?${extraWhere} GROUP BY d ORDER BY d`
    )
    .bind(sinceMs)
    .all<{ d: string; n: number }>();
  return results;
}

// Zero-filled per-day series for `days` Warsaw calendar days ending at `endDay`
// (default: today). `table`/`col`/`extra` are fixed literals from STAT_METRICS.
export async function statsRange(
  db: D1Database,
  table: string,
  col: string,
  days: number,
  extraWhere = '',
  endDay: string = todayWarsaw()
): Promise<{ d: string; n: number }[]> {
  const since = Date.now() - days * 86_400_000;
  const raw = await daySeries(db, table, col, since, extraWhere);
  const byDay = new Map(raw.map((r) => [r.d, r.n]));
  const list: string[] = [];
  for (let i = 1; i < days; i++) list.unshift(addDaysWarsaw(endDay, -i));
  list.push(endDay);
  return list.map((d) => ({ d, n: byDay.get(d) ?? 0 }));
}

// All-time totals across the main tables (stats page + overview strip).
export async function dashboardTotals(db: D1Database): Promise<Record<string, number>> {
  const [users, posts, views, likes, shares, mediaReq, errs, seedRuns] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM views').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM likes').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM shares').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM media_requests').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM client_errors').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM seed_runs').first<{ n: number }>(),
  ]);
  return {
    users: users?.n ?? 0, posts: posts?.n ?? 0, views: views?.n ?? 0, likes: likes?.n ?? 0,
    shares: shares?.n ?? 0, mediaRequests: mediaReq?.n ?? 0, clientErrors: errs?.n ?? 0, seedRuns: seedRuns?.n ?? 0,
  };
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

export { browserBudget };
