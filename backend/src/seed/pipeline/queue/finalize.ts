// End-of-day finalize consumer: reconcile a day once every fetch unit that can
// write to it is terminal, then ingest winners in bounded chunks, re-enqueueing
// itself while winners remain. This runs on the queue — never in the executor's
// /complete request — so a slow reconcile cannot block a unit completion, and a
// crash retries the message (reconcile is idempotent: only 'raw' rows group).
import { EnvQ } from './types';
import { reconcileIfReady, ingestWinnersForDay } from '../../reconcile';

export const INGEST_CHUNK = 100;

export async function handleFinalizeWake(env: EnvQ, day: string, batchId: string): Promise<void> {
  await reconcileIfReady(env, day, batchId);
  const { processed, remaining } = await ingestWinnersForDay(env, day, INGEST_CHUNK);
  if (remaining > 0 && processed > 0) await env.SEED_FETCH_QUEUE.send({ type: 'finalize', day, batchId });
}
