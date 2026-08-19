// User-facing content reporting (Apple guideline 1.2). Reports land in an admin
// queue for manual moderation — reporting never auto-blocks content or users.
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { authenticate } from './auth';
import { STATUS_APPROVED } from '../core/models';

export const reportsRoutes = new Hono<{ Bindings: Env }>();

const REPORT_REASONS = new Set(['spam', 'przemoc', 'nienawistna_tresc', 'nieodpowiednie', 'inne']);

reportsRoutes.post('/posts/:id/report', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const postId = c.req.param('id');
  const body = (await c.req.json<{ reason?: unknown }>().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!REPORT_REASONS.has(reason)) return c.json({ error: 'Invalid reason' }, 400);

  const db = c.env.DB;
  const post = await db
    .prepare('SELECT id FROM posts WHERE id = ? AND status = ?')
    .bind(postId, STATUS_APPROVED)
    .first<{ id: string }>();
  if (!post) return c.json({ error: 'Not found' }, 404);

  // Dedupe: one open report per post per reporter.
  const existing = await db
    .prepare("SELECT 1 FROM reports WHERE post_id = ? AND reporter_user_id = ? AND status = 'open'")
    .bind(postId, user.id)
    .first();
  if (existing) return c.json({ ok: true, already_reported: true });

  await db
    .prepare('INSERT INTO reports (id, post_id, reporter_user_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(nanoid(24), postId, user.id, reason, 'open', Date.now())
    .run();

  return c.json({ ok: true });
});
