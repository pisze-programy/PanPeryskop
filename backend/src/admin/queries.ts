// Shared D1 query helpers for the dashboard (per-day series, budget, cron state).
import { browserBudget } from '../seed/core/log';
import { CITIES, cityBbox } from './cities';
import { cronSchedules, nextCronRunMs, cronSummary, CronInfo } from './cron';
import { todayWarsaw, addDaysWarsaw, warsawOffset } from '../seed/core/dates';

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

// Fixed metric map — table/col/extra are literals, never user input. Single source
// of truth for the stats page (SSR + JSON API).
interface MetricDef { label: string; table: string; col: string; extra?: string }
export const STAT_METRICS: Record<string, MetricDef> = {
  views: { label: 'Views', table: 'views', col: 'created_at' },
  media: { label: 'Media', table: 'posts', col: 'created_at' },
  logins: { label: 'Logowania', table: 'auth_events', col: 'created_at', extra: " AND event='login'" },
  signups: { label: 'Rejestracje', table: 'auth_events', col: 'created_at', extra: " AND event='register'" },
  likes: { label: 'Like', table: 'likes', col: 'created_at' },
  shares: { label: 'Share', table: 'shares', col: 'created_at' },
  errors: { label: 'Błędy', table: 'client_errors', col: 'created_at' },
  media_requests: { label: 'Media Req.', table: 'media_requests', col: 'created_at' },
};
export type StatsMetric = keyof typeof STAT_METRICS;

export interface StatsPayload {
  metric: StatsMetric;
  days: number;
  rangeStart: string;
  rangeEnd: string;
  series: { d: string; n: number }[];
  sum: number;
  bestDay: { d: string; n: number } | null;
  avgPerDay: number;
  deltaPct: number | null;
  totals: Record<string, number>;
}

