// Admin dashboard router: JSON API + SSR pages + static assets, mounted at /admin.
import { Hono } from 'hono';
import { apiRoutes } from './api';
import { pageRoutes } from './pages';
import { serveStatic } from '../ui/static';

export const dashboardRoutes = new Hono<{ Bindings: Env }>();
dashboardRoutes.route('/api', apiRoutes);
dashboardRoutes.route('/', pageRoutes);

// Static admin assets (CSS/JS string modules) — /admin/static/css/admin.css etc.
dashboardRoutes.get('/static/*', (c) => {
  const path = c.req.path.replace(/^\/admin\/static\//, '');
  const res = serveStatic(path);
  return res ?? c.notFound();
});
