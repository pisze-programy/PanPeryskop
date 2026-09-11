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
import {travelRoutes} from './api/travel';
import {runSeed, tomorrowWarsaw, todayWarsaw, addDaysWarsaw} from './seed';
import {produceSeedWindow, runQueue, SeedQueueMessage, watchdogUnits} from './seed/pipeline/queue';
import {pruneSeedData, watchdogSeedBatches} from './seed/pipeline/cleanup';
import {checkDigestIncomplete} from './seed/digest';
import {getLastSeedDay, setLastSeedDay, seedDue} from './seed/cadence';
import {SEED_DAYS_AHEAD, SEED_INTERVAL_DAYS, SEED_REFILL_AHEAD} from './seed/core/constants';
// Nominatim pace per executor: the Worker egresses from Cloudflare's shared
// datacenter IPs — the OSM policy caps regular (daily cron) bulk geocoding at
// 4 req/min (the VPS rotates residential IPs via Webshare and keeps 1/s).
import {configureNominatimPace} from './seed/core/geo';
configureNominatimPace(15_000);

const SEED_CRON = '0 2 * * *';        // 02:00 UTC daily — roll the seed window one day forward
const CLEANUP_CRON = '0 4 * * *';     // 04:00 UTC daily — audit cleanup (4-day retention)
const WATCHDOG_CRON = '0 * * * *';    // hourly — mark stuck batches failed
// The app browses [today, today+SEED_DAYS_AHEAD]; the morning cron seeds the
// new far edge (today+SEED_DAYS_AHEAD). Single-flight skips already-active days.

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    // NOTE: a string '*' — hono treats an ARRAY origin as an exact-match list
    // (`['*'].includes(origin)`), so an array would never emit
    // Access-Control-Allow-Origin for the addon's moz-extension:// origin.
    origin: '*',
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
app.route('/travel', travelRoutes);

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
      const { batchId, generation, units } = await produceSeedWindow(c.env, target);
      return c.json({ planned: true, windowStart: target, batchId, generation, units }, 202);
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
      // Hourly liveness: mark batches stuck in created/fetching/ingesting failed,
      // and email which seed providers did not report their daily job by 14:00.
      ctx.waitUntil(
        (async () => {
          await watchdogSeedBatches(env, 'cron');
          await watchdogUnits(env.DB);
          await checkDigestIncomplete(env);
        })().catch((e) => console.error(`seed watchdog cron failed: ${(e as Error).message}`))
      );
      return;
    }
    // Seed (SEED_CRON): on a seed day, plan the whole window [today..today+SEED_REFILL_AHEAD]
    // into the durable work-list (seed_units) and wake the CF consumers. The VPS
    // consumer drains its own units. Cadence gate via the D1 marker keeps it to
    // every SEED_INTERVAL_DAYS. Idempotent per run (generation + INSERT OR IGNORE).
    ctx.waitUntil(
      (async () => {
        const today = todayWarsaw();
        const last = await getLastSeedDay(env.DB);
        if (!seedDue(last, today)) {
          console.log(`seed cron: not due (last ${last ?? 'never'}, interval ${SEED_INTERVAL_DAYS}) — skip`);
          return;
        }
        const { batchId, generation, units } = await produceSeedWindow(env, today);
        console.log(`seed cron: window planned day=${today} batch=${batchId} gen=${generation} units=${units}`);
        // Commit the cadence only after the window was planned — a partial failure
        // retries on the next cron.
        await setLastSeedDay(env.DB, today);
      })().catch((e) => console.error(`seed cron failed: ${(e as Error).message}`))
    );
  },
};