export async function statsPayload(db: D1Database, metric: StatsMetric, days: number): Promise<StatsPayload> {
  const m = STAT_METRICS[metric];
  const series = await statsRange(db, m.table, m.col, days, m.extra ?? '');
  const prev = await statsRange(db, m.table, m.col, days, m.extra ?? '', addDaysWarsaw(todayWarsaw(), -days));
  const sum = series.reduce((s, x) => s + x.n, 0);
  const prevSum = prev.reduce((s, x) => s + x.n, 0);
  let bestDay: StatsPayload['bestDay'] = null;
  let max = -1;
  for (const x of series) if (x.n > max) { max = x.n; bestDay = x; }
  const totals = await dashboardTotals(db);
  return {
    metric, days,
    rangeStart: series[0]?.d ?? '', rangeEnd: series[series.length - 1]?.d ?? '',
    series,
    sum,
    bestDay,
    avgPerDay: days ? Math.round((sum / days) * 10) / 10 : 0,
    deltaPct: prevSum > 0 ? Math.round(((sum - prevSum) / prevSum) * 1000) / 10 : null,
    totals,
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
  q?: string | null;
  sources?: string[] | null;
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
  if (f.sources && f.sources.length) {
    const ph = f.sources.map(() => '?').join(',');
    where += ` AND substr(p.external_id,1,instr(p.external_id,'-')-1) IN (${ph})`;
    binds.push(...f.sources);
  }
  if (f.status) { where += ' AND p.status=?'; binds.push(f.status); }
  if (f.from) { where += ' AND p.event_date >= ?'; binds.push(f.from); }
  if (f.to) { where += ' AND p.event_date <= ?'; binds.push(f.to); }
  if (f.tag) { where += f.tag === 'none' ? ' AND (p.tags IS NULL OR p.tags = ?)' : ' AND p.tags LIKE ?'; binds.push(f.tag === 'none' ? '[]' : `%"${f.tag}"%`); }
  if (f.q) { where += ' AND (p.description LIKE ? OR p.external_id LIKE ?)'; binds.push(`%${f.q}%`, `%${f.q}%`); }
  if (f.geo === 'default') {
    const eps = GEO_DEFAULT_EPS;
    const ors = CITIES.map((c) => `(ABS(p.lat - ${c.lat}) < ${eps} AND ABS(p.lng - ${c.lng}) < ${eps})`).join(' OR ');
    where += ` AND (${ors})`;
  }
  if (f.geo === 'locked') { where += ' AND p.geo_locked = 1'; }
  if (f.geo === 'none') { where += ' AND (p.lat IS NULL OR p.lng IS NULL)'; }
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
          p.lat, p.lng, p.is_sold_out, p.geo_locked, p.tags_locked, p.rejection_reason,
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

// Event status counts (all-time, category='events') for the doughnut + KPIs.
export async function eventStatusBreakdown(db: D1Database): Promise<{ approved: number; pending: number; rejected: number }> {
  const { results } = await db.prepare(
    "SELECT status, COUNT(*) n FROM posts WHERE category='events' GROUP BY status"
  ).all<{ status: string; n: number }>();
  const r = { approved: 0, pending: 0, rejected: 0 };
  for (const x of results ?? []) if (x.status in r) (r as Record<string, number>)[x.status] = x.n;
  return r;
}

// Per-source event counts (source = external_id prefix).
export async function eventSourceBreakdown(db: D1Database): Promise<{ source: string; n: number }[]> {
  const { results } = await db.prepare(
    "SELECT substr(external_id,1,instr(external_id,'-')-1) AS source, COUNT(*) AS n FROM posts WHERE category='events' GROUP BY source ORDER BY n DESC"
  ).all<{ source: string; n: number }>();
  return results ?? [];
}

// Seed ingestion sparkline (last N days): ingested + errors per day.
export async function seedDaySeries(db: D1Database, sinceMs: number): Promise<{ day: string; ingested: number; errors: number }[]> {
  const { results } = await db.prepare(
    `SELECT day, COALESCE(SUM(ingested),0) AS ingested, COALESCE(SUM(errors),0) AS errors
     FROM seed_runs WHERE created_at>=? AND provider<>'total' GROUP BY day ORDER BY day`
  ).bind(sinceMs).all<{ day: string; ingested: number; errors: number }>();
  return results ?? [];
}

// Batch status distribution (last 30d) for the health strip + badges.
export async function batchStatusCounts(db: D1Database, sinceMs = Date.now() - 30 * 86_400_000): Promise<{ status: string; n: number }[]> {
  const { results } = await db.prepare(
    'SELECT status, COUNT(*) n FROM seed_batches WHERE created_at>=? GROUP BY status'
  ).bind(sinceMs).all<{ status: string; n: number }>();
  return results ?? [];
}

// Failed admin login attempts in the window (security signal).
export async function failedAdminLogins(db: D1Database, sinceMs: number): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) n FROM admin_login_attempts WHERE success=0 AND attempted_at>=?')
    .bind(sinceMs).first<{ n: number }>();
  return row?.n ?? 0;
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

// ---------- Live posts (category='live') ----------
export interface PostsFilter {
  status?: string | null;
  type?: string | null;
  q?: string | null;
  reported?: boolean;
  limit: number;
  offset?: number;
}

function postsWhere(f: PostsFilter): { where: string; binds: unknown[] } {
  let where = `p.category='live'`;
  const binds: unknown[] = [];
  if (f.status) { where += ' AND p.status=?'; binds.push(f.status); }
  if (f.type) { where += ' AND p.type=?'; binds.push(f.type); }
  if (f.q) {
    where += ' AND (p.description LIKE ? OR u.username LIKE ? OR u.device_id LIKE ? OR p.id LIKE ?)';
    binds.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  if (f.reported) {
    where += ' AND EXISTS (SELECT 1 FROM reports rp WHERE rp.post_id=p.id AND rp.status=?';
    binds.push('open');
    where += ')';
  }
  return { where, binds };
}

export function postsSql(f: PostsFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = postsWhere(f);
  const offset = f.offset ?? 0;
  return {
    sql: `SELECT p.id, p.type, p.description, p.status, p.created_at, p.rejection_reason,
          p.likes_count, p.views_count, p.shares_count, p.dislikes_count, p.media_key, p.thumb_key,
          u.id AS user_id, COALESCE(NULLIF(u.username,''), u.device_id) AS author,
          u.device_id, u.avatar_key,
          EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id=u.device_id) AS banned,
          (SELECT COUNT(*) FROM reports rp WHERE rp.post_id=p.id AND rp.status='open') AS open_reports
          FROM posts p JOIN users u ON u.id=p.user_id WHERE ${where}
          ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    binds: [...binds, f.limit, offset],
  };
}

export function postsCountSql(f: PostsFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = postsWhere(f);
  return { sql: `SELECT COUNT(*) n FROM posts p JOIN users u ON u.id=p.user_id WHERE ${where}`, binds };
}

export interface PostStatusCounts {
  total: number;
  active24h: number;
  approved: number;
  pending: number;
  rejected: number;
}

export async function postStatusCounts(db: D1Database): Promise<PostStatusCounts> {
  const [total, active24h, byStatus] = await Promise.all([
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='live'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='live' AND created_at>=?").bind(Date.now() - 86_400_000).first<{ n: number }>(),
    db.prepare("SELECT status, COUNT(*) n FROM posts WHERE category='live' GROUP BY status").all<{ status: string; n: number }>(),
  ]);
  const r: Record<string, number> = { total: total?.n ?? 0, active24h: active24h?.n ?? 0, approved: 0, pending: 0, rejected: 0 };
  for (const x of byStatus.results ?? []) if (x.status in r) r[x.status] = x.n;
  return r as unknown as PostStatusCounts;
}

// Simple haversine distance (km).
export { distKm, nearestCity } from './cities';

export { browserBudget };

// ---------- Media requests ----------
export interface MediaRequestFilter {
  days: number;
  cityId?: string | null;
  userId?: string | null;
  fromMs?: number | null;
  toMs?: number | null;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

function mediaRequestsWhere(f: MediaRequestFilter): { where: string; binds: unknown[] } {
  const since = Date.now() - f.days * 86_400_000;
  const where: string[] = ['r.created_at>=?'];
  const binds: unknown[] = [since];
  if (f.cityId) {
    const bbox = cityBbox(f.cityId);
    if (bbox) { where.push('r.lat BETWEEN ? AND ? AND r.lng BETWEEN ? AND ?'); binds.push(bbox.swLat, bbox.neLat, bbox.swLng, bbox.neLng); }
  }
  if (f.userId) { where.push('r.user_id=?'); binds.push(f.userId); }
  if (f.fromMs) { where.push('r.created_at>=?'); binds.push(f.fromMs); }
  if (f.toMs) { where.push('r.created_at<=?'); binds.push(f.toMs); }
  if (f.activeOnly) { where.push('r.created_at>=?'); binds.push(Date.now() - 4 * 3_600_000); }
  return { where: where.join(' AND '), binds };
}

export function mediaRequestsSql(f: MediaRequestFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = mediaRequestsWhere(f);
  const offset = f.offset ?? 0;
  return {
    sql: `SELECT r.id, r.lat, r.lng, r.created_at, r.user_id, COALESCE(NULLIF(u.username,''), u.device_id) AS user
          FROM media_requests r JOIN users u ON r.user_id=u.id
          WHERE ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    binds: [...binds, f.limit ?? 50, offset],
  };
}

export function mediaRequestsCountSql(f: MediaRequestFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = mediaRequestsWhere(f);
  return { sql: `SELECT COUNT(*) n FROM media_requests r WHERE ${where}`, binds };
}

// ---------- Overview (shared by the SSR page + the JSON refresh API) ----------
export interface OverviewWindowRow {
  day: string;
  approved: number;
  pending: number;
  rejected: number;
}
export interface OverviewData {
  users: number;
  active7d: number;
  views14: { d: string; n: number }[];
  media14: { d: string; n: number }[];
  logins14: { d: string; n: number }[];
  status: { approved: number; pending: number; rejected: number };
  window: OverviewWindowRow[];
  seedSeries: { day: string; ingested: number; errors: number }[];
  batchCounts: { status: string; n: number }[];
  failedLogins7d: number;
  errors7d: number;
  reportsOpen: number;
  banned: number;
  mediaRequests: number;
  lastSeed: {
    batch: Record<string, unknown> | null;
    runs: { cands: number; ingested: number; errors: number; dur: number; browser: number } | null;
  };
  budget: { monthMs: number; limitMs: number; exceeded: boolean } | null;
  cron: CronInfo;
}

export async function overviewData(env: Env, seedDaysAhead: number): Promise<OverviewData> {
  const db = env.DB;
  const now = Date.now();
  const today = todayWarsaw();
  const windowEnd = addDaysWarsaw(today, seedDaysAhead);
  const since14 = Date.now() - 14 * 86_400_000;
  const [users, active7d, status, views14, media14, logins14, seedSeries, batchCounts, failedLogins7d, errors7d, reportsOpen, banned, mediaReq, lastSeed, cron, budget, windowRows] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM users WHERE last_seen>=?').bind(now - 7 * 86_400_000).first<{ n: number }>(),
    eventStatusBreakdown(db),
    statsRange(db, 'views', 'created_at', 14),
    statsRange(db, 'posts', 'created_at', 14),
    statsRange(db, 'auth_events', 'created_at', 14, " AND event='login'"),
    seedDaySeries(db, now - 8 * 86_400_000),
    batchStatusCounts(db),
    failedAdminLogins(db, now - 7 * 86_400_000),
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(now - 7 * 86_400_000).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM reports WHERE status='open'").first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM banned_devices').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM media_requests').first<{ n: number }>(),
    db.prepare('SELECT * FROM seed_batches ORDER BY created_at DESC LIMIT 1').first<Record<string, unknown>>(),
    cronInfo(env, db),
    env.BROWSER ? browserBudget(env) : null,
    db.prepare(`SELECT event_date, status, COUNT(*) n FROM posts
                WHERE category='events' AND event_date BETWEEN ? AND ? GROUP BY event_date, status`)
      .bind(today, windowEnd).all<{ event_date: string; status: string; n: number }>(),
  ]);

  const perDay = new Map<string, OverviewWindowRow>();
  for (const r of windowRows?.results ?? []) {
    const d = perDay.get(r.event_date) ?? { day: r.event_date, approved: 0, pending: 0, rejected: 0 };
    if (r.status === 'approved') d.approved += r.n;
    else if (r.status === 'pending') d.pending += r.n;
    else if (r.status === 'rejected') d.rejected += r.n;
    perDay.set(r.event_date, d);
  }
  const windowList: OverviewWindowRow[] = [];
  for (let i = 0; i <= seedDaysAhead; i++) {
    const day = addDaysWarsaw(today, i);
    windowList.push(perDay.get(day) ?? { day, approved: 0, pending: 0, rejected: 0 });
  }

  let runs: OverviewData['lastSeed']['runs'] = null;
  if (lastSeed) {
    const agg = await db.prepare(
      `SELECT COALESCE(SUM(candidates),0) cands, COALESCE(SUM(ingested),0) ingested,
              COALESCE(SUM(errors),0) errors, COALESCE(SUM(duration_ms),0) dur, COALESCE(SUM(browser_ms),0) browser
       FROM seed_runs WHERE batch_id=?`
    ).bind((lastSeed as any).id).first<{ cands: number; ingested: number; errors: number; dur: number; browser: number }>();
    runs = agg;
  }

  return {
    users: users?.n ?? 0,
    active7d: active7d?.n ?? 0,
    views14, media14, logins14,
    status: { approved: status.approved, pending: status.pending, rejected: status.rejected },
    window: windowList,
    seedSeries, batchCounts,
    failedLogins7d: failedLogins7d ?? 0,
    errors7d: errors7d?.n ?? 0,
    reportsOpen: reportsOpen?.n ?? 0,
    banned: banned?.n ?? 0,
    mediaRequests: mediaReq?.n ?? 0,
    lastSeed: { batch: lastSeed ?? null, runs },
    budget,
    cron,
  };
}

