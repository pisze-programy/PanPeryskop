// VPS executor runtime — shared machinery for the per-provider runners
// (executors/vps/runners/*). Providers stay pure; this is executor tooling:
//   - the unified checkpoint contract {target, completed, completedAt, …} the
//     orchestrator uses to decide skip/verify/upload,
//   - media download + events.json staging for seed-ingest,
//   - cross-provider dedupe/reject (a higher-priority source displaces existing
//     posts of lower-ranked sources),
//   - ONE run model, mirroring the Worker cron: daily each provider fetches ONLY
//     the new far edge (today+SEED_DAYS_AHEAD); the browse window
//     [today, today+SEED_DAYS_AHEAD] is covered by rolling. --full backfills the
//     whole window once. A "scope" is a fetch unit — a city (luma/meetup) or a
//     cinema (multikino/cinemacity) — and each scope returns candidates for the
//     fetched days; the runtime stages them under their own day.
//
// Output layout (output/mediaDir/checkpoint) comes from the provider registry —
// the single source of truth shared with the Worker and every executor.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { dedupe, buildDescription } from '../../../../src/seed/core/dedupe';
import { isCancelled } from '../../../../src/seed/core/filters';
import { todayWarsaw, addDaysWarsaw, warsawMidnightMs, warsawDateOf, eventDayEndMs } from '../../../../src/seed/core/dates';
import { GeoStore } from '../../../../src/seed/core/geo';
import { SEED_DAYS_AHEAD, VPS_MIN_MEMAVAILABLE_MB, VPS_MAX_LOAD1 } from '../../../../src/seed/core/constants';
import { UA_HEADERS } from '../../../../src/seed/providers/http';
import { configOf } from '../../../../src/seed/providers/registry';
import type { SeedCandidate, ProviderId } from '../../../../src/seed/core/types';
import type { VpsSpec } from '../../../../src/seed/providers/registry';
import type { MkGeoStore } from '../../../../src/seed/providers/multikino';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo root — works from BOTH the TS source (deep in backend/src/...) AND the
// pre-built bundle (backend/dist/vps-seed.mjs), where __dirname depth differs.
export function findRepoDir(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'backend')) && existsSync(join(dir, 'admin'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return '/opt/panperyskop';
}
const REPO_DIR = findRepoDir(__dirname);
const SEED_DIR = join(REPO_DIR, 'admin', 'seed');
const LOGS_DIR = join(REPO_DIR, 'admin', 'vps', 'logs');
const BASE_URL = process.env.BASE_URL || 'https://panperyskop-api.dev-4cb.workers.dev';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
export const PACING_MS = 500;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export { SEED_DAYS_AHEAD };

// ---------- CLI ----------
export interface CommonArgs {
  day?: string;
  range?: string;
  /** Backfill: fetch the whole seed window [today, today+SEED_DAYS_AHEAD] instead of just the new far edge. */
  full: boolean;
  force: boolean;
  noReject: boolean;
  noMedia: boolean;
  checkpoint?: string;
  limit: number;
}
export function parseCommonArgs(): CommonArgs {
  const argv = process.argv.slice(2);
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);
  return {
    day: value('--day'),
    range: value('--range'),
    full: has('--full'),
    force: has('--force'),
    noReject: has('--no-reject'),
    noMedia: has('--no-media'),
    checkpoint: value('--checkpoint'),
    limit: has('--limit') ? parseInt(value('--limit') ?? '0', 10) : 0,
  };
}

// ---------- registry spec ----------
export function specFor(source: ProviderId): VpsSpec {
  const spec = configOf(source)?.executors.vps;
  if (!spec) {
    console.error(`provider "${source}" has no VPS executor config in the registry`);
    process.exit(1);
  }
  return spec;
}

