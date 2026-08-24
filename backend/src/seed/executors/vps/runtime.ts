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
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { dedupe, buildDescription } from '../../../../src/seed/core/dedupe';
import { isCancelled } from '../../../../src/seed/core/filters';
import { todayWarsaw, addDaysWarsaw, warsawMidnightMs, warsawDateOf, eventDayEndMs } from '../../../../src/seed/core/dates';
import { GeoStore, fallbackSeedGeo } from '../../../../src/seed/core/geo';
import { SEED_DAYS_AHEAD, VPS_MIN_MEMAVAILABLE_MB, VPS_MAX_LOAD1, VPS_CONCURRENCY } from '../../../../src/seed/core/constants';
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
const BASE_URL = process.env.BASE_URL || 'https://api.panperyskop.app';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
export const PACING_MS = 500;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export { SEED_DAYS_AHEAD };

// ---------- per-scope fetch retry ----------
// A scope fetch can fail transiently when the rotating residential proxy hands us
// a slow/bad IP (meetup showed ~57s stalls near the 60s fetch timeout). Retrying
// gets a FRESH IP from the rotate pool, which almost always succeeds. Bounded so
// a genuinely dead scope still surfaces as an error (retried on the next kick).
const VPS_FETCH_RETRIES = 3;
const VPS_FETCH_RETRY_DELAY_MS = 5_000;

export async function fetchWithRetry(
  src: ScopeSource,
  scope: string,
  ctx: ScopeCtx,
  opts?: { retries?: number; retryDelayMs?: number },
): Promise<SeedCandidate[]> {
  const retries = opts?.retries ?? VPS_FETCH_RETRIES;
  const delay = opts?.retryDelayMs ?? VPS_FETCH_RETRY_DELAY_MS;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await src.fetchScope(scope, ctx);
    } catch (e) {
      lastErr = e as Error;
      if (attempt < retries) {
        console.error(`[${src.source}/${scope}] attempt ${attempt} failed (${(e as Error).message}) — retrying with a fresh IP in ${delay / 1000}s`);
        logLoad('scope:retry', `${src.source}/${scope} attempt=${attempt} ${(e as Error).message}`);
        await sleep(delay);
      }
    }
  }
  throw lastErr ?? new Error('fetch failed');
}

// ---------- load instrumentation (admin/vps/logs/load.log) ----------
// Always-on sampler correlating phases with process RSS/heap and box memory/load,
// so a memory spike (or OOM) is traceable to the exact scope/phase that caused it.
// logLoad ALWAYS reads /proc fresh (never the gate's 10s cache).
const LOAD_LOG = join(LOGS_DIR, 'load.log');
const LOAD_LOG_MAX = 5 * 1024 * 1024;
export function logLoad(phase: string, meta = ''): void {
  try {
    const u = process.memoryUsage();
    const line = `[${new Date().toISOString()}] ${phase} | rss=${Math.round(u.rss / 1048576)}MB heap=${Math.round(u.heapUsed / 1048576)}/${Math.round(u.heapTotal / 1048576)}MB ext=${Math.round(u.external / 1048576)}MB avail=${memAvailableMb()}MB load1=${load1()}${meta ? ` | ${meta}` : ''}\n`;
    mkdirSync(LOGS_DIR, { recursive: true });
    let size = 0;
    try { size = statSync(LOAD_LOG).size; } catch { /* first write */ }
    if (size > LOAD_LOG_MAX) {
      try { renameSync(LOAD_LOG, `${LOAD_LOG}.1`); } catch { /* noop */ }
    }
    writeFileSync(LOAD_LOG, line, { flag: 'a' });
  } catch { /* logging must never break seeding */ }
}
// Periodic in-run sampler — even a hung phase keeps showing what it was doing.
setInterval(() => logLoad('tick'), 30_000).unref();
// Explicit GC (requires --expose-gc) with before/after deltas — shows what V8
// returns to the OS and keeps the heap from ratcheting up over a long pass.
export function gcNow(phase: string): void {
  const g = (globalThis as { gc?: () => void }).gc;
  if (typeof g !== 'function') return;
  const before = Math.round(process.memoryUsage().heapUsed / 1048576);
  g();
  const after = Math.round(process.memoryUsage().heapUsed / 1048576);
  logLoad(`gc:${phase}`, `heap ${before}MB -> ${after}MB (freed ${Math.max(0, before - after)}MB)`);
}
// Force the next resourcesOk() to re-read /proc (used between providers).
export function resetResourceCheck(): void {
  lastCheck = 0;
  lastOk = true;
}

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
  showtimes?: string[] | null;
  showtime_booking?: { time: string; kind: string; params: Record<string, string> }[] | null;
  tags?: string[] | null;
  /** True when the entry used a default geo pin (city center / 0,0) — upload as PENDING. */
  no_geo?: boolean;
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
// Direct (datacenter) download via curl with the proxy env stripped — poster CDNs
// (Cloudinary, img.helios.pl, xmedia-cw) are NOT Cloudflare-protected, so media
// never eats the residential proxy budget. Used as the FIRST attempt.
function fetchMediaDirect(url: string): Buffer {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of ['HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy', 'NODE_USE_ENV_PROXY']) delete env[k];
  const out = execFileSync('curl', [
    '-sS', '-L', '--compressed', '--max-time', String(Math.floor(MEDIA_TIMEOUT_MS / 1000)),
    '-H', `User-Agent: ${UA_HEADERS['User-Agent']}`, url,
  ], { env, encoding: null as unknown as BufferEncoding, timeout: MEDIA_TIMEOUT_MS });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
