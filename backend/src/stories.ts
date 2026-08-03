import { Hono } from 'hono';
import { authenticate } from './auth';
import { Post, HeatmapCell, POPULARITY_WEIGHTS } from './models';

export const storiesRoutes = new Hono<{ Bindings: Env }>();

function mediaUrl(_c: { env: Env }, key: string): string {
  return `https://pub-panperyskop.r2.dev/${key}`;
}

storiesRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const swLat = parseFloat(q.sw_lat || '0');
  const swLng = parseFloat(q.sw_lng || '0');
  const neLat = parseFloat(q.ne_lat || '0');
  const neLng = parseFloat(q.ne_lng || '0');
  const now = Date.now();

  const WV = POPULARITY_WEIGHTS.views;
  const WL = POPULARITY_WEIGHTS.likes;
  const WS = POPULARITY_WEIGHTS.shares;
  const DECAY = POPULARITY_WEIGHTS.decay;

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const user = await authenticate(c);
    if (user) {
      const { results } = await db
        .prepare(
          `SELECT p.*, u.device_id as author_name
           FROM posts p
           JOIN users u ON p.user_id = u.id
           WHERE p.lat BETWEEN ? AND ?
           AND p.lng BETWEEN ? AND ?
           AND p.status = 'approved'
           AND p.expires_at > ?
           AND p.id NOT IN (SELECT post_id FROM views WHERE user_id = ?)
           ORDER BY (p.views_count * ${WV} + p.likes_count * ${WL} + p.shares_count * ${WS})
           * POWER(${DECAY}, MAX(0, (? - p.created_at) / 3600000.0))
           DESC
           LIMIT 50`
        )
        .bind(swLat, neLat, swLng, neLng, now, user.id, now)
        .all<Post & { author_name: string }>();

      return c.json({
        stories: (results as any[]).map((p) => ({
          ...p,
          liked: false,
          watched: false,
          author_name: p.author_name || 'unknown',
          media_url: p.media_key ? mediaUrl(c, p.media_key) : null,
          thumb_url: p.thumb_key ? mediaUrl(c, p.thumb_key) : (p.media_key ? mediaUrl(c, p.media_key) : null),
        })),
      });
    }
  }

  const { results } = await db
    .prepare(
      `SELECT p.*, u.device_id as author_name
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.lat BETWEEN ? AND ?
       AND p.lng BETWEEN ? AND ?
       AND p.status = 'approved'
       AND p.expires_at > ?
       ORDER BY (p.views_count * ${WV} + p.likes_count * ${WL} + p.shares_count * ${WS})
       DESC
       LIMIT 50`
    )
    .bind(swLat, neLat, swLng, neLng, now)
    .all<Post & { author_name: string }>();

  return c.json({
    stories: (results as any[]).map((p) => ({
      ...p,
      liked: false,
      watched: false,
      author_name: p.author_name || 'unknown',
      media_url: p.media_key ? mediaUrl(c, p.media_key) : null,
      thumb_url: p.thumb_key ? mediaUrl(c, p.thumb_key) : (p.media_key ? mediaUrl(c, p.media_key) : null),
    })),
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

  const { results } = await db
    .prepare(
      `SELECT grid_cell_id, AVG(lat) as lat, AVG(lng) as lng, COUNT(*) as heat
       FROM posts
       WHERE lat BETWEEN ? AND ?
       AND lng BETWEEN ? AND ?
       AND status = 'approved'
       AND expires_at > ?
       GROUP BY grid_cell_id
       HAVING COUNT(*) > 0`
    )
    .bind(swLat, neLat, swLng, neLng, now)
    .all<HeatmapCell>();

  return c.json(results);
});
