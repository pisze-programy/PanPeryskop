#!/usr/bin/env -S npx tsx
// VPS executor ("sposób wykonania" = vps) — the orchestrator that drives every
// provider assigned to the VPS executor in the registry. The VPS box provides
// only two things: residential egress (Tailscale exit node + IPv4-forcing proxy)
// and a callback (seed-ingest upload). All provider logic lives in src and is
// shared with every executor.
//
// Design constraints (256 MB shared VPS):
//   - ONE node process (the pre-built bundle). Providers run IN-PROCESS via
//     runScopeSource — no `npx tsx` subprocesses, no esbuild in the runtime.
//   - single-instance lock — a 30-min cron overlapping a slow pass must never
//     run two orchestrators (that caused OOM kills).
//   - resource gate — runScopeSource pauses (checkpoint saved) when
//     MemAvailable/load are tight, so other processes on the box are never
//     starved; the next kick resumes.
//
// For each enabled VPS provider:
//   1. target   — the new far edge today+SEED_DAYS_AHEAD (mirrors the Worker cron;
//                 the browse window is covered by rolling; --full backfills once).
//   2. complete — skip when the checkpoint already has target + completed.
//   3. exit     — select+validate an exit node (iPhone primary, Mac fallback) by
//                 probing multikino auth through the IPv4-forcing proxy.
//   4. run      — runScopeSource(source) in-process (chunked, resource-gated).
//   5. upload   — seed-ingest the provider's staged output (--approve).
//
// Cron fires it as a KICKER every ~30 min inside the window (05-22 PL); the
// checkpoint state machine makes extra kicks no-ops.
//
// Usage (root): node dist/vps-seed.mjs
//   --dry                 print the plan, do nothing
//   --provider luma       single provider
//   --full                backfill the whole window (first run)
//   FORCE=1 ...           bypass the window guard
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { enabledForExecutor } from '../../../../src/seed/providers/registry';
import { EXECUTOR } from '../types';
import type { ProviderConfig, VpsSpec } from '../../../../src/seed/providers/registry';
import { runScopeSource, findRepoDir, loadCp, saveCp, logLoad, gcNow, resourcesOk, resetResourceCheck } from './runtime';
import type { ScopeSource } from './runtime';
import { lumaSource } from './runners/luma';
import { meetupSource } from './runners/meetup';
import { multikinoSource } from './runners/multikino';
import { cinemacitySource } from './runners/cinemacity';
import { goingSource } from './runners/going';
import { heliosSource } from './runners/helios';
import { todayWarsaw, addDaysWarsaw } from '../../../../src/seed/core/dates';
import {
  SEED_DAYS_AHEAD,
  VPS_IPV4_PROXY_HOST, VPS_IPV4_PROXY_PORT, VPS_WINDOW_START_HOUR, VPS_WINDOW_END_HOUR,
  VPS_EXIT_IPHONE, VPS_EXIT_MAC, VPS_EXIT_PROBE_TIMEOUT_MS, VPS_EXIT_SWITCH_WAIT_MS,
} from '../../../../src/seed/core/constants';
import type { ProviderId } from '../../../../src/seed/core/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = findRepoDir(__dirname);
const SEED_DIR = join(REPO_DIR, 'admin', 'seed');
const VPS_DIR = join(REPO_DIR, 'admin', 'vps');
const VPS_LOGS_DIR = join(VPS_DIR, 'logs');
const ENV_FILE = join(VPS_DIR, '.env');
const LOG = join(VPS_LOGS_DIR, 'orchestrator.log');
const STATUS = join(VPS_LOGS_DIR, 'status.json');
const LOCK = join(VPS_LOGS_DIR, 'orchestrator.lock');
const PROXY_URL = `http://${VPS_IPV4_PROXY_HOST}:${VPS_IPV4_PROXY_PORT}`;

// Light providers first, heaviest LAST: an OOM mid-cinemacity must never take
// luma/meetup/multikino down with it (they already ran + uploaded).
const VPS_RUN_ORDER: Record<string, number> = {
  going: 0, luma: 1, meetup: 2, helios: 3, multikino: 4, cinemacity: 5,
};

