import { Hono } from 'hono';
import { authenticate } from './auth';

export const usersRoutes = new Hono<{ Bindings: Env }>();

usersRoutes.get('/me', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  return c.json({
    user_id: user.id,
    device_id: user.device_id,
    role: user.role,
    avatar_url: user.avatar_key
      ? `https://panperyskop-api.dev-4cb.workers.dev/media/${user.avatar_key}`
      : null,
  });
});

usersRoutes.post('/avatar', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const contentType = c.req.header('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'Expected multipart/form-data' }, 400);
  }

  const form = await c.req.parseBody();
  const file = form.file as File | undefined;
  if (!file) return c.json({ error: 'Missing file' }, 400);

  const data = new Uint8Array(await file.arrayBuffer());
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
    return c.json({ error: 'Only JPEG avatars are supported' }, 400);
  }

  const key = `users/${user.id}/avatar.jpg`;
  await c.env.MEDIA.put(key, data, { httpMetadata: { contentType: 'image/jpeg' } });
  await c.env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(key, user.id).run();

  return c.json({
    avatar_url: `https://panperyskop-api.dev-4cb.workers.dev/media/${key}`,
  });
});