// ---------- checkpoint (unified contract: target + completed) ----------
// The orchestrator skips a provider when `target` matches its expectation and
// `completed` is true — every runner writes this shape.
export interface CpGeo { lat: number; lng: number; address: string }
export interface Checkpoint {
  target: string;
  completed: boolean;
  completedAt: number;
  /** Calendar day (YYYY-MM-DD) of the last self-healing coverage backfill — bounds it to once per day. */
  lastBackfillDay?: string;
  /** Per-scope progress (city or cinema id) within the window. */
  scopes?: Record<string, 'done'>;
  geo?: Record<string, CpGeo>;
  venueGeo?: Record<string, CpGeo>;
}
export function loadCp(path: string): Checkpoint {
  if (!existsSync(path)) return { target: '', completed: false, completedAt: 0 };
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Checkpoint;
  } catch (e) {
    console.error(`checkpoint ${path} unreadable (${(e as Error).message}) — starting fresh`);
    return { target: '', completed: false, completedAt: 0 };
  }
}
export function saveCp(path: string, cp: Checkpoint): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cp, null, 2) + '\n');
}
export function checkpointGeoStore(cp: Checkpoint): GeoStore {
  return {
    get: async (name, city) => cp.geo?.[`${name}@${city || ''}`] ?? null,
    set: async (name, city, geo) => {
      cp.geo = cp.geo ?? {};
      cp.geo[`${name}@${city || ''}`] = geo;
    },
  };
}
// Multikino's geo cache is keyed by cinema id (MkGeoStore), persisted in the
// checkpoint's venueGeo map — the SSR page is fetched once per cinema ever.
export function checkpointMkGeoStore(cp: Checkpoint): MkGeoStore {
  return {
    get: async (cinemaId) => cp.venueGeo?.[`mk:${cinemaId}`] ?? null,
    set: async (cinemaId, geo) => {
      cp.venueGeo = cp.venueGeo ?? {};
      cp.venueGeo[`mk:${cinemaId}`] = geo;
    },
  };
}

// ---------- media / staging ----------
export interface SeedEntry {
  external_id: string;
  title: string;
  description: string;
  created_at: string;
  venue: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  link: string;
  media: string;
  status: string;
  post_id: string | null;
  error: string | null;
}
export type EntryMap = Map<string, SeedEntry>;

export function mediaExt(url: string): string {
  const m = /\.(jpe?g|png|webp)$/i.exec(url.split('?')[0]);
  const ext = (m?.[1] || 'jpg').toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}
