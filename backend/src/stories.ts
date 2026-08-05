import { Hono } from 'hono';
import { authenticate } from './auth';
import { Post, HeatmapCell, POPULARITY_WEIGHTS, TTL_MS } from './models';

export const storiesRoutes = new Hono<{ Bindings: Env }>();

function mediaUrl(_c: { env: Env }, key: string): string {
  return `https://panperyskop-api.dev-4cb.workers.dev/media/${key}`;
}

// Mirrors models.popularityScore so ORDER BY matches the ranking algorithm.
function popularityExpr(): string {
  const { views: WV, likes: WL, shares: WS } = POPULARITY_WEIGHTS;
  return `(p.views_count * ${WV} + p.likes_count * ${WL} + p.shares_count * ${WS}) * (1 + (CAST(p.likes_count AS REAL) / MAX(p.views_count, 1)))`;
}

function storyJson(p: Post & { author_name: string; watched?: number }, c: { env: Env }): any {
  return {
    ...p,
    is_sponsored: (p as any).is_sponsored === 1,
    liked: false,
    watched: (p as any).watched === 1,
    author_name: p.author_name || 'unknown',
    author_avatar_url: (p as any).author_avatar_key
      ? mediaUrl(c, (p as any).author_avatar_key)
      : null,
    media_url: p.media_key ? mediaUrl(c, p.media_key) : null,
    thumb_url: p.thumb_key ? mediaUrl(c, p.thumb_key) : (p.media_key ? mediaUrl(c, p.media_key) : null),
  };
}

storiesRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const swLat = parseFloat(q.sw_lat || '0');
  const swLng = parseFloat(q.sw_lng || '0');
  const neLat = parseFloat(q.ne_lat || '0');
  const neLng = parseFloat(q.ne_lng || '0');
  const now = Date.now();
  const windowStart = now - TTL_MS;
  const category = q.category === 'live' || q.category === 'events' ? q.category : null;
  const catCond = category ? 'AND p.category = ?' : '';

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const user = await authenticate(c);
    if (user) {
      const { results } = await db
        .prepare(
          `SELECT p.*, u.device_id as author_name, u.avatar_key as author_avatar_key,
                  CASE WHEN v.post_id IS NOT NULL THEN 1 ELSE 0 END as watched
           FROM posts p
           JOIN users u ON p.user_id = u.id
           LEFT JOIN views v ON v.post_id = p.id AND v.user_id = ?
           WHERE p.lat BETWEEN ? AND ?
           AND p.lng BETWEEN ? AND ?
           AND p.status = 'approved'
           AND p.created_at >= ? AND p.created_at <= ?
           ${catCond}
           ORDER BY ${popularityExpr()} DESC
           LIMIT 50`
        )
        .bind(user.id, swLat, neLat, swLng, neLng, windowStart, now, ...(category ? [category] : []))
        .all<Post & { author_name: string; author_avatar_key: string | null; watched: number }>();

      const { results: pendingResults } = await db
        .prepare(
          `SELECT p.*, u.device_id as author_name, u.avatar_key as author_avatar_key,
                  CASE WHEN v.post_id IS NOT NULL THEN 1 ELSE 0 END as watched
           FROM posts p
           JOIN users u ON p.user_id = u.id
           LEFT JOIN views v ON v.post_id = p.id AND v.user_id = ?
           WHERE p.user_id = ?
           AND p.lat BETWEEN ? AND ?
           AND p.lng BETWEEN ? AND ?
           AND p.status = 'pending'
           AND p.created_at >= ? AND p.created_at <= ?
           ${catCond}
           ORDER BY p.created_at DESC
           LIMIT 50`
        )
        .bind(user.id, user.id, swLat, neLat, swLng, neLng, windowStart, now, ...(category ? [category] : []))
        .all<Post & { author_name: string; author_avatar_key: string | null; watched: number }>();

      return c.json({
        stories: [...(results as any[]), ...(pendingResults as any[])].map((p) => storyJson(p, c)),
      });
    }
  }

  const { results } = await db
    .prepare(
      `SELECT p.*, u.device_id as author_name, u.avatar_key as author_avatar_key
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.lat BETWEEN ? AND ?
       AND p.lng BETWEEN ? AND ?
       AND p.status = 'approved'
       AND p.created_at >= ? AND p.created_at <= ?
       ${catCond}
       ORDER BY ${popularityExpr()} DESC
       LIMIT 50`
    )
    .bind(swLat, neLat, swLng, neLng, windowStart, now, ...(category ? [category] : []))
    .all<Post & { author_name: string; author_avatar_key: string | null }>();

  return c.json({
    stories: (results as any[]).map((p) => storyJson(p, c)),
  });
});

storiesRoutes.get('/heatmap', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const swLat = parseFloat(q.sw_lat || '0');
  const swLng = parseFloat(q.sw_lng || '0');
  const neLat = parseFloat(q.ne_lat || '0');
  const neLng = parseFloat(q.ne_lng || '0');
  const now = Date.now();
  const windowStart = now - TTL_MS;

  const { results } = await db
    .prepare(
      `SELECT grid_cell_id, AVG(lat) as lat, AVG(lng) as lng, COUNT(*) as heat
       FROM posts
       WHERE lat BETWEEN ? AND ?
       AND lng BETWEEN ? AND ?
       AND status = 'approved'
       AND created_at >= ? AND created_at <= ?
       GROUP BY grid_cell_id
       HAVING COUNT(*) > 0`
    )
    .bind(swLat, neLat, swLng, neLng, windowStart, now)
    .all<HeatmapCell>();

  return c.json(results);
});
