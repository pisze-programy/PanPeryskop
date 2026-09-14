import { CONFIG } from '../../../config/index';
// Producer side of the seed pipeline: plan one seed run's whole window into the
// durable work-list (seed_units) and wake the CF consumers. Also the sendBatch
// chunker used whenever a phase enqueues a batch of messages.
import { nanoid } from 'nanoid';
import { EnvQ, SeedQueueMessage } from './types';
import { RunType } from '../../core/types';
import { now } from './state';
import { planSeedUnits, writeDayUnits, MAX_UNIT_STRIKES } from './units';
import { addDaysWarsaw } from '../../core/dates';

// ---- v2 producer ---------------------------------------------------------
// Plan the whole seed window for one seed run. Idempotent per run: units are
// INSERT OR IGNORE, older-generation units in the window are reset to pending
// (never a claimed one), and the CF queue gets one {unitId} wake-up per worker
// unit. VPS units are pulled by the VPS consumer (no queue).
export async function produceSeedWindow(
  env: EnvQ,
  today: string,
  runType: RunType = 'cron',
): Promise<{ batchId: string; generation: number; units: number }> {
  const days = Array.from({ length: CONFIG.seed.window.refillAhead + 1 }, (_, i) => addDaysWarsaw(today, i));
  const windowStart = days[0];
  const t = now();
  const placeholders = days.map(() => '?').join(',');

  // One generation per run: max over the window + 1.
  const maxRow = await env.DB
    .prepare(`SELECT COALESCE(MAX(gen), 0) AS g FROM seed_days WHERE day IN (${placeholders})`)
    .bind(...days)
    .first<{ g: number }>();
  const generation = (maxRow?.g ?? 0) + 1;

  // One batch row for the run (day audit + FK anchor for units/raw).
  const batchId = nanoid(24);
  const units = planSeedUnits({ windowStart, days, batchId, generation });
  const providerCount = new Set(units.map((u) => u.provider)).size;
  await env.DB
    .prepare(
      `INSERT INTO seed_batches (id, day, run_type, status, providers_total, providers_done, scopes_total, scopes_done, created_at, updated_at)
       VALUES (?, ?, ?, 'created', ?, 0, ?, 0, ?, ?)`,
    )
    .bind(batchId, today, runType, providerCount, units.length, t, t)
    .run();

  // Mark the generation on every window day.
  const dayStmts = days.map((day) =>
    env.DB
      .prepare(
        `INSERT INTO seed_days (day, gen, reconciling, updated_at) VALUES (?, ?, 0, ?)
         ON CONFLICT(day) DO UPDATE SET gen=excluded.gen, updated_at=excluded.updated_at`,
      )
      .bind(day, generation, t),
  );
  for (let i = 0; i < dayStmts.length; i += CONFIG.queue.d1BatchCap) await env.DB.batch(dayStmts.slice(i, i + CONFIG.queue.d1BatchCap));

  // Refresh: reset older-generation units in the window so their data is re-fetched.
  // Never touch a claimed unit (in-flight). A done unit starts clean. A failed unit
  // gets a fresh attempt budget AND a strike; once strikes reach MAX_UNIT_STRIKES it
  // is left terminal, so a permanently broken scope stops costing proxy every refill.
  await env.DB
    .prepare(
      `UPDATE seed_units
          SET status = CASE WHEN status='failed' AND strikes + 1 >= ? THEN 'failed' ELSE 'pending' END,
              strikes = CASE WHEN status='failed' THEN strikes + 1 ELSE 0 END,
              generation=?, claimed_by=NULL, claimed_at=NULL, lease_expires_at=NULL, error=NULL,
              attempts=0, updated_at=?
        WHERE generation < ?
          AND status IN ('done','failed')
          AND day IN (${placeholders})`,
    )
    .bind(MAX_UNIT_STRIKES, generation, t, generation, ...days)
    .run();

  // Insert new units. UNIQUE(day, provider, slice, kind) keeps re-runs idempotent.
  await writeDayUnits(env.DB, units, t, CONFIG.queue.d1BatchCap);

  // Wake CF consumers for worker units only; the VPS consumer pulls its own.
  const workerMsgs: MessageSendRequest<SeedQueueMessage>[] = units
    .filter((u) => u.executor === 'worker')
    .map((u) => ({ body: { type: 'unit' as const, unitId: u.id } }));
  if (workerMsgs.length) await sendChunked(env, env.SEED_FETCH_QUEUE, workerMsgs);

  return { batchId, generation, units: units.length };
}

// Cloudflare Queues sendBatch caps at QUEUE_SEND_BATCH_CAP (100) messages per call.
export async function sendChunked(env: EnvQ, queue: Queue<SeedQueueMessage>, msgs: MessageSendRequest<SeedQueueMessage>[]): Promise<void> {
  for (let i = 0; i < msgs.length; i += CONFIG.queue.sendBatchCap) {
    await queue.sendBatch(msgs.slice(i, i + CONFIG.queue.sendBatchCap));
  }
}