// Chart payloads + KPI numbers for the overview page (SSR embed + refresh API).
export function overviewCharts(d: OverviewData) {
  const views14 = d.views14;
  const viewsSum = views14.reduce((s, x) => s + x.n, 0);
  const viewsPrev = views14.slice(0, 7).reduce((s, x) => s + x.n, 0);
  const viewsCur = views14.slice(7).reduce((s, x) => s + x.n, 0);
  const winTotal = d.window.reduce((s, w) => s + w.approved + w.pending + w.rejected, 0);
  const winApproved = d.window.reduce((s, w) => s + w.approved, 0);
  const winPending = d.window.reduce((s, w) => s + w.pending, 0);
  const winRejected = d.window.reduce((s, w) => s + w.rejected, 0);
  const seedDone = d.batchCounts.find((b) => b.status === 'done')?.n ?? 0;
  const seedFailed = d.batchCounts.find((b) => b.status === 'failed')?.n ?? 0;
  return {
    pp: {
      activity: {
        days: views14.map((x) => x.d),
        views: views14.map((x) => x.n),
        media: d.media14.map((x) => x.n),
        logins: d.logins14.map((x) => x.n),
      },
      status: { series: [d.status.approved, d.status.pending, d.status.rejected], labels: ['Approved', 'Pending', 'Rejected'] },
      window: {
        days: d.window.map((w) => w.day),
        approved: d.window.map((w) => w.approved),
        pending: d.window.map((w) => w.pending),
        rejected: d.window.map((w) => w.rejected),
      },
      seed: { days: d.seedSeries.map((s) => s.day), ingested: d.seedSeries.map((s) => s.ingested) },
      nextCronMs: d.cron.nextRunMs,
      lastCronMs: d.cron.lastCronRunMs,
    },
    kpis: {
      users: d.users, active7d: d.active7d,
      viewsTotal: viewsSum, viewsDelta: viewsPrev > 0 ? Math.round(((viewsCur - viewsPrev) / viewsPrev) * 100) : null,
      winTotal, winApproved, winPending, winRejected,
      seedDone, seedFailed,
    },
  };
}
