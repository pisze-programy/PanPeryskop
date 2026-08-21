// JSON API: media requests — shared query builder, filter params + total.
import { Hono } from 'hono';
import { mediaRequestsSql, mediaRequestsCountSql, MediaRequestFilter } from '../../queries';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();
const DAYS = [7, 14, 30, 90];

apiRoutes.get('/media-requests', (c) => api(c, async (env) => {
  const q = c.req.query();
  const daysRaw = parseInt(String(q.days || '14'), 10);
  const days = DAYS.includes(daysRaw) ? daysRaw : 14;
  const filter: MediaRequestFilter = {
    days,
    cityId: q.city ? String(q.city) : null,
    userId: q.user ? String(q.user) : null,
    fromMs: q.from ? Date.parse(`${q.from}T00:00:00+02:00`) : null,
    toMs: q.to ? Date.parse(`${q.to}T23:59:59.999+02:00`) : null,
    activeOnly: q.active === '1',
    limit: Math.min(5000, parseInt(String(q.limit || '200'), 10) || 200),
    offset: Math.max(0, parseInt(String(q.offset || '0'), 10) || 0),
  };
  const { sql, binds } = mediaRequestsSql(filter);
  const { results } = await env.DB.prepare(sql).bind(...binds).all<any>();
  const cnt = mediaRequestsCountSql(filter);
  const cntRow = await env.DB.prepare(cnt.sql).bind(...cnt.binds).first<{ n: number }>();
  return { requests: results, total: cntRow?.n ?? 0 };
}));

export function registerApiMediaRequests(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
