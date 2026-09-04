// Producer side of the seed pipeline: create a batch (single-flight per day),
// persist per-scope state rows, and enqueue the opening message. Also the
// sendBatch chunker used whenever a phase enqueues a batch of messages.
import { nanoid } from 'nanoid';
import { enabledProviders } from '../../providers';
import { EnvQ, SeedQueueMessage } from './types';
import { now } from './state';
import { planDayUnits, writeDayUnits } from './units';
import { D1_BATCH_STATEMENT_CAP, QUEUE_SEND_BATCH_CAP } from '../../core/constants';

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
    await writeDayUnits(env.DB, planDayUnits(day, batchId), t, D1_BATCH_STATEMENT_CAP);
  } catch (e) {
    console.error(`seed: shadow seed_units write failed (day ${day}): ${(e as Error).message}`);
  }

  await env.SEED_FETCH_QUEUE.send({ type: 'seed-day', batchId, day, runType });
  return { batchId, created: true };
}

// Cloudflare Queues sendBatch caps at 100 messages per call — chunk larger batches.
export async function sendChunked(env: EnvQ, queue: Queue<SeedQueueMessage>, msgs: MessageSendRequest<SeedQueueMessage>[]): Promise<void> {
  for (let i = 0; i < msgs.length; i += QUEUE_SEND_BATCH_CAP) {
    await queue.sendBatch(msgs.slice(i, i + 100));
  }
}