const MEDIA_TIMEOUT_MS = 60_000;
const MEDIA_RETRIES = 1;
// Stable media filename derived from the poster URL — the same poster (shared
// across days/cinemas) is downloaded once, so even a --full backfill stays fast.
export function mediaStem(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}
export async function downloadMedia(url: string, file: string): Promise<void> {
  const buf = await fetchMedia(url);
  if (mediaExt(url) === 'webp') convertToJpeg(buf, file);
  else writeFileSync(file, buf);
}
async function fetchMedia(url: string): Promise<Buffer> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MEDIA_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`media ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e as Error;
      if (attempt < MEDIA_RETRIES) await sleep(2_000);
    }
  }
  throw lastErr ?? new Error('media fetch failed');
}
function convertToJpeg(buf: Buffer, file: string): void {
  const raw = file + '.raw';
  writeFileSync(raw, buf);
  try {
    if (process.platform === 'darwin') {
      execFileSync('sips', ['-s', 'format', 'jpeg', raw, '--out', file], { stdio: 'ignore' });
    } else {
      execFileSync('convert', [raw, file], { stdio: 'ignore' });
    }
  } catch (e) {
    console.error(`jpeg conversion failed for ${file}: ${(e as Error).message} — keeping raw`);
    writeFileSync(file, buf);
  } finally {
    rmSync(raw, { force: true });
  }
}

export function loadEntries(jsonPath: string): EntryMap {
  const out = new Map<string, SeedEntry>();
  if (!existsSync(jsonPath)) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error(`entries ${jsonPath} unreadable (${(e as Error).message}) — starting fresh`);
    return out;
  }
  const arr = Array.isArray(parsed) ? parsed : Object.values(parsed as Record<string, unknown>);
  for (const item of arr) {
    const entry = item as Partial<SeedEntry>;
    if (entry && typeof entry === 'object' && entry.external_id) out.set(entry.external_id, entry as SeedEntry);
  }
  return out;
}
export function writeEntries(jsonPath: string, entries: EntryMap): void {
  const tmp = jsonPath + '.tmp';
  writeFileSync(tmp, JSON.stringify([...entries.values()], null, 2) + '\n');
  renameSync(tmp, jsonPath);
}
// created_at = 06:00 Europe/Warsaw of the candidate's own day.
export function entryFor(c: SeedCandidate & { lat: number; lng: number }, mediaRel: string): SeedEntry {
  const day = warsawDateOf(c.startMs);
  return {
    external_id: c.externalId,
    title: c.title,
    description: buildDescription(c),
    created_at: `${day}T06:00:00+02:00`,
    venue: c.venue,
    address: c.address,
    city: c.city,
    lat: c.lat,
    lng: c.lng,
    link: c.link,
    media: mediaRel,
    status: 'pending',
    post_id: null,
    error: null,
  };
}

// ---------- cross-provider dedupe / reject ----------
interface PostLike {
  id?: string;
  external_id?: string;
  description?: string;
  lat?: number;
  lng?: number;
}
export interface ExistingPost { postId: string; cand: SeedCandidate }

export function postToCandidate(p: PostLike, day: string): SeedCandidate {
  const desc = p.description || '';
  const m = /^(.+?):\s*(\d{2}:\d{2}),\s*(.*)$/.exec(desc);
  const title = (m?.[1] || desc).trim();
  const time = m?.[2] || null;
  const loc = (m?.[3] || '').trim();
  const venue = loc.split(',')[0].trim();
  const dayMs = warsawMidnightMs(day);
  const startMs = time ? dayMs + ((parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3, 5), 10)) * 60_000) : dayMs;
  return {
    source: (p.external_id || 'x').split('-')[0] as ProviderId,
    externalId: p.external_id || p.id || '',
    title,
    startMs,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    city: '',
    venue,
    address: '',
    link: '',
    mediaUrl: '',
    thumbUrl: null,
  };
}
export async function existingPosts(geo: { lat: number; lng: number }, day: string): Promise<ExistingPost[]> {
  const d = 0.2;
  const url = `${BASE_URL}/stories?sw_lat=${(geo.lat - d).toFixed(5)}&sw_lng=${(geo.lng - d).toFixed(5)}&ne_lat=${(geo.lat + d).toFixed(5)}&ne_lng=${(geo.lng + d).toFixed(5)}&day=${day}&category=events&limit=1000`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`stories ${res.status}`);
  const data = (await res.json()) as { stories?: PostLike[] };
  return (data.stories || []).map((p) => ({ postId: p.id || '', cand: postToCandidate(p, day) }));
}
export function displaced(existing: ExistingPost[], fresh: SeedCandidate[]): ExistingPost[] {
  const before = new Set(dedupe(existing.map((e) => e.cand)).map((c) => c.externalId));
  const after = new Set(dedupe([...existing.map((e) => e.cand), ...fresh]).map((c) => c.externalId));
  return existing.filter((e) => before.has(e.cand.externalId) && !after.has(e.cand.externalId));
}
export async function rejectPost(postId: string): Promise<void> {
  if (!ADMIN_SECRET) {
    console.error(`reject ${postId}: ADMIN_SECRET missing — skipped`);
    return;
  }
  const res = await fetch(`${BASE_URL}/admin/posts/${postId}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'higher-priority provider wins dedupe' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`reject ${postId} -> ${res.status}`);
}
// ---------- run model: SCOPE (unified for ALL providers) ----------
// Every provider covers the SAME seed window [today, today+SEED_DAYS_AHEAD].
// A "scope" is a fetch unit — a city (luma/meetup) or a cinema (multikino,
// cinemacity). Each scope returns candidates for the WHOLE window; the runtime
// stages them under their own day and tracks progress per scope in the unified
// checkpoint {target: window, completed}.
export interface ScopeCtx {
  /** Seed-window days (YYYY-MM-DD), e.g. [today .. today+SEED_DAYS_AHEAD]. */
  days: string[];
  windowStart: number;
  windowEnd: number;
  cp: Checkpoint;
}
export type ScopeFetch = (scope: string, ctx: ScopeCtx) => Promise<SeedCandidate[]>;
export interface ScopeSource {
  source: ProviderId;
  scopes: () => string[];
  /** Dedupe/reject bbox anchor for a scope (city center / cinema); falls back
   *  to the first candidate's coordinates when null. */
  scopeGeo: (scope: string) => { lat: number; lng: number } | null;
  fetchScope: ScopeFetch;
}