// Log process state before dying — uncaught errors give us the last known good
// scope/phase (the OS OOM-killer can't, but anything catchable can).
process.on('uncaughtException', (e) => {
  logLoad('uncaughtException', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  logLoad('unhandledRejection', e instanceof Error ? e.message : String(e));
  process.exit(1);
});

const SOURCES: Partial<Record<ProviderId, ScopeSource>> = {
  [goingSource.source]: goingSource,
  [heliosSource.source]: heliosSource,
  [lumaSource.source]: lumaSource,
  [meetupSource.source]: meetupSource,
  [multikinoSource.source]: multikinoSource,
  [cinemacitySource.source]: cinemacitySource,
};

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const FORCE = process.env.FORCE === '1';
const FULL = argv.includes('--full');
const onlyProvider = (() => {
  const i = argv.indexOf('--provider');
  return i >= 0 ? argv[i + 1] : undefined;
})();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  mkdirSync(VPS_LOGS_DIR, { recursive: true });
  try {
    writeFileSync(LOG, line + '\n', { flag: 'a' });
  } catch (e) {
    console.error(`log write failed: ${(e as Error).message}`);
  }
}
function status(state: string, detail: string): void {
  try {
    writeFileSync(STATUS, JSON.stringify({ ts: new Date().toISOString(), state, detail }) + '\n');
  } catch (e) {
    console.error(`status write failed: ${(e as Error).message}`);
  }
}

interface RunResult { status: number; output: string }
function runSync(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): RunResult {
  const r = spawnSync(cmd, args, {
    cwd: opts?.cwd,
    env: { ...process.env, ...opts?.env },
    encoding: 'utf8',
    timeout: 3_600_000,
  });
  return { status: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// ---------- env (.env: BASE_URL, ADMIN_SECRET) ----------
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return out;
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

// ---------- window guard (05-22 PL; cron fires every 30 min all day, outside the
// window a kick is a no-op — the seed retries within the window until it lands) ----------
function inWindow(): boolean {
  if (FORCE) return true;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: 'numeric', hour12: false }).format(new Date()));
  return hour >= VPS_WINDOW_START_HOUR && hour < VPS_WINDOW_END_HOUR;
}

// ---------- IPv4-forcing proxy ----------
// Prefer the openrc service (supervise-daemon restarts it on crash/reboot); only
// fall back to a raw detached spawn when there is no service. Never start a
// duplicate — an extra instance crashes with EADDRINUSE and kills the working one.
function proxyListening(): boolean {
  return runSync('nc', ['-z', VPS_IPV4_PROXY_HOST, String(VPS_IPV4_PROXY_PORT)]).status === 0;
}
async function ensureProxy(): Promise<void> {
  if (proxyListening()) return;
  const svc = runSync('rc-service', ['panperyskop-proxy', 'restart']);
  if (svc.status !== 0) {
    log('starting ipv4-proxy (fallback spawn)');
    const child = spawn('node', [join(VPS_DIR, 'ipv4-proxy.mjs')], {
      cwd: VPS_DIR,
      env: process.env,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }
  await sleep(VPS_EXIT_SWITCH_WAIT_MS);
}

// ---------- exit node (port of the old select-exit-node.sh) ----------
async function probeExitNode(host: string): Promise<boolean> {
  const set = runSync('tailscale', ['set', `--exit-node=${host}`, '--exit-node-allow-lan-access']);
  if (set.status !== 0) {
    log(`exit-node set ${host} failed: ${set.output.trim()}`);
    return false;
  }
  await sleep(VPS_EXIT_SWITCH_WAIT_MS);
  const probe = `fetch("https://www.multikino.pl/api/microservice/auth/token",{method:"POST",headers:{Accept:"application/json"},signal:AbortSignal.timeout(${VPS_EXIT_PROBE_TIMEOUT_MS})}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1));`;
  const result = runSync('node', ['-e', probe], {
    cwd: REPO_DIR,
    env: { HTTPS_PROXY: PROXY_URL, NODE_USE_ENV_PROXY: '1' },
  });
  if (result.status !== 0) log(`exit-node ${host} probe failed: ${result.output.trim()}`);
  return result.status === 0;
}
async function selectExitNode(): Promise<string> {
  if (await probeExitNode(VPS_EXIT_IPHONE)) return 'iphone';
  if (await probeExitNode(VPS_EXIT_MAC)) return 'macos';
  return 'none';
}

// ---------- provider plan ----------
// Mirror of the Worker cron: daily the target is the NEW FAR EDGE
// (today+SEED_DAYS_AHEAD). --full backfills the whole window once.
function expectedTarget(): string {
  return addDaysWarsaw(todayWarsaw(), SEED_DAYS_AHEAD);
}
function checkpointPath(spec: VpsSpec): string {
  return join(VPS_LOGS_DIR, spec.checkpoint);
}
function isComplete(spec: VpsSpec, target: string): boolean {
  if (!existsSync(checkpointPath(spec))) return false;
  try {
    const cp = JSON.parse(readFileSync(checkpointPath(spec), 'utf8')) as { target?: string; completed?: boolean };
    return cp.target === target && cp.completed === true;
  } catch (e) {
    console.error(`checkpoint ${spec.checkpoint} unreadable: ${(e as Error).message}`);
    return false;
  }
}

// Single-instance lock — the cron fires every 5 min, but a slow pass (flaky
// exit node) must never overlap a new kick. Two orchestrators on this 256 MB box
// is what caused OOM kills. Lock is fail-open: if we can't manage it, proceed.
function acquireLock(): boolean {
  try {
    if (existsSync(LOCK)) {
      const pid = parseInt(readFileSync(LOCK, 'utf8').trim(), 10);
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          return false; // another instance is alive
        } catch { /* stale pid — take over */ }
      }
    }
    writeFileSync(LOCK, String(process.pid));
    return true;
  } catch (e) {
    console.error(`lock failed (${(e as Error).message}) — proceeding`);
    return true;
  }
}
function releaseLock(): void {
  try { rmSync(LOCK, { force: true }); } catch { /* noop */ }
}

