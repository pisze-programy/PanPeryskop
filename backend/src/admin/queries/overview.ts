// Overview page: full data assembly + chart payloads (SSR + refresh API).
import { batchStatusCounts, seedDaySeries, failedAdminLogins } from './seed';
import { eventStatusBreakdown } from './events';
import { daySeries, statsRange, cronInfo, browserBudget } from './shared';
import { addDaysWarsaw, todayWarsaw } from '../../seed/core/dates';
import { CronInfo } from '../cron';

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
