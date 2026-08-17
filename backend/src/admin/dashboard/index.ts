// Admin dashboard router: JSON API + SSR pages, both mounted at /admin by index.ts.
import { Hono } from 'hono';
import { apiRoutes } from './api';
import { pageRoutes } from './pages';

export const dashboardRoutes = new Hono<{ Bindings: Env }>();
dashboardRoutes.route('/api', apiRoutes);
dashboardRoutes.route('/', pageRoutes);