// Image magic-byte check — a datacenter direct download can return a 200 HTML
// block page from a CDN; that must NOT be saved as a poster. JPEG/PNG/WEBP/GIF.
function isImageBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 12) return false;
  return (
    (buf[0] === 0xff && buf[1] === 0xd8) ||                       // JPEG
    (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) || // PNG
    (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) || // WEBP/RIFF
    (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)      // GIF
  );
}

async function fetchMedia(url: string): Promise<Buffer> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MEDIA_RETRIES; attempt++) {
    try {
      const buf = await fetchMediaDirect(url);
      if (!isImageBuffer(buf)) throw new Error('direct response is not an image (CDN block page?)');
      return buf;
    } catch (e) {
      lastErr = e as Error;
      console.error(`media direct ${url.split('?')[0].slice(-48)}: ${(e as Error).message} — fallback to proxy`);
    }
    try {
      const res = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`media ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!isImageBuffer(buf)) throw new Error('proxied response is not an image');
      return buf;
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
    showtimes: c.times?.length ? c.times : null,
    showtime_booking: c.showtimeBooking?.length ? c.showtimeBooking : null,
    tags: c.tags?.length ? c.tags : null,
    // Geo-less events got a default pin — seed-ingest uploads them as PENDING
    // (skips auto-approve) so they never appear before the admin fixes/approves.
    no_geo: (c as SeedCandidate & { fallbackGeo?: boolean }).fallbackGeo ? true : undefined,
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
  const doneScopes = scopes.filter((s) => cp.scopes?.[s] === 'done');
  let processed = 0;
  let done = doneScopes.length;
  let paused = false;
  logLoad('run-start', `${src.source} target=${target} scopes=${scopes.length} done=${done} full=${full} entries=${entries.size}`);

  // Per-scope work — kept as one function so parallel scopes share the same
  // fetch → gate → dedupe → stage → checkpoint path as the sequential version.
  const processScope = async (scope: string): Promise<'done' | 'paused' | 'error'> => {
    if (cp.scopes?.[scope] === 'done') return 'done';
    // Resource gate: the VPS is a small shared box. When memory/load is tight we
    // PAUSE (progress is checkpointed) so other processes are never starved — the
    // next cron kick (30 min) resumes from here.
    if (!resourcesOk(`scope-start:${scope}`)) {
      console.log(`[${src.source}] resources tight — pausing (${done}/${scopes.length} scopes done, resume next kick)`);
      return 'paused';
    }
    const t0 = Date.now();
    try {
      const cands = (await fetchWithRetry(src, scope, ctx))
        .filter((c) => c.startMs >= windowStart && c.startMs <= windowEnd);
      console.log(`[${src.source}] ✓ ${scope}: ${cands.length} candidates`);
      logLoad('scope:fetch', `${src.source}/${scope} cands=${cands.length} ${Date.now() - t0}ms`);

      const rejectGeo = src.scopeGeo(scope) ?? firstCoords(cands);
      if (rejectGeo && !args.noReject) await rejectDisplaced(scope, rejectGeo, cands);

      let staged = 0;
      let cancelled = 0;
      let scopePaused = false;
      let i = 0;
      for (const c of cands) {
        i++;
        // Mid-scope gate: a whole cinema/day is staged here (JSON parse + media),
        // which can spike memory WITHOUT the scope-boundary gate ever firing.
        if (i % 10 === 0 && !resourcesOk(`scope:stage:${scope}`)) { scopePaused = true; break; }
        if (!hasCoords(c)) {
          // Collect geo-less events anyway: default pin (city center / 0,0) + a
          // no_geo marker so seed-ingest uploads them as PENDING (never shown in
          // the app until the admin fixes geo / approves).
          const fb = fallbackSeedGeo(c.city);
          (c as SeedCandidate & { fallbackGeo?: boolean }).lat = fb.lat;
          (c as SeedCandidate & { fallbackGeo?: boolean }).lng = fb.lng;
          (c as SeedCandidate & { fallbackGeo?: boolean }).fallbackGeo = true;
          console.log(`! ${c.externalId}: missing coordinates — default pin (${fb.lat},${fb.lng}), pending`);
        }
        // Cancelled entries are dropped here (not staged) — saves media download.
        if (isCancelled(c.title)) { cancelled++; continue; }
        const ext = mediaExt(c.mediaUrl || '');
        const stem = mediaStem(c.mediaUrl || '');
        const rel = `${spec.mediaDir}/${stem}.${ext}`;
        const file = join(mediaDir, `${stem}.${ext}`);
        try {
          if (!c.mediaUrl) throw new Error('no media url');
          if (!args.noMedia && !existsSync(file)) await downloadMedia(c.mediaUrl, file);
          entries.set(c.externalId, entryFor(c as SeedCandidate & { lat: number; lng: number }, rel));
          staged++;
        } catch (e) {
          console.error(`✗ media ${c.externalId}: ${(e as Error).message}`);
        }
      }
      if (scopePaused) { logLoad('gate-pause', `mid-scope:${scope} staged=${staged}/${cands.length}`); return 'paused'; }

      cp.scopes![scope] = 'done';
      done++;
      saveCp(cpPath, cp);
      writeEntries(jsonPath, entries);
      console.log(`  staged ${staged}/${cands.length} (cancelled ${cancelled})`);
      logLoad('scope:done', `${src.source}/${scope} staged=${staged}/${cands.length} cancelled=${cancelled} entries=${entries.size} ${Date.now() - t0}ms`);
      gcNow(`after-scope:${scope}`);
      return 'done';
    } catch (e) {
      console.error(`✗ ${scope}: ${(e as Error).message} — retry next run`);
      logLoad('scope:error', `${src.source}/${scope}: ${(e as Error).message}`);
      return 'error';
    }
  };

  // Bounded concurrency — the rotating residential proxy gives each request a
  // FRESH IP, so parallel scopes no longer trip per-IP rate limits (the reason
  // the old pass had to run sequentially and take ~30 min). Batches of
  // VPS_CONCURRENCY; the resource gate still pauses the run when the box is busy.
  const queue = scopes.filter((s) => cp.scopes?.[s] !== 'done');
  while (queue.length > 0) {
    if (args.limit && processed >= args.limit) break;
    if (!resourcesOk(`batch-start`)) {
      console.log(`[${src.source}] resources tight — pausing (${done}/${scopes.length} scopes done, resume next kick)`);
      paused = true;
      break;
    }
    const batch = queue.splice(0, args.limit ? Math.min(VPS_CONCURRENCY, args.limit - processed) : VPS_CONCURRENCY);
    processed += batch.length;
    const results = await Promise.allSettled(batch.map(processScope));
    if (results.some((r) => r.status === 'fulfilled' && r.value === 'paused')) {
      paused = true;
      break;
    }
    // 'error' scopes aren't marked done → retried on the next run (same as the
    // sequential pass).
  }

  // Do NOT mark the checkpoint complete here — the orchestrator marks it only
  // AFTER a successful upload, so a failed upload is retried on the next kick
  // instead of being skipped forever.
  console.log(`[${src.source}] done target=${target} scopes=${done}/${scopes.length} → ${spec.output}`);
  logLoad('run-done', `${src.source} scopes=${done}/${scopes.length} entries=${entries.size} paused=${paused}`);
  gcNow('run-end');
  return done >= scopes.length && !paused;
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
export function resourcesOk(phase = ''): boolean {
  if (process.platform !== 'linux') return true;
  const now = Date.now();
  if (now - lastCheck < 10_000) return lastOk; // check at most once per 10s
  lastCheck = now;
  lastOk = readResources();
  if (!lastOk) {
    const msg = `MemAvailable=${memAvailableMb()}MB load1=${load1()}`;
    console.error(`resources gate: ${msg} — pausing`);
    logLoad('gate-pause', `${phase ? `${phase} | ` : ''}${msg}`);
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
