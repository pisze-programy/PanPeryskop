#!/usr/bin/env -S npx tsx
// VPS executor ("sposób wykonania" = vps) — the orchestrator that drives every
// provider assigned to the VPS executor in the registry. The VPS box provides
// only two things: residential egress (Tailscale exit node + IPv4-forcing proxy)
// and a callback (seed-ingest upload). All provider logic lives in src and is
// shared with every executor.
//
// For each enabled VPS provider:
//   1. target   — the new far edge today+SEED_DAYS_AHEAD (mirrors the Worker cron;
//                 the browse window is covered by rolling; --full backfills once).
//   2. complete — skip when the checkpoint already has target + completed.
//   3. exit     — select+validate an exit node (iPhone primary, Mac fallback) by
//                 probing multikino auth through the IPv4-forcing proxy.
//   4. run      — spawn the per-provider runner (executors/vps/runners/<id>.ts)
//                 through the proxy; re-select the exit node + backoff on
//                 incomplete runs (VPS_MAX_ATTEMPTS).
//   5. upload   — seed-ingest the provider's staged output (--approve).
//
// Cron fires it as a KICKER every ~30 min inside the window (06-20 PL); the
// checkpoint state machine makes extra kicks no-ops.
//
// Usage (root): npx tsx src/seed/executors/vps/index.ts
//   --dry                 print the plan, do nothing
//   --provider luma       single provider
//   FORCE=1 ...           bypass the window guard
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { enabledForExecutor, configOf } from '../../../../src/seed/providers/registry';
import { EXECUTOR } from '../types';
import type { ProviderConfig, VpsSpec } from '../../../../src/seed/providers/registry';
import { todayWarsaw, addDaysWarsaw } from '../../../../src/seed/core/dates';
import {
  SEED_DAYS_AHEAD,
  VPS_IPV4_PROXY_HOST, VPS_IPV4_PROXY_PORT, VPS_WINDOW_START_HOUR, VPS_WINDOW_END_HOUR,
  VPS_EXIT_IPHONE, VPS_EXIT_MAC, VPS_MAX_ATTEMPTS, VPS_BACKOFF_MS,
  VPS_EXIT_PROBE_TIMEOUT_MS, VPS_EXIT_SWITCH_WAIT_MS,
} from '../../../../src/seed/core/constants';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, '..', '..', '..', '..', '..');
const BACKEND_DIR = join(REPO_DIR, 'backend');
const SEED_DIR = join(REPO_DIR, 'admin', 'seed');
const VPS_DIR = join(REPO_DIR, 'admin', 'vps');
const VPS_LOGS_DIR = join(VPS_DIR, 'logs');
const RUNNERS_DIR = join(__dirname, 'runners');
const ENV_FILE = join(VPS_DIR, '.env');
const LOG = join(VPS_LOGS_DIR, 'orchestrator.log');
const STATUS = join(VPS_LOGS_DIR, 'status.json');
const PROXY_URL = `http://${VPS_IPV4_PROXY_HOST}:${VPS_IPV4_PROXY_PORT}`;

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
    cwd: BACKEND_DIR,
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
function runnerArgs(spec: VpsSpec): string[] {
  const args = ['--checkpoint', checkpointPath(spec)];
  if (FULL) args.push('--full');
  return args;
}
function runRunner(cfg: ProviderConfig, target: string, env: Record<string, string>): void {
  const spec = cfg.executors.vps!;
  const runner = join(RUNNERS_DIR, `${cfg.id}.ts`);
  const args = runnerArgs(spec);
  log(`run ${cfg.id}: npx tsx ${runner} ${args.join(' ')}`);
  const r = runSync('npx', ['--yes', 'tsx', runner, ...args], {
    cwd: BACKEND_DIR,
    env: { ...env, HTTPS_PROXY: PROXY_URL, NODE_USE_ENV_PROXY: '1' },
  });
  if (r.output.trim()) log(`${cfg.id} output: ${r.output.trim().slice(0, 2000)}`);
}
function upload(cfg: ProviderConfig, env: Record<string, string>): void {
  const spec = cfg.executors.vps!;
  const out = join(SEED_DIR, spec.output);
  if (!existsSync(out)) {
    log(`${cfg.id}: no output ${out} — nothing to upload`);
    return;
  }
  log(`upload ${cfg.id}: ${out}`);
  const r = runSync('node', [join(REPO_DIR, 'admin', 'src', 'seed-ingest.mjs'), out, '--approve'], {
    cwd: REPO_DIR,
    env,
  });
  if (r.output.trim()) log(`${cfg.id} upload: ${r.output.trim().slice(0, 2000)}`);
}

// ---------- main ----------
async function main(): Promise<void> {
  mkdirSync(VPS_LOGS_DIR, { recursive: true });
  if (!inWindow()) {
    log('kick outside window — skip');
    return;
  }

  const plan = enabledForExecutor(EXECUTOR.VPS).filter((c) => !onlyProvider || c.id === onlyProvider);
  if (!plan.length) {
    log(`no enabled VPS providers${onlyProvider ? ` for --provider ${onlyProvider}` : ''} — skip`);
    return;
  }

  if (DRY) {
    const dry = plan.map((c) => {
      const spec = c.executors.vps!;
      const target = expectedTarget();
      return {
        id: c.id,
        runner: `${c.id}.ts`,
        args: runnerArgs(spec),
        target,
        out: spec.output,
        cp: spec.checkpoint,
        complete: isComplete(spec, target),
      };
    });
    console.log(JSON.stringify(dry, null, 2));
    return;
  }

  const env = loadEnv();
  await ensureProxy();

  for (const cfg of plan) {
    const spec = cfg.executors.vps!;
    const target = expectedTarget();
    if (isComplete(spec, target)) {
      log(`${cfg.id}: target ${target} already complete — skip`);
      status('complete', `${cfg.id} ${target}`);
      continue;
    }

    const exitNode = await selectExitNode();
    if (exitNode === 'none') {
      log(`no usable exit node for ${cfg.id} — retry next kick`);
      status('exit-none', cfg.id);
      continue;
    }
    log(`exit node = ${exitNode} (provider=${cfg.id})`);

    let done = false;
    for (let attempt = 1; attempt <= VPS_MAX_ATTEMPTS; attempt++) {
      runRunner(cfg, target, env);
      if (isComplete(spec, target)) {
        done = true;
        break;
      }
      log(`${cfg.id}: incomplete after attempt ${attempt} — re-select exit node`);
      const retryExit = await selectExitNode();
      if (retryExit === 'none') {
        log(`${cfg.id}: no exit node after failure — retry next kick`);
        break;
      }
      if (attempt < VPS_MAX_ATTEMPTS) await sleep(VPS_BACKOFF_MS[attempt] ?? 0);
    }

    if (done) {
      upload(cfg, env);
      status('ok', `${cfg.id} ${target}`);
    } else {
      status('failed', cfg.id);
    }
  }
  log('orchestrator pass done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
