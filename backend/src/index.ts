import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './auth';
import { postsRoutes } from './posts';
import { storiesRoutes } from './stories';
import { actionsRoutes } from './actions';
import { adminRoutes } from './admin';
import { mediaRoutes } from './media';
import { usersRoutes } from './users';

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
app.route('/users', usersRoutes);
app.route('/posts', postsRoutes);
app.route('/stories', storiesRoutes);
app.route('/actions', actionsRoutes);
app.route('/admin', adminRoutes);

app.all('/media/*', async (c) => {
  const path = c.req.path;
  const key = path.replace(/^\/media\//, '');
  const object = await c.env.MEDIA.get(key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=3600');
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(object.body, { headers });
});

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

export default app;
