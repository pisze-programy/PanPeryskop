// Cron schedule display + next-run calculation for the dashboard.
// The worker's schedule lives in wrangler.toml [triggers] crons = ["0 2 * * *"].
// We mirror it here for display (local == CF: same value, kept in one place).

export const CRON_SCHEDULES = ['0 2 * * *']; // daily 02:00 UTC

// Human-readable description (Europe/Warsaw, accounts for CEST/CET).
export function cronSummary(): string {
  return 'Codziennie 02:00 UTC (04:00 w lato / 03:00 zimą, Europe/Warsaw)';
}

// Compute the next occurrence of a cron "M H * * *" (daily, single time) in ms.
export function nextCronRunMs(): number | null {
  const parts = CRON_SCHEDULES[0]?.split(' ') ?? [];
  if (parts.length !== 5) return null;
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return null;
  const now = new Date();
  const candidate = new Date(now);
  candidate.setUTCMinutes(minute, 0, 0);
  candidate.setUTCHours(hour, minute, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate.getTime();
}

export interface CronInfo {
  schedules: string[];
  summary: string;
  nextRunMs: number | null;
  lastCronRunMs: number | null;
}
