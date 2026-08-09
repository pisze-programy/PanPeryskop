import { Hono } from 'hono';
import { authenticate } from './auth';
import { nanoid } from 'nanoid';
import { MediaRequestRow, MEDIA_REQUEST_TTL_MS, MEDIA_REQUEST_COOLDOWN_MS } from './models';

export const mediaRequestsRoutes = new Hono<{ Bindings: Env }>();

type Query = Record<string, string | undefined>;

function parseBBox(q: Query): { swLat: number; swLng: number; neLat: number; neLng: number } | null {
  const num = (v: string | undefined) => (v === undefined ? NaN : parseFloat(v));
  const swLat = num(q.sw_lat), swLng = num(q.sw_lng), neLat = num(q.ne_lat), neLng = num(q.ne_lng);
  if (!isFinite(swLat) || !isFinite(swLng) || !isFinite(neLat) || !isFinite(neLng)) return null;
  if (neLat <= swLat || neLng <= swLng) return null;
  return { swLat, swLng, neLat, neLng };
}

function requestJson(r: MediaRequestRow) {
  return {
    id: r.id,
    user_id: r.user_id,
    lat: r.lat,
    lng: r.lng,
    created_at: r.created_at,
  };
}

// Active media-request pins inside the viewport bbox. Auth optional — like /stories.
mediaRequestsRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const bbox = parseBBox(c.req.query());
  if (!bbox) return c.json({ error: 'Invalid or missing bbox' }, 400);
  const { swLat, swLng, neLat, neLng } = bbox;
  const windowStart = Date.now() - MEDIA_REQUEST_TTL_MS;

  const { results } = await db
    .prepare(
      `SELECT id, user_id, lat, lng, created_at
       FROM media_requests
       WHERE lat BETWEEN ? AND ?
       AND lng BETWEEN ? AND ?
       AND created_at >= ?
       ORDER BY created_at DESC`
    )
    .bind(swLat, neLat, swLng, neLng, windowStart)
    .all<MediaRequestRow>();

  return c.json({ requests: results.map(requestJson) });
});

// Place a media-request pin. One per user per 30 minutes (global).
mediaRequestsRoutes.post('/', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const db = c.env.DB;
  const body = await c.req.json().catch(() => null);
  const lat = body?.lat as number | undefined;
  const lng = body?.lng as number | undefined;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return c.json({ error: 'Invalid coordinates' }, 400);
  }

  const now = Date.now();

  const last = await db
    .prepare('SELECT created_at FROM media_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(user.id)
    .first<{ created_at: number }>();

  if (last && now - last.created_at < MEDIA_REQUEST_COOLDOWN_MS) {
    const remainingMs = last.created_at + MEDIA_REQUEST_COOLDOWN_MS - now;
    return c.json(
      {
        error: 'cooldown',
        retry_after_min: Math.max(1, Math.ceil(remainingMs / 60_000)),
      },
      429
    );
  }

  const id = nanoid(24);
  await db
    .prepare(
      `INSERT INTO media_requests (id, user_id, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, user.id, lat, lng, now)
    .run();

  return c.json({ request: { id, user_id: user.id, lat, lng, created_at: now } }, 201);
});
