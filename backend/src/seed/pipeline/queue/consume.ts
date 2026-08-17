// Consumer entry: dispatch a queue batch to the right handler. Phase queues get
// their per-type handlers; the DLQ consumer re-drives dead-lettered work back to
// the phase queues (bounded by REDRIVE_MAX) or marks it terminal when the batch
// is closed. Per-message ack/retry keeps one slow message from nuking the batch.
import { CandidateStatus } from '../../core/types';
import { QUEUE_CONSUMER_CONCURRENCY, QUEUE_RETRY_DELAY_SECONDS } from '../../core/constants';
import { EnvQ, QUEUE_NAMES, REDRIVE_MAX, SeedQueueMessage } from './types';
import { bumpScopeAttempts, getBatch, getScope, now, setScopeStatus } from './state';
import { handleFinalize, handleFetch, handleIngest, handleSeedDay } from './handlers';

// Process a batch's messages concurrently (cap ~6 to respect the per-invocation
// 6-connection limit and D1's single-threaded write queue). Each message still
// gets independent retry/DLQ semantics.
export async function runQueue(env: EnvQ, batch: MessageBatch<SeedQueueMessage>): Promise<void> {
  const CONCURRENCY = QUEUE_CONSUMER_CONCURRENCY;
  const isDlq = batch.queue === QUEUE_NAMES.DLQ;
  const msgs = [...batch.messages];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, msgs.length) }, async () => {
    while (cursor < msgs.length) {
      const msg = msgs[cursor++];
      try {
        if (isDlq) await handleDlq(env, msg);
        else await handleMessage(env, msg.body);
        msg.ack();
      } catch (e) {
        console.error(`queue ${msg.body.type} attempt ${msg.attempts} failed: ${(e as Error).message}`);
        msg.retry({ delaySeconds: QUEUE_RETRY_DELAY_SECONDS });
      }
    }
  });
  await Promise.all(workers);
}

async function handleMessage(env: EnvQ, m: SeedQueueMessage): Promise<void> {
  switch (m.type) {
    case 'seed-day': return handleSeedDay(env, m);
    case 'fetch': return handleFetch(env, m);
    case 'finalize': return handleFinalize(env, m);
    case 'ingest': return handleIngest(env, m);
  }
}

// DLQ consumer: re-drive dead-lettered work back to the phase queues while the
// batch is active (bounded by REDRIVE_MAX); otherwise mark terminal and let the
// batch finalize. This is what prevents a poison scope from deadlocking a batch.
async function handleDlq(env: EnvQ, msg: Message<SeedQueueMessage>): Promise<void> {
  const m = msg.body;
  switch (m.type) {
    case 'fetch': {
      const scope = await getScope(env, m.batchId, m.provider, m.scope);
      if (!scope || scope.status === 'done' || scope.status === 'failed') return; // already terminal — drop
      const batch = await getBatch(env, m.batchId);
      if (!batch || batch.status === 'done' || batch.status === 'failed') {
        await setScopeStatus(env, m.batchId, m.provider, m.scope, 'failed', 'batch closed');
        return;
      }
      if (scope.attempts >= REDRIVE_MAX) {
        await setScopeStatus(env, m.batchId, m.provider, m.scope, 'failed', `failed after ${scope.attempts} DLQ re-drives`);
        await env.SEED_FINALIZE_QUEUE.send({ type: 'finalize', batchId: m.batchId });
        return;
      }
      await bumpScopeAttempts(env, m.batchId, m.provider, m.scope);
      await env.SEED_FETCH_QUEUE.send({ type: 'fetch', batchId: m.batchId, provider: m.provider, scope: m.scope });
      return;
    }
    case 'ingest': {
      const row = await env.DB.prepare('SELECT batch_id, status, attempts FROM seed_candidates WHERE id=?').bind(m.candidateId).first<{ batch_id: string; status: string; attempts: number }>();
      if (!row || row.status === 'done' || row.status === 'error') return; // already terminal — drop
      const batch = await getBatch(env, row.batch_id);
      if (!batch || batch.status === 'done' || batch.status === 'failed') {
        await env.DB.prepare(`UPDATE seed_candidates SET status='${CandidateStatus.ERROR}', reason=?, updated_at=? WHERE id=?`)
          .bind('batch closed', now(), m.candidateId).run();
        return;
      }
      if (row.attempts >= REDRIVE_MAX) {
        await env.DB.prepare(`UPDATE seed_candidates SET status='${CandidateStatus.ERROR}', reason=?, updated_at=? WHERE id=?`)
          .bind(`failed after ${row.attempts} attempts`, now(), m.candidateId).run();
        await env.SEED_FINALIZE_QUEUE.send({ type: 'finalize', batchId: row.batch_id });
        return;
      }
      await env.SEED_INGEST_QUEUE.send({ type: 'ingest', candidateId: m.candidateId, batchId: row.batch_id });
      return;
    }
    case 'finalize': {
      const batch = await getBatch(env, m.batchId);
      if (batch && batch.status !== 'done' && batch.status !== 'failed') {
        await env.SEED_FINALIZE_QUEUE.send({ type: 'finalize', batchId: m.batchId });
      }
      return;
    }
    case 'seed-day': {
      const batch = await getBatch(env, m.batchId);
      if (batch && batch.status !== 'done' && batch.status !== 'failed') {
        await env.SEED_FETCH_QUEUE.send({ type: 'seed-day', batchId: m.batchId, day: m.day, runType: m.runType });
      }
      return;
    }
  }
}
