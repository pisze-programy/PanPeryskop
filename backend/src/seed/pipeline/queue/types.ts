// Queue message contract for the v2 seed pipeline. The queue is only a wake-up:
// the durable work-list (seed_units) is the source of truth.
//   - 'unit'     : drain the pending WORKER units.
//   - 'finalize' : reconcile a day once its units are terminal and ingest the
//                  winners in bounded chunks, re-enqueueing while winners remain.
//                  Runs on the queue (NOT in the /complete request) so a slow
//                  reconcile never blocks an executor and a crash retries the
//                  message (reconcile is idempotent — only 'raw' rows are grouped).
export type SeedQueueMessage =
  | { type: 'unit'; unitId?: string }
  | { type: 'finalize'; day: string; batchId: string };

// The seed pipeline runs with the full Worker Env (DB, R2, queues, secrets).
// Kept as a named alias for readability; no subset casting.
export type EnvQ = Env;
