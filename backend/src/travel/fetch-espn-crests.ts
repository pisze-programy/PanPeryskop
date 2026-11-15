import { CONFIG } from '../config/index';
import { addDaysWarsaw, todayWarsaw } from '../seed/core/dates';
import { keepEuropeanCityEvent } from './airports';
import { syncEspnCrests, validTeamId } from './espnCrests';

interface LeagueTeamEntry {
  team?: { id?: string; logos?: Array<{ href?: string }> };
}

interface ScoreboardEvent {
  competitions?: Array<{
    venue?: { address?: { city?: string; country?: string } } | null;
    competitors?: Array<{ team?: { id?: string; logo?: string } }>;
  }>;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} env var is required`);
  return value;
}

function recordCrest(crests: Map<string, string>, rawId: string | undefined, logo: string | undefined): void {
  const id = validTeamId(rawId);
  if (!id || !logo) return;
  crests.set(id, logo);
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(CONFIG.travel.espn.crests.timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractLeagueTeams(body: Record<string, unknown>): LeagueTeamEntry[] {
  const sports = Array.isArray(body.sports) ? (body.sports as Array<Record<string, unknown>>) : [];
  const leagues = Array.isArray(sports[0]?.leagues) ? (sports[0].leagues as Array<Record<string, unknown>>) : [];
  const teams = leagues[0]?.teams;
  return Array.isArray(teams) ? (teams as LeagueTeamEntry[]) : [];
}

async function collectLeagueCrests(slug: string, crests: Map<string, string>): Promise<void> {
  const url = `${CONFIG.travel.espn.host}/apis/site/v2/sports/soccer/${slug}/teams?limit=200`;
  const body = await fetchJson(url);
  if (!body) return;
  for (const entry of extractLeagueTeams(body)) {
    recordCrest(crests, entry.team?.id, entry.team?.logos?.[0]?.href);
  }
}

function collectEventCrests(event: ScoreboardEvent, crests: Map<string, string>): void {
  const comp = event.competitions?.[0];
  const city = comp?.venue?.address?.city?.trim();
  const country = comp?.venue?.address?.country?.trim();
  if (!city || !country || !keepEuropeanCityEvent(country, city)) return;
  for (const competitor of comp?.competitors ?? []) {
    recordCrest(crests, competitor.team?.id, competitor.team?.logo);
  }
}

async function collectScoreboardDay(day: string, crests: Map<string, string>): Promise<void> {
  const compact = day.replace(/-/g, '');
  const url = `${CONFIG.travel.espn.host}/apis/site/v2/sports/soccer/all/scoreboard?dates=${compact}&limit=${CONFIG.travel.espn.limit}`;
  const body = await fetchJson(url);
  const events = Array.isArray(body?.events) ? (body.events as ScoreboardEvent[]) : [];
  for (const event of events) collectEventCrests(event, crests);
}

function parseDaysArg(): number {
  const arg = process.argv.find((a) => a.startsWith('--days='));
  if (!arg) return CONFIG.travel.backfillDays;
  const parsed = Number(arg.split('=')[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --days value: ${arg}`);
  return Math.floor(parsed);
}

async function main(): Promise<void> {
  const baseUrl = requiredEnv('BASE_URL').replace(/\/+$/, '');
  const adminSecret = requiredEnv('ADMIN_SECRET');
  const days = parseDaysArg();
  const crests = new Map<string, string>();

  for (const slug of CONFIG.travel.espn.crests.europeanLeagueSlugs) {
    await collectLeagueCrests(slug, crests);
  }

  const start = todayWarsaw();
  for (let offset = 0; offset < days; offset++) {
    await collectScoreboardDay(addDaysWarsaw(start, offset), crests);
  }

  console.log(`collected ${crests.size} unique ESPN crests; syncing to ${baseUrl}...`);
  const result = await syncEspnCrests(baseUrl, adminSecret, crests);
  console.log(`done: ${result.uploaded} uploaded, ${result.failed} failed (${result.missing} missing of ${crests.size})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
