#!/usr/bin/env -S npx tsx
// VPS seed consumer (v2). A long-lived process that DRAINS the durable work-list
// (`seed_units`) for the vps executor:
//   claim → fetch (residential proxy) → POST raw batches → complete (with token)
// No cron, no window, no checkpoint: the unit row in D1 is the state. When the
// list is empty it backs off (10s → 30s) and keeps polling. Resource-gated so the
// 256 MB box is never starved.
//
// Env (admin/vps/.env + launcher): BASE_URL, SEED_VPS_TOKEN, WEBSHARE_URL (proxy,
// set by the launcher as HTTPS_PROXY + NODE_USE_ENV_PROXY=1).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { installNetStats, setNetSource, netSnapshot } from '../../../seed/core/netStats';
import { SEED_REFILL_AHEAD, D1_BATCH_STATEMENT_CAP } from '../../../seed/core/constants';
import { addDaysWarsaw, warsawMidnightMs, eventDayEndMs } from '../../../seed/core/dates';
import { ProviderId } from '../../../seed/core/types';
import type { SeedCandidate } from '../../../seed/core/types';
import { findRepoDir, resourcesOk, resetResourceCheck, logLoad } from './runtime';
import type { ScopeCtx, ScopeSource } from './runtime';
import { lumaSource } from './runners/luma';
import { meetupSource } from './runners/meetup';
import { multikinoSource } from './runners/multikino';
import { cinemacitySource } from './runners/cinemacity';
import { goingSource } from './runners/going';
import { heliosSource } from './runners/helios';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = findRepoDir(__dirname);
const ENV_FILE = join(REPO_DIR, 'admin', 'vps', '.env');

const IDLE_FAST_MS = 10_000;
const IDLE_SLOW_MS = 30_000;
const IDLE_SLOW_AFTER_MS = 5 * 60_000;
const RAW_BATCH = D1_BATCH_STATEMENT_CAP;

const SOURCES: Partial<Record<ProviderId, ScopeSource>> = {
  [goingSource.source]: goingSource,
  [heliosSource.source]: heliosSource,
  [lumaSource.source]: lumaSource,
  [meetupSource.source]: meetupSource,
  [multikinoSource.source]: multikinoSource,
  [cinemacitySource.source]: cinemacitySource,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return out;
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

interface Unit {
  id: string;
  day: string;
  batch_id: string;
  provider: string;
  slice: string;
  kind: 'day' | 'window';
  generation: number;
  attempts: number;
  token: string;
}

class Api {
  constructor(private base: string, private token: string) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  async claim(): Promise<Unit | null> {
    const res = await fetch(`${this.base}/admin/seed/units/claim`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ executor: 'vps' }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`claim -> ${res.status}`);
    const data = (await res.json()) as { unit: Unit | null };
    return data.unit;
  }

  async raw(unit: Unit, candidates: SeedCandidate[]): Promise<number> {
    let rows = 0;
    for (let i = 0; i < candidates.length; i += RAW_BATCH) {
      const res = await fetch(`${this.base}/admin/seed/units/${unit.id}/raw`, {
        method: 'POST', headers: this.headers(),
        body: JSON.stringify({ token: unit.token, candidates: candidates.slice(i, i + RAW_BATCH) }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`raw -> ${res.status}`);
      rows += ((await res.json()) as { rowsWritten: number }).rowsWritten;
    }
    return rows;
  }

  async complete(unit: Unit, rowsWritten: number): Promise<void> {
    const res = await fetch(`${this.base}/admin/seed/units/complete`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({ unitId: unit.id, token: unit.token, rowsWritten }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`complete -> ${res.status}`);
  }

  async fail(unit: Unit, error: string): Promise<void> {
    await fetch(`${this.base}/admin/seed/units/complete`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({ unitId: unit.id, token: unit.token, error }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {});
  }
}

function windowDays(anchor: string): string[] {
  return Array.from({ length: SEED_REFILL_AHEAD + 1 }, (_, i) => addDaysWarsaw(anchor, i));
}

function ctxFor(unit: Unit): ScopeCtx {
  const days = unit.kind === 'window' ? windowDays(unit.day) : [unit.day];
  return {
    days,
    windowStart: warsawMidnightMs(days[0]),
    windowEnd: eventDayEndMs(days[days.length - 1]),
    cp: { target: days[0], completed: false, completedAt: 0, scopes: {} },
  };
}

async function run(api: Api, unit: Unit): Promise<void> {
  const source = SOURCES[unit.provider as ProviderId];
  if (!source) throw new Error(`no VPS source for ${unit.provider}`);
  setNetSource(unit.provider);
  const candidates = await source.fetchScope(unit.slice, ctxFor(unit));
  const rows = await api.raw(unit, candidates);
  await api.complete(unit, rows);
  logLoad('unit:done', `${unit.provider}/${unit.slice} ${unit.kind} rows=${rows}`);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const base = env.BASE_URL || process.env.BASE_URL || 'https://api.panperyskop.app';
  const token = env.SEED_VPS_TOKEN || process.env.SEED_VPS_TOKEN || '';
  if (!token) {
    console.error('SEED_VPS_TOKEN missing (admin/vps/.env) — nothing to do');
    process.exit(1);
  }
  installNetStats();
  const api = new Api(base, token);
  console.log(`seed consumer up (base=${base})`);

  let idleSince = Date.now();
  for (;;) {
    resetResourceCheck();
    if (!resourcesOk('consumer')) {
      await sleep(IDLE_FAST_MS);
      continue;
    }
    let unit: Unit | null = null;
    try {
      unit = await api.claim();
    } catch (e) {
      console.error(`claim failed: ${(e as Error).message}`);
      await sleep(IDLE_SLOW_MS);
      continue;
    }
    if (!unit) {
      const idleFor = Date.now() - idleSince;
      await sleep(idleFor < IDLE_SLOW_AFTER_MS ? IDLE_FAST_MS : IDLE_SLOW_MS);
      continue;
    }
    idleSince = Date.now();
    try {
      await run(api, unit);
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`unit ${unit.provider}/${unit.slice} failed: ${msg}`);
      await api.fail(unit, msg);
    }
  }

  // Unreachable; netSnapshot() is used by the launcher for the transfer report.
  void netSnapshot;
}

process.on('uncaughtException', (e) => { console.error(`uncaughtException: ${e instanceof Error ? e.message : String(e)}`); });
process.on('unhandledRejection', (e) => { console.error(`unhandledRejection: ${e instanceof Error ? e.message : String(e)}`); });

main().catch((e) => { console.error(e); process.exit(1); });
