// Queue message contract + shared constants for the split seed pipeline.
//   pp-seed-fetch-jobs    → { seed-day, fetch }
//   pp-seed-ingest-jobs   → { ingest }
//   pp-seed-finalize-jobs → { finalize }
//   panperyskop-dlq       → any of the above (dead-lettered), re-driven bounded by REDRIVE_MAX.
export type SeedQueueMessage =
  | { type: 'seed-day'; batchId: string; day: string; runType: 'cron' | 'manual' }
  | { type: 'fetch'; batchId: string; provider: string; scope: string }
  | { type: 'finalize'; batchId: string }
  | { type: 'ingest'; candidateId: string; batchId: string }
  // v2: a wake-up pointing at the durable work-list (seed_units). The consumer
  // claims the next pending worker unit; unitId is informational/logging only.
  | { type: 'unit'; unitId?: string };

export const QUEUE_NAMES = {
  FETCH: 'pp-seed-fetch-jobs',
  INGEST: 'pp-seed-ingest-jobs',
  FINALIZE: 'pp-seed-finalize-jobs',
  DLQ: 'panperyskop-dlq',
} as const;

// A scope/candidate that survived DLQ re-drive this many times is marked terminal
// (failed / error) instead of re-enqueued — a poison message can't loop forever.
export const REDRIVE_MAX = 3;

// One row in seed_scopes (per batch+provider+scope fetch unit).
export interface SeedScopeRow {
  id: string; batch_id: string; provider: string; scope: string;
  status: string; attempts: number; error: string | null;
  created_at: number; updated_at: number;
}

// The seed pipeline runs with the full Worker Env (DB, R2, queues, secrets).
// Kept as a named alias for readability; no subset casting.
export type EnvQ = Env;
