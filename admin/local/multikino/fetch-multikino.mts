#!/usr/bin/env -S npx tsx
// LOCAL multikino fetch (clean residential IP) → stage to admin/seed/multikino.json
// for the existing seed-ingest.mjs upload. Checkpoint/resume per (day, cinema) so
// a closed laptop can't lose progress. Multikino wins dedupe: any existing post
// of another source for the same film×cinema×day is rejected before ingest.
//
// Usage (run via tsx from the backend dir — imports backend TS helpers):
//   npx tsx admin/local/multikino/fetch-multikino.mts --day 2026-08-20
//   npx tsx admin/local/multikino/fetch-multikino.mts --range 2026-08-17..2026-08-20
//   ... --force  (ignore checkpoint), --checkpoint PATH, --limit N (test only)
//   ... --no-reject (skip dedupe/reject of displaced posts — for tests)
// Env: ADMIN_SECRET (for reject), BASE_URL (worker, default remote).
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseMkFilms, extractToken } from '../../../backend/src/seed/providers/multikino.ts';
import { MK_BASE, MK_API, MK_AUTH, MK_EMBARGO, MK_CINEMAS, mkScopes } from '../../../backend/src/seed/core/constants.ts';
import { UA_HEADERS, getText } from '../../../backend/src/seed/providers/http.ts';
import { dedupe, buildDescription } from '../../../backend/src/seed/core/dedupe.ts';
import { warsawMidnightMs } from '../../../backend/src/seed/core/dates.ts';
import type { SeedCandidate } from '../../../backend/src/seed/core/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..', '..');
const SEED_DIR = join(REPO, 'admin', 'seed');
const MEDIA_DIR = join(SEED_DIR, 'multikino-media');
const JSON_OUT = join(SEED_DIR, 'multikino.json');
const DEFAULT_CHECKPOINT = join(__dirname, 'logs', 'multikino-checkpoint.json');
const BASE_URL = process.env.BASE_URL || 'https://panperyskop-api.dev-4cb.workers.dev';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const PACING_MS = 500;

interface DayState { done: string[]; completedAt: number }
interface Checkpoint { days: Record<string, DayState>; venueGeo: Record<string, { lat: number; lng: number; address: string }> }
interface Existing { postId: string; cand: SeedCandidate }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- CLI ----------
function parseArgs() {
  const a = process.argv.slice(2);
  const get = (f: string) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
  const has = (f: string) => a.includes(f);
  return {
    day: get('--day'),
    range: get('--range'),
    force: has('--force'),
    noReject: has('--no-reject'),
    checkpoint: get('--checkpoint') || DEFAULT_CHECKPOINT,
    limit: has('--limit') ? parseInt(get('--limit') || '0', 10) : 0,
  };
}

// ---------- checkpoint ----------
function loadCp(path: string): Checkpoint {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return { days: {}, venueGeo: {} }; }
}
function saveCp(path: string, cp: Checkpoint) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cp, null, 2) + '\n');
}

