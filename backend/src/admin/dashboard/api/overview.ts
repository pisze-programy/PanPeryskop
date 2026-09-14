import { CONFIG } from '../../../config/index';
// JSON API: dashboard overview (chart payloads + KPIs for the Odśwież button).
import { Hono } from 'hono';
import { overviewData, overviewCharts } from '../../queries';
import { api } from '../common';

const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/overview', (c) => api(c, async (env) => {
  const data = await overviewData(env, CONFIG.seed.window.daysAhead);
  return overviewCharts(data);
}));

export function registerApiOverview(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
