// JSON API: dashboard overview.

import { Hono } from 'hono';
import { browserBudget, cronInfo } from '../../queries';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/overview', (c) => api(c, async (env) => {
  const db = env.DB;
  const now = Date.now();
  const dayStart = now - 24 * 3600 * 1000;
  const [users, posts, evToday, viewsToday, likes, shares, mediaReq, errs, banned, lastSeedBatch, cron, budget] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts WHERE category=? AND created_at>=? AND created_at<=?').bind('events', dayStart, now).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM views WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM likes').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM shares').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM media_requests').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM banned_devices').first<{ n: number }>(),
    db.prepare('SELECT * FROM seed_batches ORDER BY created_at DESC LIMIT 1').first(),
    cronInfo(env, db),
    env.BROWSER ? browserBudget(env) : null,
  ]);
  let lastSeed: { batch: Record<string, unknown> | null; runs?: unknown } = { batch: lastSeedBatch };
  if (lastSeedBatch) {
    const agg = await db.prepare(
      `SELECT COALESCE(SUM(candidates),0) cands, COALESCE(SUM(ingested),0) ingested, COALESCE(SUM(errors),0) errors
       FROM seed_runs WHERE batch_id=?`
    ).bind((lastSeedBatch as any).id).first();
    lastSeed = { batch: lastSeedBatch, runs: agg };
  }
  return {
    users: users?.n ?? 0, posts: posts?.n ?? 0, eventsToday: evToday?.n ?? 0,
    viewsToday: viewsToday?.n ?? 0, likes: likes?.n ?? 0, shares: shares?.n ?? 0,
    mediaRequests: mediaReq?.n ?? 0, errorsToday: errs?.n ?? 0, banned: banned?.n ?? 0,
    lastSeed, cron, budget,
  };
}));

export function registerApiOverview(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
