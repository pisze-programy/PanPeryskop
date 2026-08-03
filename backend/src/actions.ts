import { Hono } from 'hono';
import { authenticate } from './auth';

export const actionsRoutes = new Hono<{ Bindings: Env }>();

actionsRoutes.post('/:id/like', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.env.DB;
  const postId = c.req.param('id');

  const post = await db.prepare('SELECT id FROM posts WHERE id = ? AND status = ? AND expires_at > ?')
    .bind(postId, 'approved', Date.now()).first();
  if (!post) return c.json({ error: 'Not found' }, 404);

  const existing = await db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?')
    .bind(user.id, postId).first();

  if (existing) {
    await db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').bind(user.id, postId).run();
    await db.prepare('UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').bind(postId).run();
    return c.json({ liked: false });
  }

  await db.prepare('INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)')
    .bind(user.id, postId, Date.now()).run();
  await db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').bind(postId).run();
  return c.json({ liked: true });
});

actionsRoutes.post('/:id/share', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.env.DB;
  const postId = c.req.param('id');

  await db.prepare('UPDATE posts SET shares_count = shares_count + 1 WHERE id = ? AND status = ? AND expires_at > ?')
    .bind(postId, 'approved', Date.now()).run();

  return c.json({ ok: true });
});

actionsRoutes.post('/:id/watched', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.env.DB;
  const postId = c.req.param('id');

  const already = await db.prepare('SELECT 1 FROM views WHERE user_id = ? AND post_id = ?')
    .bind(user.id, postId).first();

  if (!already) {
    await db.prepare('INSERT INTO views (user_id, post_id, created_at) VALUES (?, ?, ?)')
      .bind(user.id, postId, Date.now()).run();
    await db.prepare('UPDATE posts SET views_count = views_count + 1 WHERE id = ?')
      .bind(postId).run();
  }

  return c.json({ ok: true });
});
