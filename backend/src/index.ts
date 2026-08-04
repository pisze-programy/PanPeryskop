import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './auth';
import { postsRoutes } from './posts';
import { storiesRoutes } from './stories';
import { actionsRoutes } from './actions';
import { adminRoutes } from './admin';
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
  const key = c.req.path.replace(/^\/media\//, '');
  const object = await c.env.MEDIA.get(key);
  if (!object) return c.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=3600');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Accept-Ranges', 'bytes');

  const size = object.size;
  const rangeHeader = c.req.header('Range');
  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : size - 1;
      if (isNaN(start) || start > size - 1) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      const validEnd = isNaN(end) || end >= size ? size - 1 : end;
      if (start > validEnd) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      const partial = await c.env.MEDIA.get(key, { range: { offset: start, length: validEnd - start + 1 } });
      if (!partial) return c.notFound();
      headers.set('Content-Range', `bytes ${start}-${validEnd}/${size}`);
      headers.set('Content-Length', String(validEnd - start + 1));
      return new Response(partial.body, { status: 206, headers });
    }
  }

  headers.set('Content-Length', String(size));
  return new Response(object.body, { status: 200, headers });
});

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

export default app;
