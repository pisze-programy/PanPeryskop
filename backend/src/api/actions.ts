import { Hono } from 'hono';
import { authenticate } from './auth';
import { TTL_MS, STATUS_APPROVED } from '../core/models';

export const actionsRoutes = new Hono<{ Bindings: Env }>();

actionsRoutes.post('/:id/like', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.env.DB;
  const postId = c.req.param('id');

  const post = await db
    .prepare('SELECT status FROM posts WHERE id = ? AND created_at >= ?')
    .bind(postId, Date.now() - TTL_MS)
    .first<{ status: string }>();
  if (!post || post.status !== STATUS_APPROVED) return c.json({ error: 'Not found' }, 404);

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

actionsRoutes.post('/:id/dislike', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.env.DB;
  const postId = c.req.param('id');

  const post = await db
    .prepare('SELECT status FROM posts WHERE id = ? AND created_at >= ?')
    .bind(postId, Date.now() - TTL_MS)
    .first<{ status: string }>();
  if (!post || post.status !== STATUS_APPROVED) return c.json({ error: 'Not found' }, 404);

  const existing = await db.prepare('SELECT 1 FROM dislikes WHERE user_id = ? AND post_id = ?')
    .bind(user.id, postId).first();

  if (existing) {
    await db.prepare('DELETE FROM dislikes WHERE user_id = ? AND post_id = ?').bind(user.id, postId).run();
    await db.prepare('UPDATE posts SET dislikes_count = MAX(0, dislikes_count - 1) WHERE id = ?').bind(postId).run();
    return c.json({ disliked: false });
  }

  await db.prepare('INSERT INTO dislikes (user_id, post_id, created_at) VALUES (?, ?, ?)')
    .bind(user.id, postId, Date.now()).run();
  await db.prepare('UPDATE posts SET dislikes_count = dislikes_count + 1 WHERE id = ?').bind(postId).run();
  return c.json({ disliked: true });
});

actionsRoutes.post('/:id/share', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.env.DB;
  const postId = c.req.param('id');

  const post = await db
    .prepare('SELECT status FROM posts WHERE id = ? AND created_at >= ?')
    .bind(postId, Date.now() - TTL_MS)
    .first<{ status: string }>();
  if (!post || post.status !== STATUS_APPROVED) return c.json({ error: 'Not found' }, 404);

  await db.prepare('UPDATE posts SET shares_count = shares_count + 1 WHERE id = ?').bind(postId).run();
  // Full share-event log (per-day chart) — best-effort.
  await db.prepare('INSERT INTO shares (post_id, user_id, created_at) VALUES (?, ?, ?)')
    .bind(postId, user.id, Date.now()).run().catch(() => {});

  return c.json({ ok: true });
});

actionsRoutes.post('/:id/watched', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.env.DB;
  const postId = c.req.param('id');

  const post = await db
    .prepare('SELECT status FROM posts WHERE id = ? AND created_at >= ?')
    .bind(postId, Date.now() - TTL_MS)
    .first<{ status: string }>();
  if (!post || post.status !== STATUS_APPROVED) return c.json({ error: 'Not found' }, 404);

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
