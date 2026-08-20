// JSON API: users.

import { Hono } from 'hono';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/users', (c) => api(c, async (env) => {
  const { results } = await env.DB
    .prepare(`SELECT u.id, u.device_id, u.username, u.auth_provider, u.created_at,
              (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id) AS post_count,
              (SELECT COUNT(*) FROM views v WHERE v.user_id=u.id) AS view_count,
              EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id=u.device_id) AS banned
              FROM users u ORDER BY u.created_at DESC LIMIT 200`).all();
  return { users: results };
}));

export function registerApiUsers(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
