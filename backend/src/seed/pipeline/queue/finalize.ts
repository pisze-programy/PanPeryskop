// End-of-day finalize consumer: reconcile a day once every fetch unit that can
// write to it is terminal, then ingest winners in bounded chunks, re-enqueueing
// itself while winners remain. This runs on the queue — never in the executor's
// /complete request — so a slow reconcile cannot block a unit completion, and a
// crash retries the message (reconcile is idempotent: only 'raw' rows group).
import { EnvQ } from './types';
import { reconcileIfReady, ingestWinnersForDay, sweepStuckRaw } from '../../reconcile';

// Winners per ingest step. Each step is its own queue message so one slow winner
// (geocoder/media) cannot push a batch past the invocation budget; the message
// self-chains while `remaining` > 0.
export const INGEST_CHUNK = 100;

export async function handleFinalizeWake(env: EnvQ, day: string, batchId: string): Promise<void> {
  await sweepStuckRaw(env.DB);
  await reconcileIfReady(env, day, batchId);
  const { processed, remaining } = await ingestWinnersForDay(env, day, INGEST_CHUNK);
  // Chain while winners remain AND this chunk picked some up. Every processed
  // row leaves the winner shelf (done/duplicate/error) or was claimed by a
  // concurrent finalize, so `remaining` trends down; the `processed > 0` guard
  // only stops a degenerate no-op re-enqueue.
  if (remaining > 0 && processed > 0) await env.SEED_FETCH_QUEUE.send({ type: 'finalize', day, batchId });
}
