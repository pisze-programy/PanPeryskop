// Persistent seed-run logs in D1 for the manual facebook/mtp paths.
import { nanoid } from 'nanoid';
import { RunType } from './types';

export interface SeedRunLog {
  runType: RunType;
  day: string;
  provider: string;
  transport: string;
  candidates: number;
  ingested: number;
  skipped: number;
  errors: number;
  errorDetail: string | null;
  durationMs: number;
  browserMs: number;
  batchId?: string | null;
}

export async function writeSeedRun(env: Env, log: SeedRunLog): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO seed_runs
        (id, run_type, day, provider, transport, candidates, ingested, skipped, errors, error_detail, duration_ms, browser_ms, batch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      nanoid(24), log.runType, log.day, log.provider, log.transport,
      log.candidates, log.ingested, log.skipped, log.errors, log.errorDetail,
      log.durationMs, log.browserMs, log.batchId ?? null, Date.now()
    )
    .run();
}