function sourceFor(id: ProviderId): ScopeSource {
  const source = SOURCES[id];
  if (!source) throw new Error(`no VPS source for provider ${id}`);
  return source;
}

function upload(cfg: ProviderConfig, env: Record<string, string>): void {
  const spec = cfg.executors.vps!;
  const out = join(SEED_DIR, spec.output);
  if (!existsSync(out)) {
    log(`${cfg.id}: no output ${out} — nothing to upload`);
    return;
  }
  log(`upload ${cfg.id}: ${out}`);
  logLoad('upload:start', cfg.id);
  // Own heap cap — seed-ingest runs in PARALLEL with the orchestrator, so both
  // processes must fit the 256 MB box together.
  const r = runSync('node', ['--max-old-space-size=64', join(REPO_DIR, 'admin', 'src', 'seed-ingest.mjs'), out, '--approve'], {
    cwd: REPO_DIR,
    env,
  });
  logLoad('upload:end', `${cfg.id} exit=${r.status}`);
  if (r.output.trim()) log(`${cfg.id} upload: ${r.output.trim().slice(0, 2000)}`);
  if (r.status !== 0) throw new Error(`seed-ingest ${cfg.id} exit ${r.status}`);
}

// Mark the provider complete ONLY after a successful upload — a failed upload
// must be retried on the next kick, not skipped forever.
function markComplete(spec: VpsSpec, target: string): void {
  const cp = loadCp(checkpointPath(spec));
  cp.target = target;
  cp.completed = true;
  cp.completedAt = Date.now();
  saveCp(checkpointPath(spec), cp);
}

