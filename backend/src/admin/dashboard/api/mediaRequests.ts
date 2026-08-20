// JSON API: media requests.

import { Hono } from 'hono';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/media-requests', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '14'), 10) || 14;
  const since = Date.now() - days * 86400000;
  const { results } = await env.DB
    .prepare(`SELECT r.id, r.lat, r.lng, r.created_at, COALESCE(NULLIF(u.username,''), u.device_id) AS user
              FROM media_requests r JOIN users u ON r.user_id=u.id WHERE r.created_at>=? ORDER BY r.created_at DESC LIMIT 200`)
    .bind(since).all();
  return { requests: results };
}));

export function registerApiMediaRequests(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
