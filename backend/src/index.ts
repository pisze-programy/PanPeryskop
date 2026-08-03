import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './auth';
import { postsRoutes } from './posts';
import { storiesRoutes } from './stories';
import { actionsRoutes } from './actions';
import { adminRoutes } from './admin';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: ['*'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86_400,
  })
);

app.route('/auth', authRoutes);
app.route('/posts', postsRoutes);
app.route('/stories', storiesRoutes);
app.route('/actions', actionsRoutes);
app.route('/admin', adminRoutes);

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

export default app;
