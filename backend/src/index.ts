import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {authRoutes} from './auth';
import {postsRoutes} from './posts';
import {storiesRoutes} from './stories';
import {actionsRoutes} from './actions';
import {adminRoutes} from './admin';
import {dashboardRoutes} from './admin/dashboard';
import {usersRoutes} from './users';
import {clientErrorRoutes} from './clientErrors';
import {mediaRequestsRoutes} from './mediaRequests';
import {runSeed, tomorrowWarsaw} from './seed';
import {enqueueSeedDay, runQueue, SeedQueueMessage} from './seed/queue';

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
// Runs synchronously (blocking) so the caller sees the full result; the cron path
// uses the async queue (see `queue` + `scheduled` below). Pass via:"queue" to run
// through the queue pipeline instead (useful for testing).
app.post('/admin/seed', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!c.env.ADMIN_SECRET || token !== c.env.ADMIN_SECRET) return c.json({ error: 'Forbidden' }, 403);
  const body = (await c.req.json<{ day?: string; via?: string }>().catch(() => ({}))) as { day?: string; via?: string };
  const day = body?.day;
  if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return c.json({ error: 'Invalid day' }, 400);
  }
  const target = day ?? tomorrowWarsaw();
  try {
    if (body?.via === 'queue') {
      const batchId = await enqueueSeedDay(c.env, target, 'manual');
      return c.json({ queued: true, day: target, batchId }, 202);
    }
    const result = await runSeed(c.env, target, 'manual');
    return c.json(result, 200);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default {
  fetch: app.fetch.bind(app),
  async queue(batch: MessageBatch<SeedQueueMessage>, env: Env): Promise<void> {
    await runQueue(env, batch);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Daily seed: enqueue a batch for tomorrow. The queue consumer does the heavy
    // work with per-event retries + DLQ — no long-running single invocation.
    ctx.waitUntil(
      enqueueSeedDay(env, tomorrowWarsaw(), 'cron')
        .then((batchId) => console.log(`seed cron enqueued: day=${tomorrowWarsaw()} batch=${batchId}`))
        .catch((e) => console.error(`seed cron enqueue failed: ${(e as Error).message}`))
    );
  },
};
