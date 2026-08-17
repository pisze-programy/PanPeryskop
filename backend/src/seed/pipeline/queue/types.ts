// Queue message contract + shared constants for the split seed pipeline.
//   pp-seed-fetch-jobs    → { seed-day, fetch }
//   pp-seed-ingest-jobs   → { ingest }
//   pp-seed-finalize-jobs → { finalize }
//   panperyskop-dlq       → any of the above (dead-lettered), re-driven bounded by REDRIVE_MAX.
export type SeedQueueMessage =
  | { type: 'seed-day'; batchId: string; day: string; runType: 'cron' | 'manual' }
  | { type: 'fetch'; batchId: string; provider: string; scope: string }
  | { type: 'finalize'; batchId: string }
  | { type: 'ingest'; candidateId: string; batchId: string };

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

// Queue bindings needed by the seed pipeline (subset of Env).
export interface EnvQ {
  DB: D1Database;
  MEDIA: R2Bucket;
  SEED_FETCH_QUEUE: Queue<SeedQueueMessage>;
  SEED_INGEST_QUEUE: Queue<SeedQueueMessage>;
  SEED_FINALIZE_QUEUE: Queue<SeedQueueMessage>;
}
