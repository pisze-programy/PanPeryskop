// JSON API: seed runs (v2 unit state) + manual trigger.

import { Hono } from 'hono';
import { cronInfo } from '../../queries';
import { seedRuns, runStatusCounts, seedIngestSeries } from '../../queries/seed';
import { produceSeedWindow } from '../../../seed/pipeline/queue';
import { todayWarsaw } from '../../../seed/core/dates';
import { DAY_MS } from '../../../seed/core/constants';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/seed', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '30'), 10) || 30;
  const since = Date.now() - days * DAY_MS;
  const [runs, statusCounts, ingest] = await Promise.all([
    seedRuns(env.DB, since, 500),
    runStatusCounts(env.DB, since),
    seedIngestSeries(env.DB, since),
  ]);
  const cron = await cronInfo(env, env.DB);
  return { runs, statusCounts, ingest, cron };
}));

apiRoutes.post('/seed/run', (c) => api(c, async (env) => {
  const body = (await c.req.json<{ day?: string }>().catch(() => ({}))) as { day?: string };
  const day = body?.day;
  if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid day');
  return produceSeedWindow(env, day ?? todayWarsaw(), 'manual');
}));

export function registerApiSeed(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
