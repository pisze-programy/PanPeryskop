#!/usr/bin/env node
// ESPN travel fetcher (VPS, residential egress — ESPN blocks datacenter IPs).
// Runs on a weekly cron: fetches the next 7 days, geocodes survivors (Nominatim
// 1/s through the rotating proxy) and POSTs the manifest to /admin/travel/ingest.
// `--backfill` (one-off) fetches 90 days instead. Checkpoint (geo cache + covered
// days) persists in admin/vps/logs/travel-espn.state so a gap closes on the next
// run instead of re-fetching.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTravelProvider } from '../../../../src/travel/run';
import { checkpointGeoStore, loadCp, saveCp } from './runtime';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const STATE = join(ROOT, 'admin', 'vps', 'logs', 'travel-espn.state');

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

function log(msg: string): void {
  console.log(`[travel-espn] ${new Date().toISOString()} ${msg}`);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const base = env.BASE_URL || 'https://api.panperyskop.app';
  const secret = env.ADMIN_SECRET;
  const backfill = process.argv.includes('--backfill');
  if (!secret) {
    log('ADMIN_SECRET missing — abort');
    process.exit(1);
  }

  const cp = loadCp(STATE);
  const store = checkpointGeoStore(cp);
  const coveredDays = new Set(Object.keys(cp.scopes ?? {}));
  const runType = backfill ? 'backfill' : 'replenish';
  log(`start ${runType} (${coveredDays.size} covered days)`);

  const manifest = await runTravelProvider({ runType, store, coveredDays });
  log(`fetched ${manifest.events.length} events over ${manifest.days.length} days`);

  if (manifest.events.length > 0) {
    const res = await fetch(`${base}/admin/travel/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(manifest),
    });
    if (!res.ok) throw new Error(`ingest ${res.status}: ${(await res.text()).slice(0, 300)}`);
    log(`ingested ${manifest.events.length} events`);
  }

  cp.target = runType;
  cp.completed = true;
  cp.completedAt = Date.now();
  cp.scopes = { ...(cp.scopes ?? {}), ...Object.fromEntries(manifest.days.map((d) => [d, 'done'])) };
  mkdirSync(dirname(STATE), { recursive: true });
  saveCp(STATE, cp);
  log(`done (${Object.keys(cp.scopes ?? {}).length} total days covered)`);
}

main().catch((e) => {
  console.error(`[travel-espn] FAILED: ${(e as Error).message}`);
  process.exit(1);
});