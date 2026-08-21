// Admin dashboard JSON API (cookie-auth), mounted at /admin/api.
import { Hono } from 'hono';
import { registerApiOverview } from './overview';
import { registerApiEvents } from './events';
import { registerApiPosts } from './posts';
import { registerApiSeed } from './seed';
import { registerApiStats } from './stats';
import { registerApiMediaRequests } from './mediaRequests';

export const apiRoutes = new Hono<{ Bindings: Env }>();
registerApiOverview(apiRoutes);
registerApiEvents(apiRoutes);
registerApiPosts(apiRoutes);
registerApiSeed(apiRoutes);
registerApiStats(apiRoutes);
registerApiMediaRequests(apiRoutes);
