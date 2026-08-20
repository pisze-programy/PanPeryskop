// JSON API: posts.

import { Hono } from 'hono';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/posts', (c) => api(c, async (env) => {
  const q = c.req.query();
  const status = q.status ? String(q.status) : null;
  let sql = `SELECT p.id, p.description, p.created_at, p.status, p.type, p.thumb_key, p.likes_count, p.views_count,
             COALESCE(NULLIF(u.username,''), u.device_id) AS author
             FROM posts p JOIN users u ON p.user_id=u.id WHERE p.category='live'`;
  const binds: unknown[] = [];
  if (status) { sql += ' AND p.status=?'; binds.push(status); }
  sql += ' ORDER BY p.created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return { posts: results };
}));

export function registerApiPosts(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
