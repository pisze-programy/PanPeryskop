import { Hono } from 'hono';
import { STATUS_APPROVED, STATUS_REJECTED } from '../core/models';

export const adminRoutes = new Hono<{ Bindings: Env }>();

function adminAuth(c: { env: Env; req: { header: (n: string) => string | undefined } }): boolean {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  return Boolean(c.env.ADMIN_SECRET) && token === c.env.ADMIN_SECRET;
}

adminRoutes.post('/posts/:id/approve', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);

  const db = c.env.DB;
  const postId = c.req.param('id');

  await db.prepare('UPDATE posts SET status = ?, rejection_reason = NULL WHERE id = ?').bind(STATUS_APPROVED, postId).run();
  return c.json({ ok: true });
});

adminRoutes.post('/posts/:id/reject', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);

  const db = c.env.DB;
  const postId = c.req.param('id');

  const body = await c.req
    .json<{ reason?: unknown }>()
    .catch(() => ({}) as { reason?: unknown });
  const reason =
    typeof body.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : null;

  await db
    .prepare('UPDATE posts SET status = ?, rejection_reason = ? WHERE id = ?')
    .bind(STATUS_REJECTED, reason, postId)
    .run();
  return c.json({ ok: true, rejection_reason: reason });
});

adminRoutes.post('/ban', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);

  const db = c.env.DB;
  const body = await c.req
    .json<{ device_id?: unknown; reason?: unknown }>()
    .catch(() => ({}) as { device_id?: unknown; reason?: unknown });

  if (typeof body.device_id !== 'string' || body.device_id.length === 0) {
    return c.json({ error: 'device_id is required' }, 400);
  }

  const reason =
    typeof body.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : null;

  await db
    .prepare('INSERT INTO banned_devices (device_id, reason, banned_at) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET reason = excluded.reason')
    .bind(body.device_id, reason, Date.now())
    .run();
  return c.json({ ok: true, device_id: body.device_id, reason });
});

adminRoutes.post('/unban', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);

  const db = c.env.DB;
  const body = await c.req
    .json<{ device_id?: unknown }>()
    .catch(() => ({}) as { device_id?: unknown });

  if (typeof body.device_id !== 'string' || body.device_id.length === 0) {
    return c.json({ error: 'device_id is required' }, 400);
  }

  await db.prepare('DELETE FROM banned_devices WHERE device_id = ?').bind(body.device_id).run();
  return c.json({ ok: true, device_id: body.device_id });
});