/** Type guard: the candidate has usable coordinates (needed for the map pin). */
export function hasCoords(c: SeedCandidate): c is SeedCandidate & { lat: number; lng: number } {
  return typeof c.lat === 'number' && typeof c.lng === 'number';
}

export async function runScopeSource(src: ScopeSource, opts?: { full?: boolean }): Promise<boolean> {
  const args = parseCommonArgs();
  const full = args.full || !!opts?.full;
  const spec = specFor(src.source);
  // Daily: fetch ONLY the new far edge (today+SEED_DAYS_AHEAD) — the window is
  // covered by rolling, exactly like the Worker cron. --full backfills the whole
  // window once (first run / a window gap). checkpoint.target is ALWAYS the far
  // edge, so the orchestrator's skip logic is stable after a --full run.
  const { days, target } = seedDays(args);
  const windowStart = warsawMidnightMs(days[0]);
  const windowEnd = eventDayEndMs(days[days.length - 1]);
  const jsonPath = join(SEED_DIR, spec.output);
  const mediaDir = join(SEED_DIR, spec.mediaDir);
  const cpPath = args.checkpoint ?? join(LOGS_DIR, spec.checkpoint);
  const cp = loadCp(cpPath);

  // Reset the checkpoint when the target changed OR --full backfills the whole
  // window (force re-fetch even if the far edge is already complete).
  if (full || cp.target !== target) {
    cp.target = target;
    cp.completed = false;
    cp.completedAt = 0;
    cp.scopes = {};
    console.log(`[${src.source}] ${full ? '--full backfill' : 'new target'} ${target} — reset progress`);
  }

  const entries = loadEntries(jsonPath);
  pruneStaleEntries(entries); // keep the staging file bounded to the current window
  mkdirSync(mediaDir, { recursive: true });
  const ctx: ScopeCtx = { days, windowStart, windowEnd, cp };

  const scopes = src.scopes();
  let processed = 0;
  let done = 0;
  const stagedCands: SeedCandidate[] = [];
  for (const scope of scopes) {
    if (cp.scopes?.[scope] === 'done') { done++; continue; }
    if (args.limit && processed >= args.limit) break;
    // Resource gate: the VPS is a small shared box. When memory/load is tight we
    // PAUSE (progress is checkpointed) so other processes are never starved — the
    // next cron kick (30 min) resumes from here.
    if (!resourcesOk()) {
      console.log(`[${src.source}] resources tight — pausing (${done}/${scopes.length} scopes done, resume next kick)`);
      break;
    }
    processed++;
    try {
      const cands = (await src.fetchScope(scope, ctx))
        .filter((c) => c.startMs >= windowStart && c.startMs <= windowEnd);
      console.log(`[${src.source}] ✓ ${scope}: ${cands.length} candidates`);

      const rejectGeo = src.scopeGeo(scope) ?? firstCoords(cands);
      if (rejectGeo && !args.noReject) await rejectDisplaced(scope, rejectGeo, cands);

      let staged = 0;
      for (const c of cands) {
        if (!hasCoords(c)) {
          console.error(`✗ ${c.externalId}: missing coordinates — skipped`);
          continue;
        }
        const ext = mediaExt(c.mediaUrl || '');
        const stem = mediaStem(c.mediaUrl || '');
        const rel = `${spec.mediaDir}/${stem}.${ext}`;
        const file = join(mediaDir, `${stem}.${ext}`);
        try {
          if (!c.mediaUrl) throw new Error('no media url');
          if (!args.noMedia && !existsSync(file)) await downloadMedia(c.mediaUrl, file);
          entries.set(c.externalId, entryFor(c, rel));
          stagedCands.push(c);
          staged++;
        } catch (e) {
          console.error(`✗ media ${c.externalId}: ${(e as Error).message}`);
        }
      }

      cp.scopes![scope] = 'done';
      done++;
      saveCp(cpPath, cp);
      writeEntries(jsonPath, entries);
      console.log(`  staged ${staged}/${cands.length}`);
    } catch (e) {
      console.error(`✗ ${scope}: ${(e as Error).message} — retry next run`);
    }
    await sleep(PACING_MS);
  }

  // Cinema providers (multikino/cinemacity) show EVERYTHING the API returns —
  // morning/evening showings, PL/UA language versions, dubbing variants. No
  // manifest dedupe. Only drop events whose title says cancelled (always removed).
  if (stagedCands.length > 0) {
    const cancelledIds = stagedCands.filter((c) => isCancelled(c.title)).map((c) => c.externalId);
    if (cancelledIds.length > 0) {
      for (const id of cancelledIds) entries.delete(id);
      console.log(`[${src.source}] dropped ${cancelledIds.length} cancelled entries`);
      writeEntries(jsonPath, entries);
    }
  }

  // Do NOT mark the checkpoint complete here — the orchestrator marks it only
  // AFTER a successful upload, so a failed upload is retried on the next kick
  // instead of being skipped forever.
  console.log(`[${src.source}] done target=${target} scopes=${done}/${scopes.length} → ${spec.output}`);
  return done >= scopes.length;
}

