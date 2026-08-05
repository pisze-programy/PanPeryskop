import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { User, defaultUsername } from './models';

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post('/device', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{ device_id?: string }>();
  const device_id = body?.device_id;

  if (!device_id || typeof device_id !== 'string' || device_id.length < 8) {
    return c.json({ error: 'Invalid device_id' }, 400);
  }

  const session_token = nanoid(48);
  const now = Date.now();

  const existing = await db
    .prepare('SELECT * FROM users WHERE device_id = ?')
    .bind(device_id)
    .first<User>();

  if (existing) {
    await db
      .prepare('UPDATE users SET session_token = ? WHERE device_id = ?')
      .bind(session_token, device_id)
      .run();
    return c.json({
      session_token,
      user_id: existing.id,
      role: existing.role,
      username: existing.username,
      avatar_url: existing.avatar_key
        ? `https://panperyskop-api.dev-4cb.workers.dev/media/${existing.avatar_key}`
        : null,
      is_new: false,
    });
  }

  const id = nanoid(16);
  const username = defaultUsername();
  await db
    .prepare(
      'INSERT INTO users (id, device_id, session_token, role, username, auth_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, device_id, session_token, 'user', username, 'device', now)
    .run();

  return c.json({ session_token, user_id: id, role: 'user', username, avatar_url: null, is_new: true }, 201);
});

export async function authenticate(
  c: { env: Env; req: { header: (n: string) => string | undefined } }
): Promise<User | null> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const db = c.env.DB;
  const user = await db
    .prepare('SELECT * FROM users WHERE session_token = ?')
    .bind(token)
    .first<User>();
  return user || null;
}
