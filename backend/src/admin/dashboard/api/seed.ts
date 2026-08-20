// JSON API: seed runs + manual trigger.

import { Hono } from 'hono';
import { browserBudget, cronInfo } from '../../queries';
import { runSeed, seedTomorrow } from '../../../seed';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

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

export function registerApiSeed(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
