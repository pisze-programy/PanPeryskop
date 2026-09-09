// JSON API: stats — extended payload for the stats page (no-reload switching).
import { Hono } from 'hono';
import { statsPayload, STAT_METRICS, StatsMetric } from '../../queries';
import { api } from '../common';
import { ADMIN_DAYS_OPTIONS } from '../../config';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/stats', (c) => api(c, async (env) => {
  const q = c.req.query();
  const metricRaw = String(q.metric || 'views');
  const metric: StatsMetric = metricRaw in STAT_METRICS ? (metricRaw as StatsMetric) : 'views';
  const daysRaw = parseInt(String(q.days || '14'), 10);
  const days = ADMIN_DAYS_OPTIONS.includes(daysRaw) ? daysRaw : 14;
  return statsPayload(env.DB, metric, days);
}));

export function registerApiStats(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
