#!/usr/bin/env node
// Standalone nightly kupbilecik warm — BUILT SEPARATELY as backend/dist/kup-warm.mjs
// so the heavy orchestrator bundle (vps-seed.mjs) stays lean and this process's
// footprint on the 256 MB box is tiny (~20 MB baseline, 128 MB heap cap).
//
// Why a standalone process: kupbilecik blocks Cloudflare Workers egress (403) and
// the token budget is ~10 req/day, so the warm must run once a day from an IP
// kupbilecik accepts, streaming the ~60 MB catalog through scanKupEvents (never
// materializing it) and pushing per-day manifests to R2 via the Worker admin
// endpoint. Runs 00:01 Warsaw (root crontab, see setup-vps.sh), BEFORE the seed
// cron, with a clean env (no residential proxy — an 8 MB gzip does not pay for it).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchKupCatalog, scanKupEvents } from '../../../../src/seed/providers/kupbilecik';
import { SEED_DAYS_AHEAD } from '../../../../src/seed/core/constants';
import { todayWarsaw, addDaysWarsaw } from '../../../../src/seed/core/dates';

// Repo root — works from BOTH the TS source (deep in backend/src/...) and the
// pre-built bundle (backend/dist/kup-warm.mjs), where __dirname depth differs.
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
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(findRepoDir(__dirname), 'admin', 'vps', '.env');

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

const log = (msg: string): void => console.log(`[${new Date().toISOString()}] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const env = loadEnv();
  const token = env.KUPBILECIK_API_TOKEN;
  const secret = env.ADMIN_SECRET;
  const base = env.BASE_URL || 'https://api.panperyskop.app';
  if (!token || !secret) {
    log('KUPBILECIK_API_TOKEN / ADMIN_SECRET missing — abort');
    process.exitCode = 1;
    return;
  }
  // The origin intermittently 404s (and occasionally returns a corrupt 200) once
  // the ~10/day token budget is being exceeded or a burst trips it. Retry the
  // whole fetch+scan a few times — bounded so a day never burns >3 requests.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { byDay, total } = await scanKupEvents(await fetchKupCatalog(token));
      const today = todayWarsaw();
      let pushed = 0;
      for (let i = 0; i <= SEED_DAYS_AHEAD; i++) {
        const day = addDaysWarsaw(today, i);
        const list = byDay.get(day) || [];
        const res = await fetch(`${base}/admin/seed/kupbilecik/day`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify({ day, events: list }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`push ${day} -> ${res.status}`);
        log(`${day} ${list.length} events`);
        pushed++;
      }
      log(`done: ${pushed}/${SEED_DAYS_AHEAD + 1} days pushed, ${total} catalog events`);
      return;
    } catch (e) {
      log(`attempt ${attempt}/3 failed: ${(e as Error).message}`);
      if (attempt === 3) {
        log('FAILED after 3 attempts');
        process.exitCode = 1;
        return;
      }
      await sleep(5_000);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});