// Admin dashboard JSON API (cookie-auth), mounted at /admin/api.
import { Hono } from 'hono';
import { registerApiOverview } from './overview';
import { registerApiEvents } from './events';
import { registerApiUsers } from './users';
import { registerApiPosts } from './posts';
import { registerApiSeed } from './seed';
import { registerApiStats } from './stats';
import { registerApiErrors } from './errors';
import { registerApiMediaRequests } from './mediaRequests';

export const apiRoutes = new Hono<{ Bindings: Env }>();
registerApiOverview(apiRoutes);
registerApiEvents(apiRoutes);
registerApiUsers(apiRoutes);
registerApiPosts(apiRoutes);
registerApiSeed(apiRoutes);
registerApiStats(apiRoutes);
registerApiErrors(apiRoutes);
registerApiMediaRequests(apiRoutes);
