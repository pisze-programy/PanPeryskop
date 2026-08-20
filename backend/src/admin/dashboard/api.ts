// Admin dashboard JSON API (cookie-auth), mounted at /admin/api.
import { Hono } from 'hono';
import { CITIES } from '../cities';
import { browserBudget, cronInfo, daySeries, eventsSql, nearestCity } from '../queries';
import { runSeed, seedTomorrow } from '../../seed';
import { api } from './common';

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/overview', (c) => api(c, async (env) => {
  const db = env.DB;
  const now = Date.now();
  const dayStart = now - 24 * 3600 * 1000;
  const [users, posts, evToday, viewsToday, likes, shares, mediaReq, errs, banned, lastSeed, cron, budget] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts WHERE category=? AND created_at>=? AND created_at<=?').bind('events', dayStart, now).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM views WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM likes').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM shares').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM media_requests').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM banned_devices').first<{ n: number }>(),
    db.prepare('SELECT * FROM seed_runs WHERE provider=? ORDER BY created_at DESC LIMIT 1').bind('total').first(),
    cronInfo(env, db),
    env.BROWSER ? browserBudget(env) : null,
  ]);
  return {
    users: users?.n ?? 0, posts: posts?.n ?? 0, eventsToday: evToday?.n ?? 0,
    viewsToday: viewsToday?.n ?? 0, likes: likes?.n ?? 0, shares: shares?.n ?? 0,
    mediaRequests: mediaReq?.n ?? 0, errorsToday: errs?.n ?? 0, banned: banned?.n ?? 0,
    lastSeed, cron, budget,
  };
}));

apiRoutes.get('/events', (c) => api(c, async (env) => {
  const q = c.req.query();
  const { sql, binds } = eventsSql({
    cityId: q.city ? String(q.city) : null,
    source: q.source ? String(q.source) : null,
    status: q.status ? String(q.status) : null,
    from: q.from ? String(q.from) : null,
    to: q.to ? String(q.to) : null,
    tag: q.tag ? String(q.tag) : null,
    fromMs: null, toMs: null, limit: 300,
  });
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const out = (results as any[]).map((r) => ({
    ...r, city: nearestCity(r.lat, r.lng), thumb_url: r.thumb_key ? `/media/${r.thumb_key}` : null,
  }));
  return { events: out, cities: CITIES };
}));

apiRoutes.get('/users', (c) => api(c, async (env) => {
  const { results } = await env.DB
    .prepare(`SELECT u.id, u.device_id, u.username, u.auth_provider, u.created_at,
              (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id) AS post_count,
              (SELECT COUNT(*) FROM views v WHERE v.user_id=u.id) AS view_count,
              EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id=u.device_id) AS banned
              FROM users u ORDER BY u.created_at DESC LIMIT 200`).all();
  return { users: results };
}));

apiRoutes.get('/posts', (c) => api(c, async (env) => {
  const q = c.req.query();
  const status = q.status ? String(q.status) : null;
  let sql = `SELECT p.id, p.description, p.created_at, p.status, p.type, p.thumb_key, p.likes_count, p.views_count,
             COALESCE(NULLIF(u.username,''), u.device_id) AS author
             FROM posts p JOIN users u ON p.user_id=u.id WHERE p.category='live'`;
  const binds: unknown[] = [];
  if (status) { sql += ' AND p.status=?'; binds.push(status); }
  sql += ' ORDER BY p.created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return { posts: results };
}));

apiRoutes.get('/seed', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '30'), 10) || 30;
  const since = Date.now() - days * 86400000;
  const { results } = await env.DB.prepare('SELECT * FROM seed_runs WHERE created_at>=? ORDER BY created_at DESC LIMIT 500').bind(since).all();
  const budget = env.BROWSER ? await browserBudget(env) : null;
  const cron = await cronInfo(env, env.DB);
  return { runs: results, budget, cron };
}));

apiRoutes.post('/seed/run', (c) => api(c, async (env) => {
  const body = (await c.req.json<{ day?: string }>().catch(() => ({}))) as { day?: string };
  const day = body?.day;
  if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid day');
  return day ? runSeed(env, day, 'manual') : seedTomorrow(env);
}));

apiRoutes.get('/stats', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '14'), 10) || 14;
  const since = Date.now() - days * 86400000;
  const metric = String(q.metric || 'views');
  const map: Record<string, [string, string, string?]> = {
    views: ['views', 'created_at'], media: ['posts', 'created_at'], likes: ['likes', 'created_at'],
    shares: ['shares', 'created_at'], logins: ['auth_events', 'created_at', " AND event='login'"],
    signups: ['auth_events', 'created_at', " AND event='register'"],
  };
  const [table, col, extra] = map[metric] || map.views;
  return { series: await daySeries(env.DB, table, col, since, extra) };
}));

apiRoutes.get('/errors', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '7'), 10) || 7;
  const since = Date.now() - days * 86400000;
  const { results } = await env.DB.prepare('SELECT * FROM client_errors WHERE created_at>=? ORDER BY created_at DESC LIMIT 200').bind(since).all();
  return { errors: results };
}));

apiRoutes.get('/media-requests', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '14'), 10) || 14;
  const since = Date.now() - days * 86400000;
  const { results } = await env.DB
    .prepare(`SELECT r.id, r.lat, r.lng, r.created_at, COALESCE(NULLIF(u.username,''), u.device_id) AS user
              FROM media_requests r JOIN users u ON r.user_id=u.id WHERE r.created_at>=? ORDER BY r.created_at DESC LIMIT 200`)
    .bind(since).all();
  return { requests: results };
}));
