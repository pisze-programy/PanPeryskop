// Seed digest: tracks each provider's daily job (Worker cron + VPS runners) and
// emails a per-provider + day-done summary via cf-snitch. The Worker is the
// single coordinator (shared D1 counter) — the VPS reports through
// POST /admin/seed/digest. Email is fire-and-forget: a cf-snitch failure never
// fails the seed.
import { PROVIDER_CONFIGS } from './providers/registry';
import { SEED_DAYS_AHEAD } from './core/constants';
import { addDaysWarsaw, toWarsawIso, warsawDateOf } from './core/dates';

export type DigestStatus = 'ok' | 'partial' | 'failed';

export interface DigestInput {
  /** Far-edge seed day the job produced (YYYY-MM-DD). */
  day: string;
  provider: string;
  status: DigestStatus;
  candidates?: number;
  ingested?: number;
  errors?: number;
  message?: string;
}

/** Minimal env the digest reads. */
export interface DigestEnv {
  DB: D1Database;
  SNITCH_URL?: string;
  SNITCH_TOKEN?: string;
}

/** The automated seed providers (Worker cron + VPS runners). facebook is manual
 *  (transport 'manual') and is excluded from the daily jobs. */
export function activeSeedProviders(): string[] {
  return PROVIDER_CONFIGS
    .filter((c) => c.enabled && (c.executors.worker === true || c.executors.vps !== undefined) && c.transport !== 'manual')
    .map((c) => c.id)
    .sort();
}

