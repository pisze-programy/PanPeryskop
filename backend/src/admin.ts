import { Hono } from 'hono';
import { ADMIN_SECRET, STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED, PostRow } from './models';

export const adminRoutes = new Hono<{ Bindings: Env }>();

function adminAuth(c: { req: { header: (n: string) => string | undefined } }): boolean {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  return token === ADMIN_SECRET;
}

adminRoutes.get('/queue', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);

  const db = c.env.DB;
  const { results } = await db
    .prepare(
      `SELECT p.*, u.device_id as author_name
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.status = '${STATUS_PENDING}'
       ORDER BY p.created_at DESC
       LIMIT 100`
    )
    .all<PostRow & { author_name: string }>();

  return c.json(
    results.map((p) => ({
      ...p,
      media_url: p.media_key ? `https://panperyskop-api.dev-4cb.workers.dev/media/${p.media_key}` : null,
    }))
  );
});

adminRoutes.post('/posts/:id/approve', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);

  const db = c.env.DB;
  const postId = c.req.param('id');

  await db.prepare('UPDATE posts SET status = ? WHERE id = ?').bind(STATUS_APPROVED, postId).run();
  return c.json({ ok: true });
});

adminRoutes.post('/posts/:id/reject', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);

  const db = c.env.DB;
  const postId = c.req.param('id');

  await db.prepare('UPDATE posts SET status = ? WHERE id = ?').bind(STATUS_REJECTED, postId).run();
  return c.json({ ok: true });
});
