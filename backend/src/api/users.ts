import { Hono } from 'hono';
import { authenticate } from './auth';
import { fileField, ParsedForm } from '../core/form';
import { PostRow, TTL_MS, normalizeUsername, User } from '../core/models';
import { mediaUrl, originFromRequest } from '../core/media';

export const usersRoutes = new Hono<{ Bindings: Env }>();

usersRoutes.get('/me', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  return c.json({
    user_id: user.id,
    device_id: user.device_id,
    role: user.role,
    username: user.username,
    avatar_url: mediaUrl(originFromRequest(c), user.avatar_key),
    auth_provider: user.auth_provider,
    has_apple: Boolean(user.apple_id),
    has_google: Boolean(user.google_id),
  });
});

usersRoutes.patch('/me', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json<{ username?: unknown }>();
  if (typeof body.username !== 'string') {
    return c.json({ error: 'username is required' }, 400);
  }

  const username = normalizeUsername(body.username);
  if (!username) {
    return c.json({ error: 'username must be 3-30 characters' }, 400);
  }

  await c.env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, user.id).run();

  return c.json({ username });
});

usersRoutes.get('/me/posts', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const now = Date.now();
  const { results } = await c.env.DB
    .prepare(
      `SELECT id, type, description, status, created_at, likes_count, views_count, shares_count,
              media_key, thumb_key, rejection_reason
       FROM posts
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 200`
    )
    .bind(user.id)
    .all<PostRow>();

  return c.json(
    results.map((p) => {
      const origin = originFromRequest(c);
      return {
        id: p.id,
        type: p.type,
        description: p.description,
        status: p.status,
        created_at: p.created_at,
        likes_count: p.likes_count,
        views_count: p.views_count,
        shares_count: p.shares_count,
        media_url: mediaUrl(origin, p.media_key),
        thumb_url: mediaUrl(origin, p.thumb_key) ?? mediaUrl(origin, p.media_key),
        rejection_reason: p.rejection_reason,
        is_expired: p.created_at < now - TTL_MS,
        is_future: p.created_at > now,
      };
    })
  );
});

// Hard account deletion (Apple 5.1.1(v)): removes the account and ALL of its data —
// posts (with R2 media), engagement rows, media requests, avatar, and telemetry.
usersRoutes.post('/me/delete', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  await deleteUserAccount(c.env, user);
  return c.json({ ok: true });
});

// Shared by POST /users/me/delete and the Sign in with Apple `accountDelete`
// server-to-server notification (which only knows the apple_id sub).
export async function deleteUserAccount(
  env: { DB: D1Database; MEDIA: R2Bucket },
  user: User
): Promise<void> {
  const db = env.DB;
  const userId = user.id;
  const deviceId = user.device_id;

  const { results: posts } = await db
    .prepare('SELECT id, media_key, thumb_key, grid_cell_id FROM posts WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string; media_key: string | null; thumb_key: string | null; grid_cell_id: string | null }>();

  // Engagement + auxiliary rows (child tables first).
  await db.prepare('DELETE FROM likes WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM dislikes WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM views WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM shares WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM media_requests WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM auth_events WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM client_errors WHERE device_id = ?').bind(deviceId).run();

  // Engagement rows from OTHER users pointing at this user's posts (FK on post_id
  // blocks the posts DELETE below — D1 enforces foreign keys).
  await db.prepare('DELETE FROM likes WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)').bind(userId).run();
  await db.prepare('DELETE FROM dislikes WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)').bind(userId).run();
  await db.prepare('DELETE FROM views WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)').bind(userId).run();
  await db.prepare('DELETE FROM shares WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)').bind(userId).run();

  // Grid heat down, then posts.
  for (const post of posts) {
    if (post.grid_cell_id) {
      await db.prepare('UPDATE grid_cells SET heat = MAX(0, heat - 1) WHERE id = ?').bind(post.grid_cell_id).run();
    }
  }
  await db.prepare('DELETE FROM posts WHERE user_id = ?').bind(userId).run();

  // R2 media (best-effort).
  const deletions: Promise<unknown>[] = [];
  for (const post of posts) {
    if (post.media_key) deletions.push(env.MEDIA.delete(post.media_key));
    if (post.thumb_key) deletions.push(env.MEDIA.delete(post.thumb_key));
  }
  if (user.avatar_key) deletions.push(env.MEDIA.delete(user.avatar_key));
  await Promise.all(deletions).catch(() => {});

  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}

usersRoutes.post('/avatar', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const contentType = c.req.header('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'Expected multipart/form-data' }, 400);
  }

  const form = await c.req.parseBody() as ParsedForm;
  const file = fileField(form, 'file');
  if (!file) return c.json({ error: 'Missing file' }, 400);

  const data = new Uint8Array(await file.arrayBuffer());
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
    return c.json({ error: 'Only JPEG avatars are supported' }, 400);
  }

  const key = `users/${user.id}/avatar.jpg`;
  await c.env.MEDIA.put(key, data, { httpMetadata: { contentType: 'image/jpeg' } });
  await c.env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(key, user.id).run();

  return c.json({
    avatar_url: mediaUrl(originFromRequest(c), key),
  });
});
