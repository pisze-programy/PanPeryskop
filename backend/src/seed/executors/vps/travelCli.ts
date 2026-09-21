#!/usr/bin/env node
// Travel fetcher (VPS, residential egress — ESPN/worldsmarathons block datacenter IPs).
// Runs on a weekly cron per provider: fetches the next 7 days and POSTs the manifest
// to /admin/travel/ingest. `--backfill` (one-off) fetches 90 days instead. The
// checkpoint (geo cache + covered days) persists per provider in
// admin/vps/logs/travel-<provider>.state so a gap closes on the next run.
// `--force` ignores the checkpoint and refetches every day — use it after a parser
// change to overwrite already-ingested rows.
//
//   node backend/dist/travel.mjs --provider=espn
//   node backend/dist/travel.mjs --provider=worldsmarathons --backfill --force
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTravelProvider, TravelSource } from '../../../../src/travel/run';
import { ESPN_SOURCE } from '../../../../src/travel/espn';
import { WORLDSMARATHONS_SOURCE } from '../../../../src/travel/worldsmarathons';
import { checkpointGeoStore, loadCp, saveCp } from './runtime';
import { runRouteDaysJob } from './routeDaysJob';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SOURCES: Record<string, TravelSource> = {
  espn: ESPN_SOURCE,
  worldsmarathons: WORLDSMARATHONS_SOURCE,
};

function findRepoDir(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'backend')) && existsSync(join(dir, 'admin'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return '/opt/panperyskop';
}
const ROOT = findRepoDir(__dirname);
const ENV_FILE = join(ROOT, 'admin', 'vps', '.env');

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string') out[k] = v;
  return out;
}

function argValue(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function log(provider: string, msg: string): void {
  console.log(`[travel-${provider}] ${new Date().toISOString()} ${msg}`);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const base = env.BASE_URL || 'https://api.panperyskop.app';
  const secret = env.ADMIN_SECRET;
  const provider = argValue('provider') || 'espn';
  const source = SOURCES[provider];
  const backfill = process.argv.includes('--backfill');
  if (!secret) {
    log(provider, 'ADMIN_SECRET missing — abort');
    process.exit(1);
  }
  if (provider === 'route-days') {
    const limit = Number(argValue('limit'));
    const batches = Number(argValue('batches'));
    const saved = await runRouteDaysJob(base, secret, env, {
      batchLimit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined,
      maxBatches: Number.isFinite(batches) && batches > 0 ? Math.floor(batches) : undefined,
    });
    log(provider, `done (${saved} routes saved)`);
    return;
  }
  if (!source) {
    console.error(`[travel] unknown provider '${provider}' (expected ${Object.keys(SOURCES).join('|')}|route-days)`);
    process.exit(1);
  }

  const state = join(ROOT, 'admin', 'vps', 'logs', `travel-${provider}.state`);
  const cp = loadCp(state);
  const store = checkpointGeoStore(cp);
  const force = process.argv.includes('--force');
  const coveredDays = force ? new Set<string>() : new Set(Object.keys(cp.scopes ?? {}));
  const runType = backfill ? 'backfill' : 'replenish';
  log(provider, `start ${runType}${force ? ' --force' : ''} (${coveredDays.size} covered days)`);

  const manifest = await runTravelProvider(source, { runType, store, coveredDays });
  log(provider, `fetched ${manifest.events.length} events over ${manifest.days.length} days`);

  if (manifest.events.length > 0) {
    const res = await fetch(`${base}/admin/travel/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(manifest),
    });
    if (!res.ok) throw new Error(`ingest ${res.status}: ${(await res.text()).slice(0, 300)}`);
    log(provider, `ingested ${manifest.events.length} events`);
  }

  cp.target = runType;
  cp.completed = true;
  cp.completedAt = Date.now();
  cp.scopes = { ...(cp.scopes ?? {}), ...Object.fromEntries(manifest.days.map((d) => [d, 'done'])) };
  mkdirSync(dirname(state), { recursive: true });
  saveCp(state, cp);
  log(provider, `done (${Object.keys(cp.scopes ?? {}).length} total days covered)`);
}

main().catch((e) => {
  console.error(`[travel] FAILED: ${(e as Error).message}`);
  process.exit(1);
});