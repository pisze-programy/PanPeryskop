// JSON API: events.

import { Hono } from 'hono';
import { CITIES } from '../../cities';
import { eventsSql, nearestCity } from '../../queries';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/events', (c) => api(c, async (env) => {
  const q = c.req.query();
  const { sql, binds } = eventsSql({
    cityId: q.city ? String(q.city) : null,
    source: q.source ? String(q.source) : null,
    status: q.status ? String(q.status) : null,
    from: q.from ? String(q.from) : null,
    to: q.to ? String(q.to) : null,
    tag: q.tag ? String(q.tag) : null,
    geo: q.geo ? String(q.geo) : null,
    fromMs: null, toMs: null, limit: 300,
  });
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const out = (results as any[]).map((r) => ({
    ...r, city: nearestCity(r.lat, r.lng), thumb_url: r.thumb_key ? `/media/${r.thumb_key}` : null,
  }));
  return { events: out, cities: CITIES };
}));

export function registerApiEvents(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
