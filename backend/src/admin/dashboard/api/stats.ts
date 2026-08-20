// JSON API: stats.

import { Hono } from 'hono';
import { daySeries } from '../../queries';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/stats', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '14'), 10) || 14;
  const since = Date.now() - days * 86400000;
  const metric = String(q.metric || 'views');
  const map: Record<string, [string, string, string?]> = {
    views: ['views', 'created_at'], media: ['posts', 'created_at'], likes: ['likes', 'created_at'],
    shares: ['shares', 'created_at'], logins: ['auth_events', 'created_at', " AND event='login'"],
    signups: ['auth_events', 'created_at', " AND event='register'"],
  };
  const [table, col, extra] = map[metric] || map.views;
  return { series: await daySeries(env.DB, table, col, since, extra) };
}));

export function registerApiStats(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
