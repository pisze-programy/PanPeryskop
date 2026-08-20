// JSON API: client errors.

import { Hono } from 'hono';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/errors', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '7'), 10) || 7;
  const since = Date.now() - days * 86400000;
  const { results } = await env.DB.prepare('SELECT * FROM client_errors WHERE created_at>=? ORDER BY created_at DESC LIMIT 200').bind(since).all();
  return { errors: results };
}));

export function registerApiErrors(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
