import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './auth';
import { postsRoutes } from './posts';
import { storiesRoutes } from './stories';
import { actionsRoutes } from './actions';
import { adminRoutes } from './admin';
import { dashboardRoutes } from './admin/dashboard';
import { usersRoutes } from './users';
import { clientErrorRoutes } from './clientErrors';
import { mediaRequestsRoutes } from './mediaRequests';
import { runSeed, seedTomorrow } from './seed';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: ['*'],
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
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
app.route('/admin', dashboardRoutes);
app.route('/client', clientErrorRoutes);
app.route('/media-requests', mediaRequestsRoutes);

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

// Manual seed trigger (admin-only). day = YYYY-MM-DD (default: tomorrow).
app.post('/admin/seed', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!c.env.ADMIN_SECRET || token !== c.env.ADMIN_SECRET) return c.json({ error: 'Forbidden' }, 403);
  const body = (await c.req.json<{ day?: string }>().catch(() => ({}))) as { day?: string };
  const day = body?.day;
  if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return c.json({ error: 'Invalid day' }, 400);
  }
  try {
    const result = await (day ? runSeed(c.env, day, 'manual') : seedTomorrow(c.env));
    return c.json(result, 200);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Daily seed: load tomorrow's events. Errors are caught inside runSeed per-provider
    // and per-candidate; every run is logged to D1 (seed_runs) with timings.
    ctx.waitUntil(
      seedTomorrow(env)
        .then((r) => console.log(`seed cron done: day=${r.day} ingested=${r.total.ingested} errors=${r.total.errors} browserMs=${r.total.browserMs}`))
        .catch((e) => console.error(`seed cron failed: ${(e as Error).message}`))
    );
  },
};
