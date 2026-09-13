// Seed alerting via cf-snitch (fire-and-forget email). The old per-provider
// digest (seed_digest / checkDigestIncomplete) was tied to the retired job model
// and is gone; the v2 watchdog raises a unit-level failure alert instead
// (see reconcile.alertFailedUnits).
export type AlertStatus = 'ok' | 'partial' | 'failed';

export interface SnitchEnv {
  SNITCH_URL?: string;
  SNITCH_TOKEN?: string;
}

/** Fire-and-forget cf-snitch report. A failure here never throws to the caller.
 *  `notify` controls when cf-snitch emails: 'always' (default) or 'on-error'. */
export async function snitchReport(
  env: SnitchEnv,
  source: string,
  status: AlertStatus,
  opts?: { data?: Record<string, unknown>; message?: string; notify?: 'always' | 'on-error' },
): Promise<void> {
  const url = env.SNITCH_URL;
  const token = env.SNITCH_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/v1/report`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, status, notify: opts?.notify ?? 'always', data: opts?.data, message: opts?.message }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    // Email must never break the seed — but log it so a silent failure is visible.
    console.error(`snitch report failed (${source}): ${(e as Error).message}`);
  }
}