/** Fire-and-forget cf-snitch report. A failure here never throws to the caller. */
export async function snitchReport(
  env: DigestEnv,
  source: string,
  status: DigestStatus,
  opts?: { data?: Record<string, unknown>; message?: string }
): Promise<void> {
  const url = env.SNITCH_URL;
  const token = env.SNITCH_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/v1/report`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, status, notify: 'always', data: opts?.data, message: opts?.message }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* email must never break the seed */
  }
}

const t = () => Date.now();

/** Record a provider's daily job. Dedupes per (day, provider): a report with the
 *  SAME status as the stored one is a retry/DLQ re-drive — no new email. A status
 *  CHANGE (e.g. failed → ok after a successful retry) emails again. */
export async function recordSeedDigest(env: DigestEnv, input: DigestInput): Promise<void> {
  const existing = await env.DB.prepare('SELECT status FROM seed_digest WHERE day = ? AND provider = ?')
    .bind(input.day, input.provider).first<{ status: string }>();
  if (existing && existing.status === input.status) return;

  await env.DB.prepare(
    `INSERT INTO seed_digest (day, provider, status, candidates, ingested, errors, message, reported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day, provider) DO UPDATE SET status = excluded.status, candidates = excluded.candidates,
       ingested = excluded.ingested, errors = excluded.errors, message = excluded.message, reported_at = excluded.reported_at`
  ).bind(input.day, input.provider, input.status, input.candidates ?? 0, input.ingested ?? 0, input.errors ?? 0, input.message ?? null, t()).run();

  const providers = activeSeedProviders();
  const done = await env.DB.prepare('SELECT COUNT(DISTINCT provider) AS n FROM seed_digest WHERE day = ?').bind(input.day).first<{ n: number }>();
  const index = Math.min(done?.n ?? 1, providers.length);

  await snitchReport(env, `panperyskop/seed/${input.provider}`, input.status, {
    data: {
      day: input.day,
      job: `${index}/${providers.length}`,
      candidates: input.candidates ?? 0,
      ingested: input.ingested ?? 0,
      errors: input.errors ?? 0,
    },
    message: input.message,
  });

  await maybeDayDone(env, input.day, providers.length);
}

/** Report a Worker-batch provider once the batch reached a terminal state. A
 *  permanently failed scope marks the whole provider as failed (with the reason);
 *  otherwise aggregate the per-scope seed_runs into ok/partial. */
export async function reportBatchDigest(env: DigestEnv, batchId: string): Promise<void> {
  const batch = await env.DB.prepare('SELECT day FROM seed_batches WHERE id = ?').bind(batchId).first<{ day: string }>();
  if (!batch) return;
  const scopes = await env.DB.prepare(
    'SELECT provider, status, reason FROM seed_scopes WHERE batch_id = ?'
  ).bind(batchId).all<{ provider: string; status: string; reason: string | null }>();
  const byProvider = new Map<string, { failed: boolean; reason: string | null }>();
  for (const s of scopes?.results ?? []) {
    const cur = byProvider.get(s.provider) ?? { failed: false, reason: null };
    if (s.status === 'failed') { cur.failed = true; cur.reason = cur.reason || s.reason; }
    byProvider.set(s.provider, cur);
  }
  const runs = await env.DB.prepare(
    'SELECT provider, SUM(candidates) AS candidates, SUM(ingested) AS ingested, SUM(errors) AS errors FROM seed_runs WHERE batch_id = ? GROUP BY provider'
  ).bind(batchId).all<{ provider: string; candidates: number; ingested: number; errors: number }>();
  for (const r of runs?.results ?? []) {
    const scopeState = byProvider.get(r.provider);
    await recordSeedDigest(env, {
      day: batch.day,
      provider: r.provider,
      status: scopeState?.failed ? 'failed' : (r.errors > 0 ? 'partial' : 'ok'),
      candidates: r.candidates ?? 0,
      ingested: r.ingested ?? 0,
      errors: r.errors ?? 0,
      message: scopeState?.failed ? (scopeState.reason || 'scope failed') : undefined,
    });
  }
  // A provider whose scopes ALL failed has no seed_runs — still report it failed.
  for (const [provider, state] of byProvider) {
    if (!state.failed) continue;
    const already = await env.DB.prepare('SELECT 1 AS x FROM seed_digest WHERE day = ? AND provider = ?').bind(batch.day, provider).first<{ x: number }>();
    if (!already) {
      await recordSeedDigest(env, {
        day: batch.day, provider, status: 'failed', candidates: 0, ingested: 0, errors: 0,
        message: state.reason || 'scope failed',
      });
    }
  }
}

/** Report a provider as failed the moment a scope dies permanently (DLQ). */
export async function reportProviderFailed(env: DigestEnv, batchId: string, provider: string, message: string): Promise<void> {
  const batch = await env.DB.prepare('SELECT day FROM seed_batches WHERE id = ?').bind(batchId).first<{ day: string }>();
  if (!batch) return;
  await recordSeedDigest(env, { day: batch.day, provider, status: 'failed', candidates: 0, ingested: 0, errors: 0, message });
}

/** When every active provider reported for the day, email the daily summary once. */
async function maybeDayDone(env: DigestEnv, day: string, total: number): Promise<void> {
  const rows = await env.DB.prepare(
    'SELECT provider, status, candidates, ingested, errors FROM seed_digest WHERE day = ? ORDER BY provider'
  ).bind(day).all<{ provider: string; status: string; candidates: number; ingested: number; errors: number }>();
  const all = rows?.results ?? [];
  if (all.length < total) return;

  const guard = await env.DB.prepare('INSERT OR IGNORE INTO seed_digest_done (day, sent_at) VALUES (?, ?)').bind(day, t()).run();
  if (guard.meta.changes === 0) return; // already sent

  const failed = all.filter((r) => r.status === 'failed');
  const summary: Record<string, string> = {};
  for (const r of all) summary[r.provider] = `${r.status} (${r.ingested} ingested / ${r.errors} errors)`;
  await snitchReport(env, 'panperyskop/seed/day-done', failed.length ? 'partial' : 'ok', {
    data: { day, providers: all.length, ...summary },
  });
}

/** Every provider must report its daily job by 14:00 Europe/Warsaw. */
export const DIGEST_DEADLINE_HOUR = 14;

function warsawHour(ms: number): number {
  return Number(toWarsawIso(ms).slice(11, 13));
}

/** The digest day D is produced by the job that runs on calendar day (D - SEED_DAYS_AHEAD).
 *  Its deadline (14:00 Warsaw) passed when that job day is before today, or is today
 *  and the current Warsaw hour is past the deadline. */
function jobDeadlinePassed(day: string, nowMs: number): boolean {
  const today = warsawDateOf(nowMs);
  const jobDay = addDaysWarsaw(day, -SEED_DAYS_AHEAD);
  if (jobDay < today) return true;
  if (jobDay === today) return warsawHour(nowMs) >= DIGEST_DEADLINE_HOUR;
  return false;
}

/** Watchdog: after the deadline, email once which providers did not report for a day. */
export async function checkDigestIncomplete(env: DigestEnv, nowMs: number = Date.now()): Promise<void> {
  const providers = activeSeedProviders();
  const today = warsawDateOf(nowMs);
  const farEdge = addDaysWarsaw(today, SEED_DAYS_AHEAD);
  // Current far edge + the two previous days (their job deadlines already passed).
  const days = [farEdge, addDaysWarsaw(farEdge, -1), addDaysWarsaw(farEdge, -2)];
  for (const day of days) {
    if (!jobDeadlinePassed(day, nowMs)) continue;
    const rows = await env.DB.prepare('SELECT DISTINCT provider FROM seed_digest WHERE day = ?').bind(day).all<{ provider: string }>();
    const reported = new Set((rows?.results ?? []).map((r) => r.provider));
    const missing = providers.filter((p) => !reported.has(p));
    if (!missing.length) continue;
    const guard = await env.DB.prepare('INSERT OR IGNORE INTO seed_digest_incomplete (day, sent_at) VALUES (?, ?)').bind(day, t()).run();
    if (guard.meta.changes === 0) continue; // already reported incomplete
    await snitchReport(env, 'panperyskop/seed/day-incomplete', 'failed', {
      data: { day, reported: providers.length - missing.length, missing: missing.join(', ') },
      message: `Missing by ${DIGEST_DEADLINE_HOUR}:00 Warsaw: ${missing.join(', ')}`,
    });
  }
}
