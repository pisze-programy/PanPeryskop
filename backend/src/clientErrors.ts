import { Hono } from 'hono';
import { nanoid } from 'nanoid';

/**
 * Client error / dead-letter queue (panperyskop-dlq).
 *
 * The iOS app reports background-upload failures here (best-effort) so errors can
 * be monitored. device_id is sent by the client (no auth required — the report is
 * fire-and-forget even when the main upload failed).
 */
export const clientErrorRoutes = new Hono<{ Bindings: Env }>();

clientErrorRoutes.post('/errors', async (c) => {
  const db = c.env.DB;

  const body = await c.req
    .json<{ device_id?: unknown; error_type?: unknown; message?: unknown; meta?: unknown }>()
    .catch(() => ({}) as { device_id?: unknown; error_type?: unknown; message?: unknown; meta?: unknown });

  const deviceId =
    typeof body.device_id === 'string' && body.device_id.trim().length > 0
      ? body.device_id.trim().slice(0, 200)
      : null;
  const errorType =
    typeof body.error_type === 'string' && body.error_type.trim().length > 0
      ? body.error_type.trim().slice(0, 100)
      : 'unknown';
  const message =
    typeof body.message === 'string' && body.message.trim().length > 0
      ? body.message.trim().slice(0, 1000)
      : null;
  const meta = body.meta !== undefined ? JSON.stringify(body.meta).slice(0, 4000) : null;

  await db
    .prepare(
      'INSERT INTO client_errors (id, device_id, error_type, message, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(nanoid(24), deviceId, errorType, message, meta, Date.now())
    .run();

  return c.json({ ok: true });
});
