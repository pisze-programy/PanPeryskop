// Local dry-run harness — runs ONE VPS provider source in-process through the
// env proxy (Webshare) WITHOUT touching the VPS. New file; existing VPS scripts
// and the orchestrator are untouched.
//
// Usage (from the repo root, with proxy env exported BEFORE node starts):
//   HTTPS_PROXY=http://user:pass@p.webshare.io:80 NODE_USE_ENV_PROXY=1 \
//     npx tsx admin/vps/dry-run.ts <provider> [args...]
//
//   provider: multikino | cinemacity | luma | meetup
//   args:     passed to the shared runner, e.g. --range 2026-08-22..2026-08-25
//             --day 2026-08-25 --full --no-media --no-reject --limit 3
//
// Output: per-scope candidates + timing from runScopeSource.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScopeSource } from '../../backend/src/seed/executors/vps/runtime';
import type { ScopeSource } from '../../backend/src/seed/executors/vps/runtime';
import { multikinoSource } from '../../backend/src/seed/executors/vps/runners/multikino';
import { cinemacitySource } from '../../backend/src/seed/executors/vps/runners/cinemacity';
import { lumaSource } from '../../backend/src/seed/executors/vps/runners/luma';
import { meetupSource } from '../../backend/src/seed/executors/vps/runners/meetup';
import { goingSource } from '../../backend/src/seed/executors/vps/runners/going';
import { heliosSource } from '../../backend/src/seed/executors/vps/runners/helios';
import type { SeedProvider } from '../../backend/src/seed/core/types';
import { kupbilecikProvider } from '../../backend/src/seed/providers/kupbilecik';
import { warsawMidnightMs, addDaysWarsaw } from '../../backend/src/seed/core/dates';

const SOURCES: Record<string, ScopeSource> = {
  multikino: multikinoSource,
  cinemacity: cinemacitySource,
  luma: lumaSource,
  meetup: meetupSource,
  going: goingSource,
  helios: heliosSource,
};

// CF-executor providers (only kupbilecik now) — run their fetchCandidates
// directly with a minimal SeedContext + no-op D1 stub, so we can measure time
// and proxy bytes WITHOUT the Worker pipeline.
const CF_PROVIDERS: Record<string, SeedProvider> = {
  kupbilecik: kupbilecikProvider,
};

const stubDb = {
  prepare: () => ({ bind: () => ({ run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) }) }),
  batch: async () => [],
} as never;

// Read backend/.dev.vars (KEY=VALUE) into env.
function devVars(): Record<string, string> {
  const out: Record<string, string> = {};
  const p = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend', '.dev.vars');
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2];
    }
  } catch { /* no .dev.vars */ }
  return out;
}

const which = process.argv[2];
const rest = process.argv.slice(3);
const src = SOURCES[which];
const cf = CF_PROVIDERS[which];
if (!src && !cf) {
  console.error(`unknown provider "${which}" (use: ${Object.keys(SOURCES).join(', ')}, ${Object.keys(CF_PROVIDERS).join(', ')})`);
  process.exit(1);
}

// Mirror the orchestrator: make .dev.vars + Algolia app id visible to in-process
// providers (the going runner reads process.env.ALGOLIA_*).
{
  const dv = devVars();
  if (!process.env.ALGOLIA_APP_ID) process.env.ALGOLIA_APP_ID = 'FAFFKUSLK0';
  for (const [k, v] of Object.entries(dv)) if (process.env[k] === undefined) process.env[k] = v;
}

process.argv = [process.argv[0], 'dry-run', ...rest];

// Memory monitoring — samples process RSS/heap every 100ms so we can answer
// "does concurrency N fit the 256 MB box" with real peaks (not guesses).
let maxRss = 0;
let maxHeap = 0;
let maxExternal = 0;
const sampler = setInterval(() => {
  const u = process.memoryUsage();
  if (u.rss > maxRss) maxRss = u.rss;
  if (u.heapUsed > maxHeap) maxHeap = u.heapUsed;
  if (u.external > maxExternal) maxExternal = u.external;
}, 100);

const t0 = Date.now();
let completed: boolean | string = false;

if (src) {
  completed = await runScopeSource(src, {});
} else if (cf) {
  // CF providers run per-day over the window (mirrors the Worker cron).
  const value = (f: string): string | undefined => {
    const i = rest.indexOf(f);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const range = value('--range');
  const day = value('--day');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());
  const days: string[] = range
    ? (() => { const [s, e] = range.split('..'); const out: string[] = []; for (let d = s; d <= e; d = addDaysWarsaw(d, 1)) out.push(d); return out; })()
    : day ? [day] : [today];
  const env = { ...devVars(), ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID || 'FAFFKUSLK0', DB: stubDb } as never;
  let total = 0;
  for (const d of days) {
    const ctx = {
      env,
      day: d,
      dayStart: warsawMidnightMs(d),
      dayEnd: warsawMidnightMs(d) + 24 * 3600 * 1000,
      createdAt: Date.now(),
      recordBrowserMs: () => {},
    } as never;
    const start = Date.now();
    const cands = await (cf as SeedProvider).fetchCandidates(ctx);
    total += cands.length;
    console.log(`[cf:${which}] ${d} -> ${cands.length} candidates in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  }
  completed = true;
  console.log(`[cf:${which}] total ${total} candidates over ${days.length} days`);
}

clearInterval(sampler);
const fmt = (n: number) => `${(n / 1048576).toFixed(1)}MB`;
console.log(`[mem] peak rss=${fmt(maxRss)} heap=${fmt(maxHeap)} ext=${fmt(maxExternal)}`);
console.log(`[dry-run] ${which} completed=${completed} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
