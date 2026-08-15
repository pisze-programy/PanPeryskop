// Persistent seed-run logs in D1 (manual + cron) + Browser Run budget tracking.
import { nanoid } from 'nanoid';
import { RunType } from './types';

const BROWSER_BUDGET_MS = 10 * 3_600_000; // 10h / month (Workers Paid included)

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
}

export async function writeSeedRun(env: Env, log: SeedRunLog): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO seed_runs
        (id, run_type, day, provider, transport, candidates, ingested, skipped, errors, error_detail, duration_ms, browser_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      nanoid(24), log.runType, log.day, log.provider, log.transport,
      log.candidates, log.ingested, log.skipped, log.errors, log.errorDetail,
      log.durationMs, log.browserMs, Date.now()
    )
    .run();
}

export interface BrowserBudget {
  monthMs: number;
  limitMs: number;
  exceeded: boolean;
}

export async function browserBudget(env: Env): Promise<BrowserBudget | null> {
  if (!env.BROWSER) return null;
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const row = await env.DB
    .prepare('SELECT COALESCE(SUM(browser_ms), 0) AS total FROM seed_runs WHERE created_at >= ?')
    .bind(startOfMonth.getTime())
    .first<{ total: number }>();
  const monthMs = row?.total ?? 0;
  return { monthMs, limitMs: BROWSER_BUDGET_MS, exceeded: monthMs > BROWSER_BUDGET_MS };
}
