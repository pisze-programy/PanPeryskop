// Admin dashboard SSR pages, mounted at /admin by dashboard/index.ts.
import { Hono } from 'hono';
import { registerAuth } from './auth';
import { registerOverview } from './overview';
import { registerEvents } from './events';
import { registerTags } from './tags';
import { registerUsers } from './users';
import { registerPosts } from './posts';
import { registerSeed } from './seed';
import { registerStats } from './stats';
import { registerErrors } from './errors';
import { registerMediaRequests } from './mediaRequests';
import { registerReports } from './reports';

export const pageRoutes = new Hono<{ Bindings: Env }>();
registerAuth(pageRoutes);
registerOverview(pageRoutes);
registerEvents(pageRoutes);
registerTags(pageRoutes);
registerUsers(pageRoutes);
registerPosts(pageRoutes);
registerSeed(pageRoutes);
registerStats(pageRoutes);
registerErrors(pageRoutes);
registerMediaRequests(pageRoutes);
registerReports(pageRoutes);
