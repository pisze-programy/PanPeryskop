// JSON API: dashboard overview (chart payloads + KPIs for the Odśwież button).
import { Hono } from 'hono';
import { overviewData, overviewCharts } from '../../queries';
import { api } from '../common';
import { SEED_DAYS_AHEAD } from '../../../seed/core/constants';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/overview', (c) => api(c, async (env) => {
  const data = await overviewData(env, SEED_DAYS_AHEAD);
  return overviewCharts(data);
}));

export function registerApiOverview(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
