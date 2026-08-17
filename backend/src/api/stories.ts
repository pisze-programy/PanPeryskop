import { Hono } from 'hono';
import { authenticate } from './auth';
import { StoryRow, HeatmapCell, POPULARITY_WEIGHTS, TTL_MS, POST_CATEGORY_SET, STATUS_APPROVED } from '../core/models';
import { mediaUrl, originFromRequest } from '../core/media';

export const storiesRoutes = new Hono<{ Bindings: Env }>();

// Mirrors models.popularityScore so ORDER BY matches the ranking algorithm.
function popularityExpr(): string {
  const { views: WV, likes: WL, shares: WS, dislikes: WD } = POPULARITY_WEIGHTS;
  return `MAX(0, p.views_count * ${WV} + p.likes_count * ${WL} + p.shares_count * ${WS} - p.dislikes_count * ${WD}) * (1 + (CAST(p.likes_count AS REAL) / MAX(p.views_count, 1)))`;
}

export interface StoryJson {
  id: string;
  user_id: string;
  type: string;
  lat: number;
  lng: number;
  description: string;
  status: string;
  media_key: string | null;
  thumb_key: string | null;
  duration_ms: number | null;
  created_at: number;
  likes_count: number;
  views_count: number;
  shares_count: number;
  dislikes_count: number;
  grid_cell_id: string | null;
  is_sponsored: boolean;
  category: string;
  link_url: string | null;
  is_sold_out: boolean;
  external_id: string | null;
  liked: boolean;
  disliked: boolean;
  watched: boolean;
  author_name: string;
  author_avatar_url: string | null;
  media_url: string | null;
  thumb_url: string | null;
}

// Map a D1 row to the public story shape. No `as any` — the row type carries the
// raw 0/1 integers and we coerce explicitly.
function storyJson(r: StoryRow, c: { env: Env; req: { url: string } }): StoryJson {
  const origin = originFromRequest(c);
  return {
    id: r.id,
    user_id: r.user_id,
    type: r.type,
    lat: r.lat,
    lng: r.lng,
    description: r.description,
    status: r.status,
    media_key: r.media_key,
    thumb_key: r.thumb_key,
    duration_ms: r.duration_ms,
    created_at: r.created_at,
    likes_count: r.likes_count,
    views_count: r.views_count,
    shares_count: r.shares_count,
    dislikes_count: r.dislikes_count,
    grid_cell_id: r.grid_cell_id,
    is_sponsored: r.is_sponsored === 1,
    category: r.category,
    link_url: r.link_url,
    is_sold_out: r.is_sold_out === 1,
    external_id: r.external_id,
    liked: false,
    disliked: (r.disliked ?? 0) === 1,
    watched: (r.watched ?? 0) === 1,
    author_name: r.author_name || 'unknown',
    author_avatar_url: mediaUrl(origin, r.author_avatar_key),
    media_url: mediaUrl(origin, r.media_key),
    thumb_url: mediaUrl(origin, r.thumb_key ?? r.media_key),
  };
}

type Query = Record<string, string | undefined>;

// Validate the bbox query params; missing/invalid -> null (caller returns 400).
function parseBBox(q: Query): { swLat: number; swLng: number; neLat: number; neLng: number } | null {
  const num = (v: string | undefined) => (v === undefined ? NaN : parseFloat(v));
  const swLat = num(q.sw_lat), swLng = num(q.sw_lng), neLat = num(q.ne_lat), neLng = num(q.ne_lng);
  if (!isFinite(swLat) || !isFinite(swLng) || !isFinite(neLat) || !isFinite(neLng)) return null;
  if (neLat <= swLat || neLng <= swLng) return null;
  return { swLat, swLng, neLat, neLng };
}

storiesRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const bbox = parseBBox(q);
  if (!bbox) return c.json({ error: 'Invalid or missing bbox' }, 400);
  const { swLat, swLng, neLat, neLng } = bbox;
  const now = Date.now();
  const windowStart = now - TTL_MS;
  const category = q.category && POST_CATEGORY_SET.has(q.category) ? q.category : null;
  const catCond = category ? 'AND p.category = ?' : '';
  // Seen (watched) media is hidden from the Live feed entirely — the map removes
  // it locally and future fetches must not return it either.
  const hideWatchedLive = category === 'live';

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const user = await authenticate(c);
    if (user) {
      const { results } = await db
        .prepare(
          `SELECT p.*, COALESCE(NULLIF(u.username, ''), u.device_id) as author_name,
                  u.avatar_key as author_avatar_key,
                  CASE WHEN v.post_id IS NOT NULL THEN 1 ELSE 0 END as watched,
                  CASE WHEN d.post_id IS NOT NULL THEN 1 ELSE 0 END as disliked
           FROM posts p
           JOIN users u ON p.user_id = u.id
           LEFT JOIN views v ON v.post_id = p.id AND v.user_id = ?
           LEFT JOIN dislikes d ON d.post_id = p.id AND d.user_id = ?
           WHERE p.lat BETWEEN ? AND ?
           AND p.lng BETWEEN ? AND ?
           AND p.status = '${STATUS_APPROVED}'
           AND p.created_at >= ? AND p.created_at <= ?
           ${catCond}
           ${hideWatchedLive ? 'AND v.post_id IS NULL' : ''}
           ORDER BY ${popularityExpr()} DESC
           LIMIT 50`
        )
        .bind(user.id, user.id, swLat, neLat, swLng, neLng, windowStart, now, ...(category ? [category] : []))
        .all<StoryRow>();

      return c.json({
        stories: results.map((p) => storyJson(p, c)),
      });
    }
  }

  const { results } = await db
    .prepare(
      `SELECT p.*, COALESCE(NULLIF(u.username, ''), u.device_id) as author_name,
              u.avatar_key as author_avatar_key
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.lat BETWEEN ? AND ?
       AND p.lng BETWEEN ? AND ?
       AND p.status = '${STATUS_APPROVED}'
       AND p.created_at >= ? AND p.created_at <= ?
       ${catCond}
       ORDER BY ${popularityExpr()} DESC
       LIMIT 50`
    )
    .bind(swLat, neLat, swLng, neLng, windowStart, now, ...(category ? [category] : []))
    .all<StoryRow>();

  return c.json({
    stories: results.map((p) => storyJson(p, c)),
  });
});

storiesRoutes.get('/heatmap', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const bbox = parseBBox(q);
  if (!bbox) return c.json({ error: 'Invalid or missing bbox' }, 400);
  const { swLat, swLng, neLat, neLng } = bbox;
  const now = Date.now();
  const windowStart = now - TTL_MS;

  const { results } = await db
    .prepare(
      `SELECT grid_cell_id, AVG(lat) as lat, AVG(lng) as lng, COUNT(*) as heat
       FROM posts
       WHERE lat BETWEEN ? AND ?
       AND lng BETWEEN ? AND ?
       AND status = '${STATUS_APPROVED}'
       AND created_at >= ? AND created_at <= ?
       GROUP BY grid_cell_id
       HAVING COUNT(*) > 0`
    )
    .bind(swLat, neLat, swLng, neLng, windowStart, now)
    .all<HeatmapCell>();

  return c.json(results);
});
