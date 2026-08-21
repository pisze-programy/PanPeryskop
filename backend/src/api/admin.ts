import { Hono } from 'hono';
import { STATUS_APPROVED, STATUS_REJECTED } from '../core/models';
import { todayWarsaw, addDaysWarsaw } from '../seed/core/dates';
import { SEED_DAYS_AHEAD } from '../seed/core/constants';

export const adminRoutes = new Hono<{ Bindings: Env }>();

export function adminAuth(c: { env: Env; req: { header: (n: string) => string | undefined } }): boolean {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  return Boolean(c.env.ADMIN_SECRET) && token === c.env.ADMIN_SECRET;
}
// Current status of a post by external_id — lets seed-ingest skip entries whose
// post was manually rejected (never re-approve them).
adminRoutes.get('/posts/by-external/:ext', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const row = await c.env.DB
    .prepare('SELECT status FROM posts WHERE external_id = ?')
    .bind(c.req.param('ext'))
    .first<{ status: string }>();
  return c.json({ status: row?.status ?? null });
});

// All rejected external_ids — seed-ingest fetches this ONCE (not per entry) so a
// 2000+ entry manifest upload does not hammer the API with per-row lookups.
adminRoutes.get('/seed/rejected', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const { results } = await c.env.DB
    .prepare('SELECT external_id FROM posts WHERE status = ? AND external_id IS NOT NULL')
    .bind(STATUS_REJECTED)
    .all<{ external_id: string }>();
  return c.json({ ids: (results || []).map((r) => r.external_id) });
});

// All approved event external_ids — seed-ingest resumes a crashed/partial upload
// by skipping posts that already exist instead of reprocessing every entry.
adminRoutes.get('/seed/existing', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const { results } = await c.env.DB
    .prepare(`SELECT external_id FROM posts WHERE status = '${STATUS_APPROVED}' AND external_id IS NOT NULL`)
    .all<{ external_id: string }>();
  return c.json({ ids: (results || []).map((r) => r.external_id) });
});

// Per-source per-day approved-event counts over the seed window — the VPS
// orchestrator uses it to detect window gaps (a provider that missed a day) and
// self-heal with a backfill.
adminRoutes.get('/seed/coverage', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const today = todayWarsaw();
  const window = Array.from({ length: SEED_DAYS_AHEAD + 1 }, (_, i) => addDaysWarsaw(today, i));
  const { results } = await c.env.DB.prepare(
    `SELECT substr(external_id, 1, instr(external_id, '-') - 1) AS source, event_date, COUNT(*) AS n
     FROM posts
     WHERE status = '${STATUS_APPROVED}' AND category = 'events' AND external_id IS NOT NULL
       AND event_date BETWEEN ?1 AND ?2
     GROUP BY source, event_date`
  ).bind(window[0], window[window.length - 1]).all<{ source: string; event_date: string; n: number }>();
  const counts: Record<string, Record<string, number>> = {};
  for (const r of results || []) {
    (counts[r.source] ??= {})[r.event_date] = r.n;
  }
  return c.json({ window, counts });
});

// One-off data cleanup: delete all event posts earlier than today (Europe/Warsaw),
// their R2 media and dependent rows (reports/likes/dislikes/views/shares).
// Without ?source it removes events earlier than today; with ?source=a,b it
// removes ALL events from those sources (source = external_id prefix) regardless
// of date — used to retire a provider.
adminRoutes.post('/events/cleanup', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const db = c.env.DB;
  const source = String(c.req.query('source') ?? '').trim();
  const sources = source ? source.split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9_-]+$/.test(s)) : [];
  let scope: string;
  let binds: unknown[];
  if (sources.length) {
    const ph = sources.map(() => `substr(external_id,1,instr(external_id,'-')-1) = ?`).join(' OR ');
    scope = `category='events' AND (${ph})`;
    binds = sources;
  } else {
    const today = todayWarsaw();
    const todayStart = Date.parse(`${today}T00:00:00+02:00`);
    scope = `category='events' AND (event_date < ?1 OR (event_date IS NULL AND created_at < ?2))`;
    binds = [today, todayStart];
  }

  const { results } = await db.prepare(
    `SELECT id, media_key, thumb_key FROM posts WHERE ${scope}`
  ).bind(...binds).all<{ id: string; media_key: string | null; thumb_key: string | null }>();
  const rows = results || [];
  if (!rows.length) return c.json({ deleted: 0, mediaDeleted: 0 });

  // Remove R2 objects (media + thumb) for the deleted posts — parallel batches.
  const keys = rows.flatMap((r) => [r.media_key, r.thumb_key]).filter((k): k is string => !!k);
  let mediaDeleted = 0;
  const CONCURRENCY = 25;
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const chunk = keys.slice(i, i + CONCURRENCY);
    const res = await Promise.allSettled(chunk.map((k) => c.env.MEDIA.delete(k)));
    mediaDeleted += res.filter((r) => r.status === 'fulfilled').length;
  }

  // Dependent rows first, then the posts themselves (no FK constraints in D1).
  for (const table of ['reports', 'likes', 'dislikes', 'views', 'shares']) {
    await db.prepare(`DELETE FROM ${table} WHERE post_id IN (SELECT id FROM posts WHERE ${scope})`).bind(...binds).run();
  }
  const del = await db.prepare(`DELETE FROM posts WHERE ${scope}`).bind(...binds).run();

  return c.json({ deleted: rows.length, mediaDeleted, rowsDeleted: del.meta.changes });
});

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