// Self-healing: if a NON-far-edge window day has no approved posts for this
// provider (a missed day during rolling), return that day so the orchestrator
// backfills the window. Bounded to once per calendar day via lastBackfillDay.
async function coverageGapDay(source: string, env: Record<string, string>): Promise<string | null> {
  try {
    const base = env.BASE_URL || 'https://api.panperyskop.app';
    const res = await fetch(`${base}/admin/seed/coverage`, {
      headers: { Authorization: `Bearer ${env.ADMIN_SECRET}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { window?: string[]; counts?: Record<string, Record<string, number>> };
    const win = data.window || [];
    const counts = data.counts?.[source] || {};
    const today = todayWarsaw();
    // The far edge is fetched daily by rolling — only worry about today..+SEED_DAYS_AHEAD-1.
    const nonFarEdge = win.filter((d) => d < addDaysWarsaw(today, SEED_DAYS_AHEAD));
    return nonFarEdge.find((d) => (counts[d] || 0) === 0) ?? null;
  } catch (e) {
    log(`coverage check ${source} failed (${(e as Error).message}) — assuming ok`);
    return null;
  }
}

// ---------- main ----------
async function main(): Promise<void> {
  const t0 = Date.now();
  mkdirSync(VPS_LOGS_DIR, { recursive: true });
  if (!inWindow()) {
    log('kick outside window — skip');
    return;
  }
  // Never overlap a running pass — the cron fires every 5 min but a slow run must
  // finish undisturbed (two orchestrators on this box = OOM).
  if (!acquireLock()) {
    log('another orchestrator instance running — skip');
    return;
  }
  logLoad('pass:start');

  const plan = enabledForExecutor(EXECUTOR.VPS).filter((c) => !onlyProvider || c.id === onlyProvider);
  if (!plan.length) {
    log(`no enabled VPS providers${onlyProvider ? ` for --provider ${onlyProvider}` : ''} — skip`);
    releaseLock();
    return;
  }
  // Deterministic run order: lightest first, heaviest (cinemacity) last.
  plan.sort((a, b) => (VPS_RUN_ORDER[a.id] ?? 99) - (VPS_RUN_ORDER[b.id] ?? 99));
  log(`plan order: ${plan.map((p) => p.id).join(', ')}`);

  if (DRY) {
    const dry = plan.map((c) => {
      const spec = c.executors.vps!;
      const target = expectedTarget();
      return {
        id: c.id,
        runner: 'in-process (bundled)',
        full: FULL,
        target,
        out: spec.output,
        cp: spec.checkpoint,
        complete: isComplete(spec, target),
      };
    });
    console.log(JSON.stringify(dry, null, 2));
    releaseLock();
    return;
  }

  const env = loadEnv();
  // In-process providers read env vars (ALGOLIA_APP_ID/API_KEY/CLOUDINARY_SIG
  // for going) from process.env — make .env visible to the bundle, not just to
  // the spawned seed-ingest uploads.
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  await ensureProxy();

  // Route every in-process fetch (providers + media) through the IPv4-forcing
  // proxy → exit node. Without this the bundles egress straight from the VPS's
  // datacenter IP, which Cloudflare-fronted origins (multikino) 403.
  process.env.HTTPS_PROXY = PROXY_URL;
  process.env.NODE_USE_ENV_PROXY = '1';

  for (const cfg of plan) {
    const spec = cfg.executors.vps!;
    const target = expectedTarget();
    // Self-heal window gaps: a missed day during rolling (exit node down / error)
    // leaves a permanent gap unless backfilled. When the last pass completed but
    // a non-far-edge day is still empty for this provider, backfill the window.
    let gapDay: string | null = null;
    if (!FULL && !onlyProvider && isComplete(spec, target)) {
      gapDay = await coverageGapDay(String(cfg.id), env);
      if (gapDay) log(`${cfg.id}: window gap on ${gapDay} — backfill`);
    }
    // --full forces a re-fetch of the whole window (runScopeSource resets the
    // checkpoint), so a complete far-edge must NOT be skipped.
    if (!FULL && !gapDay && isComplete(spec, target)) {
      log(`${cfg.id}: target ${target} already complete — skip`);
      status('complete', `${cfg.id} ${target}`);
      continue;
    }

    // Egress via the HTTPS proxy (Webshare residential) replaces the tailscale
    // exit node — set VPS_NO_EXIT_NODE=1 in the orchestrator when WEBSHARE_URL is
    // configured. Otherwise select+validate a tailscale exit node (phone/Mac).
    const proxyEgress = process.env.VPS_NO_EXIT_NODE === '1';
    const exitNode = proxyEgress ? 'proxy' : await selectExitNode();
    if (!proxyEgress && exitNode === 'none') {
      log(`no usable exit node for ${cfg.id} — retry next kick`);
      status('exit-none', cfg.id);
      continue;
    }
    log(`exit node = ${exitNode} (provider=${cfg.id})`);

    // Backfill the whole window when a gap exists — bounded to once per day, and
    // the bound is only committed AFTER a successful backfill (a paused/failed
    // pass must be retried on the next kick, not consumed).
    let doFull = false;
    if (gapDay) {
      const cp = loadCp(checkpointPath(spec));
      if (cp.lastBackfillDay !== todayWarsaw()) {
        doFull = true;
      } else {
        log(`${cfg.id}: already backfilled today — skip`);
        status('complete', `${cfg.id} ${target}`);
        continue;
      }
    }

    // In-process, chunked and resource-gated: runScopeSource pauses (checkpoint
    // saved) when the box is busy; the next 5-min kick resumes. No subprocess.
    logLoad('provider:start', cfg.id);
    const completed = await runScopeSource(sourceFor(cfg.id), { full: doFull });
    logLoad('provider:end', cfg.id);
    gcNow(`after-provider:${cfg.id}`);
    // When the box is still tight after a provider, stop the pass — the remaining
    // providers resume on the next kick instead of stacking heap on top of heap.
    resetResourceCheck();
    if (!resourcesOk(`between-providers:${cfg.id}`)) {
      log(`resources tight after ${cfg.id} — stop pass, resume next kick`);
      status('paused', `${cfg.id} (resources)`);
      break;
    }
    if (completed) {
      try {
        upload(cfg, env);
        markComplete(spec, target); // complete ONLY after a successful upload
        if (gapDay) {
          const cp = loadCp(checkpointPath(spec));
          cp.lastBackfillDay = todayWarsaw();
          saveCp(checkpointPath(spec), cp);
        }
        status('ok', `${cfg.id} ${target}`);
      } catch (e) {
        log(`${cfg.id}: upload failed — will retry next kick (${(e as Error).message})`);
        status('upload-failed', `${cfg.id} ${target}`);
      }
    } else {
      status('paused', cfg.id);
    }
  }
  log('orchestrator pass done');
  releaseLock();
  const dur = Math.round((Date.now() - t0) / 1000);
  const stats = runSync('sh', ['-c', "awk '/MemAvailable/{print \"MemAvail=\"int($2/1024)\"MB\"}' /proc/meminfo; cut -d' ' -f1 /proc/loadavg | xargs printf 'load1=%s'"], { cwd: REPO_DIR });
  logLoad('pass:end', `dur=${dur}s ${stats.output.trim().replace(/\n/g, ' ')}`);
  log(`pass done in ${dur}s ${stats.output.trim().replace(/\n/g, ' ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