// Drop staged entries whose day already passed — the app only browses the current
// window, and seed-ingest skips uploaded ones anyway.
function pruneStaleEntries(entries: EntryMap): void {
  const today = todayWarsaw();
  for (const [id, e] of entries) {
    if (e.created_at.slice(0, 10) < today) entries.delete(id);
  }
}

function firstCoords(cands: SeedCandidate[]): { lat: number; lng: number } | null {
  const c = cands.find(hasCoords);
  return c ? { lat: c.lat, lng: c.lng } : null;
}

async function rejectDisplaced(scope: string, geo: { lat: number; lng: number }, cands: SeedCandidate[]): Promise<void> {
  const byDay = new Map<string, SeedCandidate[]>();
  for (const c of cands) {
    const day = warsawDateOf(c.startMs);
    const list = byDay.get(day) ?? [];
    list.push(c);
    byDay.set(day, list);
  }
  for (const [day, dayCands] of byDay) {
    try {
      const existing = await existingPosts(geo, day);
      for (const r of displaced(existing, dayCands)) {
        await rejectPost(r.postId);
        console.log(`  ✗ reject ${r.postId} (${r.cand.externalId})`);
      }
    } catch (e) {
      console.error(`  ! dedupe ${scope} day=${day}: ${(e as Error).message}`);
    }
  }
}

// --day/--range override for manual runs; --full backfills the whole window;
// default = the new far edge (today+SEED_DAYS_AHEAD).
function seedDays(args: CommonArgs): { days: string[]; target: string } {
  const today = todayWarsaw();
  const farEdge = addDaysWarsaw(today, SEED_DAYS_AHEAD);
  if (args.day) return { days: [args.day], target: farEdge };
  if (args.range) {
    const [start, end] = args.range.split('..');
    if (!start || !end) {
      console.error('usage: --range YYYY-MM-DD..YYYY-MM-DD');
      process.exit(1);
    }
    const out: string[] = [];
    for (let d = start; d <= end; d = addDaysWarsaw(d, 1)) out.push(d);
    return { days: out, target: farEdge };
  }
  const days = args.full
    ? Array.from({ length: SEED_DAYS_AHEAD + 1 }, (_, i) => addDaysWarsaw(today, i))
    : [farEdge];
  return { days, target: farEdge };
}

// Read /proc directly (Linux; on macOS the gate always passes) — the seed yields
// the box to other processes when memory or load is tight.
let lastCheck = 0;
let lastOk = true;
export function resourcesOk(): boolean {
  if (process.platform !== 'linux') return true;
  const now = Date.now();
  if (now - lastCheck < 10_000) return lastOk; // check at most once per 10s
  lastCheck = now;
  lastOk = readResources();
  if (!lastOk) {
    console.error(`resources gate: MemAvailable=${memAvailableMb()}MB load1=${load1()} — pausing`);
  }
  return lastOk;
}
function memAvailableMb(): number {
  try {
    const s = readFileSync('/proc/meminfo', 'utf8');
    const m = /^MemAvailable:\s+(\d+)\s*kB/m.exec(s);
    return m ? Math.round(parseInt(m[1], 10) / 1024) : Infinity;
  } catch { return Infinity; }
}
function load1(): number {
  try {
    const s = readFileSync('/proc/loadavg', 'utf8');
    return parseFloat(s.split(' ')[0]) || 0;
  } catch { return 0; }
}
function readResources(): boolean {
  const mem = memAvailableMb();
  const load = load1();
  return mem >= VPS_MIN_MEMAVAILABLE_MB && load < VPS_MAX_LOAD1;
}
