import { Hono } from 'hono';
import { ADMIN_SECRET, STATUS_APPROVED, STATUS_REJECTED } from './models';

export const adminRoutes = new Hono<{ Bindings: Env }>();

function adminAuth(c: { req: { header: (n: string) => string | undefined } }): boolean {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  return token === ADMIN_SECRET;
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
