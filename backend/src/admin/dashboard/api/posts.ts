// JSON API: posts — reuses the shared query builders (single source of truth).
import { Hono } from 'hono';
import { postsSql, postsCountSql, PostsFilter } from '../../queries';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/posts', (c) => api(c, async (env) => {
  const q = c.req.query();
  const filter: PostsFilter = {
    status: q.status ? String(q.status) : null,
    type: q.type ? String(q.type) : null,
    q: q.q ? String(q.q) : null,
    reported: q.reported === '1',
    limit: Math.min(500, parseInt(String(q.limit || '50'), 10) || 50),
    offset: Math.max(0, parseInt(String(q.offset || '0'), 10) || 0),
  };
  const { sql, binds } = postsSql(filter);
  const { results } = await env.DB.prepare(sql).bind(...binds).all<any>();
  const cnt = postsCountSql(filter);
  const cntRow = await env.DB.prepare(cnt.sql).bind(...cnt.binds).first<{ n: number }>();
  return { posts: results, total: cntRow?.n ?? 0 };
}));

export function registerApiPosts(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