// ---------- multikino fetch ----------
let token: string | null = null;
let tokenExp = 0;
async function getToken(): Promise<string> {
  if (token && tokenExp > Date.now() + 60_000) return token;
  const res = await fetch(MK_AUTH, { method: 'POST', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`multikino auth -> ${res.status}`);
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  const t = extractToken(cookies);
  if (!t) throw new Error('multikino auth: no microservicesToken cookie');
  token = t;
  try {
    const p = JSON.parse(Buffer.from(t.split('.')[1] || '', 'base64url').toString());
    tokenExp = typeof p?.exp === 'number' ? p.exp * 1000 : Date.now() + 12 * 3_600_000;
  } catch { tokenExp = Date.now() + 12 * 3_600_000; }
  return t;
}

async function fetchCinema(cinemaId: string, day: string): Promise<SeedCandidate[]> {
  const url = `${MK_API}/showings/cinemas/${cinemaId}/films?showingDate=${day}&minEmbargoLevel=${MK_EMBARGO}&includesSession=true&includeSessionAttributes=true`;
  let res = await fetch(url, { headers: { ...UA_HEADERS, Authorization: `Bearer ${await getToken()}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 401) {
    token = null;
    res = await fetch(url, { headers: { ...UA_HEADERS, Authorization: `Bearer ${await getToken()}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  }
  if (!res.ok) throw new Error(`multikino ${cinemaId} -> ${res.status}`);
  return parseMkFilms(await res.json(), cinemaId, day);
}

// ---------- geo (SSR page, cached in checkpoint) ----------
function decodeAddress(html: string): string {
  return html.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
async function resolveGeo(cinemaId: string, cp: Checkpoint): Promise<{ lat: number; lng: number; address: string } | null> {
  if (cp.venueGeo?.[cinemaId]) return cp.venueGeo[cinemaId];
  const cinema = MK_CINEMAS.find((c) => c.id === cinemaId);
  if (!cinema) return null;
  try {
    const html = await getText(`${MK_BASE}/repertuar/${cinema.slug}/teraz-gramy`);
    const geoM = html.match(/maps\/embed[^"]*q=(-?[\d.]+), ?(-?[\d.]+)/);
    if (!geoM) return null;
    const addrM = html.match(/<address class="cinema-location__address">([\s\S]*?)<\/address>/);
    const geo = { lat: parseFloat(geoM[1]), lng: parseFloat(geoM[2]), address: addrM ? decodeAddress(addrM[1]) : '' };
    cp.venueGeo[cinemaId] = geo;
    return geo;
  } catch { return null; }
}

// ---------- media (download poster → .jpg via sips) ----------
function mediaExt(url: string): string {
  const m = /\.(jpe?g|png|webp)$/i.exec(url.split('?')[0]);
  const e = (m?.[1] || 'jpg').toLowerCase();
  return e === 'jpeg' ? 'jpg' : e;
}
async function downloadMedia(url: string, file: string): Promise<void> {
  const res = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`media ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (mediaExt(url) === 'webp') {
    const tmp = file + '.raw';
    writeFileSync(tmp, buf);
    try { execFileSync('sips', ['-s', 'format', 'jpeg', tmp, '--out', file], { stdio: 'ignore' }); }
    catch { writeFileSync(file, buf); }
    rmSync(tmp, { force: true });
  } else {
    writeFileSync(file, buf);
  }
}

// ---------- dedupe vs existing day posts (multikino wins) ----------
function postToCandidate(p: any, day: string): SeedCandidate {
  const desc = p.description || '';
  const m = /^(.+?):\s*(\d{2}:\d{2}),\s*(.*)$/.exec(desc);
  const title = (m?.[1] || desc).trim();
  const time = m?.[2] || null;
  const loc = (m?.[3] || '').trim();
  const venue = loc.split(',')[0].trim();
  const dayMs = warsawMidnightMs(day);
  const startMs = time ? dayMs + ((parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3, 5), 10)) * 60_000) : dayMs;
  return {
    source: (p.external_id || 'x').split('-')[0] as never,
    externalId: p.external_id || p.id,
    title, startMs, lat: p.lat, lng: p.lng, city: '', venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  };
}
async function existingPosts(geo: { lat: number; lng: number }, day: string): Promise<Existing[]> {
  const d = 0.02;
  const url = `${BASE_URL}/stories?sw_lat=${(geo.lat - d).toFixed(5)}&sw_lng=${(geo.lng - d).toFixed(5)}&ne_lat=${(geo.lat + d).toFixed(5)}&ne_lng=${(geo.lng + d).toFixed(5)}&day=${day}&category=events`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`stories ${res.status}`);
  const data = (await res.json()) as { stories?: any[] };
  return (data.stories || []).map((p) => ({ postId: p.id, cand: postToCandidate(p, day) }));
}
// Existing posts that were dedupe-winners without multikino but lose once multikino joins.
function displaced(existing: Existing[], mk: SeedCandidate[]): Existing[] {
  const before = new Set(dedupe(existing.map((e) => e.cand)).map((c) => c.externalId));
  const after = new Set(dedupe([...existing.map((e) => e.cand), ...mk]).map((c) => c.externalId));
  return existing.filter((e) => before.has(e.cand.externalId) && !after.has(e.cand.externalId));
}
async function rejectPost(postId: string): Promise<void> {
  if (!ADMIN_SECRET) { console.error(`  ! reject ${postId}: ADMIN_SECRET missing`); return; }
  const res = await fetch(`${BASE_URL}/admin/posts/${postId}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'multikino wins dedupe' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`reject ${postId} -> ${res.status}`);
}

// ---------- staging (multikino.json) ----------
function loadEntries(): Record<string, any> {
  try { return JSON.parse(readFileSync(JSON_OUT, 'utf8')); } catch { return {}; }
}
function writeEntries(entries: Record<string, any>) {
  const tmp = JSON_OUT + '.tmp';
  writeFileSync(tmp, JSON.stringify(Object.values(entries), null, 2) + '\n');
  renameSync(tmp, JSON_OUT);
}
function entryFor(c: SeedCandidate, day: string, mediaRel: string): any {
  return {
    external_id: c.externalId,
    title: c.title,
    description: buildDescription(c),
    created_at: `${day}T06:00:00+02:00`,
    venue: c.venue,
    address: c.address,
    city: c.city,
    lat: c.lat, lng: c.lng,
    link: c.link,
    media: mediaRel,
    status: 'pending',
    post_id: null,
    error: null,
  };
}

// ---------- day processing ----------
async function processDay(day: string, cp: Checkpoint, opts: ReturnType<typeof parseArgs>) {
  const scopes = mkScopes();
  const state = cp.days[day] || (cp.days[day] = { done: [], completedAt: 0 });
  if (!opts.force && state.completedAt && state.done.length >= scopes.length) {
    console.log(`day ${day}: complete (${state.done.length}/${scopes.length}) — skip`);
    return;
  }
  const entries = loadEntries();
  let processed = 0;
  for (const cinemaId of scopes) {
    if (!opts.force && state.done.includes(cinemaId)) continue;
    if (opts.limit && processed >= opts.limit) break;
    processed++;
    const cinema = MK_CINEMAS.find((c) => c.id === cinemaId);
    try {
      const cands = await fetchCinema(cinemaId, day);
      const geo = await resolveGeo(cinemaId, cp);
      if (!geo) { console.error(`✗ ${cinemaId}: no geo — retry next day`); continue; }
      for (const c of cands) { c.lat = geo.lat; c.lng = geo.lng; c.address = geo.address; c.city = cinema?.city || ''; }

      const existing = opts.noReject ? [] : await existingPosts(geo, day);
      const rejects = displaced(existing, cands);
      for (const r of rejects) {
        try { await rejectPost(r.postId); console.log(`  ✗ reject ${r.postId} (${r.cand.externalId})`); }
        catch (e) { console.error(`  ✗ reject ${r.postId} failed: ${(e as Error).message}`); }
      }

      let staged = 0;
      for (const c of cands) {
        const rel = `multikino-media/${c.externalId}.jpg`;
        const file = join(MEDIA_DIR, `${c.externalId}.jpg`);
        try {
          if (!existsSync(file)) await downloadMedia(c.mediaUrl, file);
          entries[c.externalId] = entryFor(c, day, rel);
          staged++;
        } catch (e) { console.error(`  ✗ media ${c.externalId}: ${(e as Error).message}`); }
      }

      state.done.push(cinemaId);
      saveCp(opts.checkpoint, cp);
      writeEntries(entries);
      console.log(`✓ ${cinemaId} ${cinema?.name || ''}: ${cands.length} candidates, ${staged} staged, ${rejects.length} dup-rejects`);
    } catch (e) {
      console.error(`✗ ${cinemaId}: ${(e as Error).message} — retry next day`);
    }
    await sleep(PACING_MS);
  }
  if (state.done.length >= scopes.length) { state.completedAt = Date.now(); saveCp(opts.checkpoint, cp); }
  console.log(`day ${day}: done ${state.done.length}/${scopes.length}`);
}

// ---------- main ----------
function addDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
async function main() {
  const opts = parseArgs();
  mkdirSync(MEDIA_DIR, { recursive: true });
  const cp = loadCp(opts.checkpoint);
  const days: string[] = [];
  if (opts.range) {
    const [a, b] = opts.range.split('..');
    for (let d = a; d <= b; d = addDay(d)) days.push(d);
  } else if (opts.day) days.push(opts.day);
  else { console.error('usage: --day YYYY-MM-DD | --range A..B [--force] [--limit N]'); process.exit(1); }

  for (const day of days) await processDay(day, cp, opts);
  saveCp(opts.checkpoint, cp);
  console.log(`staged entries total: ${Object.keys(loadEntries()).length} (${JSON_OUT})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
