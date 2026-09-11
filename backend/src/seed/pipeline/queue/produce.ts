// Producer side of the seed pipeline: create a batch (single-flight per day),
// persist per-scope state rows, and enqueue the opening message. Also the
// sendBatch chunker used whenever a phase enqueues a batch of messages.
import { nanoid } from 'nanoid';
import { enabledProviders } from '../../providers';
import { EnvQ, SeedQueueMessage } from './types';
import { now } from './state';
import { planSeedUnits, writeDayUnits, MAX_UNIT_ATTEMPTS } from './units';
import { D1_BATCH_STATEMENT_CAP, QUEUE_SEND_BATCH_CAP, SEED_REFILL_AHEAD } from '../../core/constants';
import { addDaysWarsaw } from '../../core/dates';

// Enqueue a seed for a day. Single-flight: if a batch for that day is already
// created/fetching/ingesting, no new batch is created — the existing one is returned.
export async function enqueueSeedDay(env: EnvQ, day: string, runType: 'cron' | 'manual'): Promise<{ batchId: string; created: boolean }> {
  const active = await env.DB.prepare("SELECT id FROM seed_batches WHERE day=? AND status IN ('created','fetching','ingesting') LIMIT 1").bind(day).first<{ id: string }>();
  if (active) {
    console.log(`seed: day ${day} already active (batch ${active.id}) — skipped enqueue (single-flight)`);
    return { batchId: active.id, created: false };
  }

  const batchId = nanoid(24);
  const t = now();
  const providers = enabledProviders();
  const scopesTotal = providers.reduce((a, p) => a + p.scopes.length, 0);
  await env.DB.prepare(
    `INSERT INTO seed_batches (id, day, run_type, status, providers_total, providers_done, scopes_total, scopes_done, created_at, updated_at)
     VALUES (?, ?, ?, 'created', ?, 0, ?, 0, ?, ?)`
  ).bind(batchId, day, runType, providers.length, scopesTotal, t, t).run();

  // Per-scope state machine rows (unique per batch+provider+scope).
  const stmts: D1PreparedStatement[] = [];
  for (const p of providers) {
    for (const scope of p.scopes) {
      stmts.push(env.DB.prepare(
        'INSERT INTO seed_scopes (id, batch_id, provider, scope, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
      ).bind(nanoid(24), batchId, p.id, scope, 'pending', t, t));
    }
  }
  for (let i = 0; i < stmts.length; i += D1_BATCH_STATEMENT_CAP) await env.DB.batch(stmts.slice(i, i + D1_BATCH_STATEMENT_CAP));

  // Shadow ledger for the queue redesign (step 4): mirror the same work as
  // seed_units rows. Nothing routes through them yet. Best-effort — a failure
  // here must never break the existing pipeline.
  try {
    await writeDayUnits(env.DB, planSeedUnits({ windowStart: day, days: [day], batchId, generation: 0 }), t, D1_BATCH_STATEMENT_CAP);
  } catch (e) {
    console.error(`seed: shadow seed_units write failed (day ${day}): ${(e as Error).message}`);
  }

  await env.SEED_FETCH_QUEUE.send({ type: 'seed-day', batchId, day, runType });
  return { batchId, created: true };
}

// ---- v2 producer ---------------------------------------------------------
// Plan the whole seed window for one seed run. Idempotent per run: units are
// INSERT OR IGNORE, older-generation units in the window are reset to pending
// (never a claimed one), and the CF queue gets one {unitId} wake-up per worker
// unit. VPS units are pulled by the VPS consumer (no queue).
export async function produceSeedWindow(
  env: EnvQ,
  today: string,
): Promise<{ batchId: string; generation: number; units: number }> {
  const days = Array.from({ length: SEED_REFILL_AHEAD + 1 }, (_, i) => addDaysWarsaw(today, i));
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
       VALUES (?, ?, 'cron', 'created', ?, 0, ?, 0, ?, ?)`,
    )
    .bind(batchId, today, providerCount, units.length, t, t)
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
  for (let i = 0; i < dayStmts.length; i += D1_BATCH_STATEMENT_CAP) await env.DB.batch(dayStmts.slice(i, i + D1_BATCH_STATEMENT_CAP));

  // Refresh: reset older-generation units in the window so their data is re-fetched.
  // Never touch a claimed unit (in-flight); a done unit starts fresh (attempts=0),
  // a failed unit keeps its attempts so a poison unit eventually stays terminal.
  await env.DB
    .prepare(
      `UPDATE seed_units
          SET status='pending', generation=?, claimed_by=NULL, claimed_at=NULL, lease_expires_at=NULL, error=NULL,
              attempts = CASE WHEN status='done' THEN 0 ELSE attempts END, updated_at=?
        WHERE generation < ?
          AND (status='done' OR (status='failed' AND attempts < ?))
          AND day IN (${placeholders})`,
    )
    .bind(generation, t, generation, MAX_UNIT_ATTEMPTS, ...days)
    .run();

  // Insert new units. UNIQUE(day, provider, slice, kind) keeps re-runs idempotent.
  await writeDayUnits(env.DB, units, t, D1_BATCH_STATEMENT_CAP);

  // Wake CF consumers for worker units only; the VPS consumer pulls its own.
  const workerMsgs: MessageSendRequest<SeedQueueMessage>[] = units
    .filter((u) => u.executor === 'worker')
    .map((u) => ({ body: { type: 'unit' as const, unitId: u.id } }));
  if (workerMsgs.length) await sendChunked(env, env.SEED_FETCH_QUEUE, workerMsgs);

  return { batchId, generation, units: units.length };
}

// Cloudflare Queues sendBatch caps at QUEUE_SEND_BATCH_CAP (100) messages per call.
export async function sendChunked(env: EnvQ, queue: Queue<SeedQueueMessage>, msgs: MessageSendRequest<SeedQueueMessage>[]): Promise<void> {
  for (let i = 0; i < msgs.length; i += QUEUE_SEND_BATCH_CAP) {
    await queue.sendBatch(msgs.slice(i, i + QUEUE_SEND_BATCH_CAP));
  }
}
