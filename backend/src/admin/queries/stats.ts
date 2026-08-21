// Stats metric map + payload (SSR + JSON API single source of truth).
import { dashboardTotals, statsRange } from './shared';
import { addDaysWarsaw, todayWarsaw } from '../../seed/core/dates';

interface MetricDef { label: string; table: string; col: string; extra?: string }

// Fixed metric map — table/col/extra are literals, never user input.
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
