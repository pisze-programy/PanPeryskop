import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {authRoutes} from './api/auth';
import {postsRoutes} from './api/posts';
import {storiesRoutes} from './api/stories';
import {actionsRoutes} from './api/actions';
import {adminRoutes} from './api/admin';
import {facebookSeedRoutes} from './api/facebookSeed';
import {dashboardRoutes} from './admin/dashboard';
import {usersRoutes} from './api/users';
import {clientErrorRoutes} from './api/clientErrors';
import {mediaRequestsRoutes} from './api/mediaRequests';
import {appleEventsRoutes} from './api/appleEvents';
import {reportsRoutes} from './api/reports';
import {runSeed, tomorrowWarsaw, todayWarsaw, addDaysWarsaw} from './seed';
import {enqueueSeedDay, runQueue, SeedQueueMessage} from './seed/pipeline/queue';
import {pruneSeedData, watchdogSeedBatches} from './seed/pipeline/cleanup';
import {SEED_DAYS_AHEAD} from './seed/core/constants';

const SEED_CRON = '0 2 * * *';        // 02:00 UTC daily — roll the seed window one day forward
const CLEANUP_CRON = '0 4 * * *';     // 04:00 UTC daily — audit cleanup (4-day retention)
const WATCHDOG_CRON = '0 * * * *';    // hourly — mark stuck batches failed
// The app browses [today, today+SEED_DAYS_AHEAD]; the morning cron seeds the
// new far edge (today+SEED_DAYS_AHEAD). Single-flight skips already-active days.

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
app.route('/admin', facebookSeedRoutes);
app.route('/admin', dashboardRoutes);
app.route('/client', clientErrorRoutes);
app.route('/media-requests', mediaRequestsRoutes);
app.route('/apple', appleEventsRoutes);
app.route('/reports', reportsRoutes);

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
      const { batchId, created } = await enqueueSeedDay(c.env, target, 'manual');
      return c.json({ queued: true, day: target, batchId, created }, 202);
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
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === CLEANUP_CRON) {
      // Daily audit cleanup: drop seed audit older than 4 days (venues kept).
      ctx.waitUntil(
        pruneSeedData(env, 'cron')
          .then(() => console.log('seed cleanup cron done'))
          .catch((e) => console.error(`seed cleanup cron failed: ${(e as Error).message}`))
      );
      return;
    }
    if (controller.cron === WATCHDOG_CRON) {
      // Hourly liveness: mark batches stuck in created/fetching/ingesting failed.
      ctx.waitUntil(
        watchdogSeedBatches(env, 'cron')
          .then(() => console.log('seed watchdog cron done'))
          .catch((e) => console.error(`seed watchdog cron failed: ${(e as Error).message}`))
      );
      return;
    }
    // Daily seed (SEED_CRON): roll the seed window one day forward (today+SEED_DAYS_AHEAD).
    // Single-flight per day prevents duplicate batches; the queue consumer does the
    // heavy work with per-message retries + bounded DLQ re-drive.
    ctx.waitUntil(
      enqueueSeedDay(env, addDaysWarsaw(todayWarsaw(), SEED_DAYS_AHEAD), 'cron')
        .then(({ batchId, created }) => console.log(`seed cron enqueued: day=${addDaysWarsaw(todayWarsaw(), SEED_DAYS_AHEAD)} batch=${batchId} created=${created}`))
        .catch((e) => console.error(`seed cron enqueue failed: ${(e as Error).message}`))
    );
  },
};
