#!/usr/bin/env node
// Ingest seed events from a JSON manifest into PanPeryskop.
//
// Usage:
//   node admin/src/seed-ingest.mjs <events.json> [--force] [--approve]
//
//   --force   reprocess entries even if status == 'done'
//   --approve auto-approve via POST /admin/posts/:id/approve (needs ADMIN_SECRET)
//
// Each event becomes a post with status 'pending' (moderation queue). The admin
// approves them with:
//   node admin/src/cli.js approve <post_id>
//
// Media must be a local photo (jpg/png/heic) or video (mp4/mov) on disk; it is
// compressed through the same pipeline as camera posts (sips / ffmpeg).
//
// Env:
//   BASE_URL       default https://api.panperyskop.app (remote)
//   SEED_DEVICE_ID default 'panperyskop-seed'
//   ADMIN_SECRET   required for --approve
//
// Requirements: sips (macOS), ffmpeg (for videos).
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'https://api.panperyskop.app';
const SEED_DEVICE_ID = process.env.SEED_DEVICE_ID || 'panperyskop-seed';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const PHOTO_MAX = 1080;
const THUMB_MAX = 320;
const TTL_MS = 24 * 3_600_000;
const MAX_LOOKAHEAD_MS = 366 * 24 * 3_600_000;

const run = (cmd) => {
  // Small box (256 MB VPS): ImageMagick/ffmpeg can OOM-flake — retry once.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return execSync(cmd, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180_000 });
    } catch (e) {
      lastErr = e;
      if (attempt === 0) execSync('sleep 3', { stdio: 'ignore' });
    }
  }
  throw lastErr;
};

// ---- event blacklist (mirror of backend seed/core/blacklist.ts) ----
const TOKEN_RE = /[a-z0-9\u0430-\u044f\u0456\u0454\u0491]+/g;
const BL_STOP = new Set(['w','i','na','z','do','o','a','the','and','or','vs','2026','2025','2024','poznan','warszawa','poland','polska','bilety','bilet','jest','tak','nie','sala','hala','pozn','kino','nad','seans','seansy','premiera','dnia','czesc']);
function blFold(s) {
  return String(s || '').normalize('NFC').toLowerCase().replaceAll('ł', 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function blTokens(s) {
  const w = (blFold(s).match(TOKEN_RE) || []);
  return [...new Set(w.filter((x) => x.length >= 3 && !BL_STOP.has(x)))];
}
function blContain(a, b) {
  if (!a.length || !b.length) return false;
  const bs = new Set(b);
  let shared = 0;
  for (const w of a) if (bs.has(w)) shared++;
  return shared >= 1 && shared / Math.min(a.length, b.length) >= 0.8;
}
function blLcs(A, B) {
  const dp = new Array(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i++) {
    let prevDiag = 0;
    for (let j = 1; j <= B.length; j++) {
      const save = dp[j];
      dp[j] = A[i - 1] === B[j - 1] ? prevDiag + 1 : Math.max(dp[j], dp[j - 1]);
      prevDiag = save;
    }
  }
  return dp[B.length];
}
function blSeqRatio(a, b) {
  const A = blFold(a).replace(/[^a-z0-9\u0430-\u044f\u0456\u0454\u0491]+/g, ' ');
  const B = blFold(b).replace(/[^a-z0-9\u0430-\u044f\u0456\u0454\u0491]+/g, ' ');
  const n = 2 * blLcs(A, B);
  return A.length + B.length ? n / (A.length + B.length) : 1;
}
function blMatch(rule, entry) {
  const hasPattern = !!(rule.pattern && rule.pattern.trim());
  const hasVenue = !!(rule.venue && rule.venue.trim());
  const hasPartner = !!(rule.partner_id && String(rule.partner_id).trim());
  if (!hasPattern && !hasPartner) return false;
  if (hasPattern && !blContain(blTokens(rule.pattern), blTokens(entry.title || entry.description || ''))) return false;
  if (hasVenue && !(entry.venue && blSeqRatio(rule.venue, entry.venue) >= 0.8)) return false;
  if (hasPartner && String(entry.partner_id || '') !== String(rule.partner_id).trim()) return false;
  return true;
}
async function fetchBlacklist() {
  if (!ADMIN_SECRET) return [];
  try {
    const res = await fetch(`${BASE_URL}/admin/seed/blacklist`, {
      headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.rules) ? data.rules : [];
  } catch {
    return []; // fail-open: a blacklist outage never blocks the seed
  }
}

const [,, fileArg] = process.argv;
if (!fileArg) {
  console.error('Usage: node admin/src/seed-ingest.mjs <events.json> [--force] [--approve]');
  process.exit(1);
}
const force = process.argv.includes('--force');
const approve = process.argv.includes('--approve');
if (approve && !ADMIN_SECRET) {
  console.error('--approve requires ADMIN_SECRET env');
  process.exit(1);
}

const jsonPath = resolve(fileArg);
const baseDir = dirname(jsonPath);
const events = JSON.parse(readFileSync(jsonPath, 'utf8'));

// '2026-08-05' → unix ms of 00:00 Europe/Warsaw
function warsawMidnightMs(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  while (fmt.format(t) !== isoDate) t -= 3_600_000;
  return t;
}

function parseCreatedAt(value) {
  if (typeof value !== 'string') return Date.now();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return warsawMidnightMs(value);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Invalid created_at: ${value}`);
  return ms;
}

function optimize(src, tmp) {
  const ext = src.split('.').pop().toLowerCase();
  const isVideo = ['mp4', 'mov', 'm4v'].includes(ext);
  if (isVideo) {
    const mediaOut = join(tmp, 'media.mp4');
    const thumbOut = join(tmp, 'thumb.jpg');
    run(`ffmpeg -y -i "${src}" -vf "scale='min(720,iw)':-2" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 96k -movflags +faststart "${mediaOut}"`);
    run(
      `ffmpeg -y -i "${src}" -ss 00:00:00.5 -vframes 1 -vf "scale='min(${THUMB_MAX},iw)':-2" "${thumbOut}" 2>/dev/null || ` +
      `ffmpeg -y -i "${src}" -vframes 1 -vf "scale='min(${THUMB_MAX},iw)':-2" "${thumbOut}"`
    );
    return {
      file: readFileSync(mediaOut), fileName: 'media.mp4', mime: 'video/mp4',
      thumb: readFileSync(thumbOut), type: 'video',
    };
  }
  const mediaOut = join(tmp, 'media.jpg');
  const thumbOut = join(tmp, 'thumb.jpg');
  compressImage(src, mediaOut, PHOTO_MAX);
  compressImage(src, thumbOut, THUMB_MAX);
  return {
    file: readFileSync(mediaOut), fileName: 'media.jpg', mime: 'image/jpeg',
    thumb: readFileSync(thumbOut), type: 'photo',
  };
}

// Cross-platform image resize → JPEG. macOS uses sips; Linux (VPS) uses
// ImageMagick. NOTE: do NOT use `-auto-orient` with ImageMagick 7's convert
// — it fails with "no decode delegate" on valid JPEGs (confirmed). Posters are
// portrait already, so orientation correction is unnecessary. ImageMagick runs
// with a hard memory cap so it spills to disk instead of OOMing the 256 MB box.
function compressImage(src, out, max) {
  if (process.platform === 'darwin') {
    run(`sips -Z ${max} -s format jpeg "${src}" --out "${out}"`);
  } else {
    run(`convert -limit memory 64MiB -limit map 128MiB "${src}" -resize ${max}x${max}\\> -quality 85 "${out}"`);
  }
}

async function login() {
  const res = await fetch(`${BASE_URL}/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: SEED_DEVICE_ID }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`auth/device -> ${res.status}`);
  return (await res.json()).session_token;
}

async function upload(session, entry, media, createdAt) {
  const form = new FormData();
  form.append('type', media.type);
  form.append('lat', String(entry.lat));
  form.append('lng', String(entry.lng));
  form.append('description', entry.description || entry.title || '');
  form.append('created_at', String(createdAt));
  form.append('is_sponsored', '1');
  if (entry.link) form.append('link_url', entry.link);
  form.append('external_id', entry.external_id);
  if (entry.showtimes) form.append('showtimes', JSON.stringify(entry.showtimes));
  if (entry.showtime_booking) form.append('showtime_booking', JSON.stringify(entry.showtime_booking));
  if (entry.tags && entry.tags.length) form.append('tags', JSON.stringify(entry.tags));
  if (entry.partner_id) form.append('partner_id', String(entry.partner_id));
  if (entry.partner_name) form.append('partner_name', String(entry.partner_name));
  // Fallback-geo events (no_geo) stay PENDING — never shown until the admin fixes
  // geo / approves. Normal events are created approved (no status field).
  if (entry.no_geo) form.append('status', 'pending');
  form.append('file', new Blob([media.file], { type: media.mime }), media.fileName);
  form.append('thumb', new Blob([media.thumb], { type: 'image/jpeg' }), 'thumb.jpg');

  const doPost = (tok) => fetch(`${BASE_URL}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}` },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  // auth/device keeps a SINGLE session per device — a concurrent seed run (e.g.
  // the 5-min cron) re-logins and invalidates our token mid-upload. On 401,
  // re-login once and retry.
  let res = await doPost(session.token);
  if (res.status === 401) {
    session.token = await login();
    res = await doPost(session.token);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST /posts -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function approvePost(id) {
  const res = await fetch(`${BASE_URL}/admin/posts/${id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`approve ${id} -> ${res.status}`);
}

async function fetchSeedIds(path) {
  if (!ADMIN_SECRET) return new Set();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(Array.isArray(data.ids) ? data.ids : []);
  } catch {
    return new Set(); // fail-open
  }
}

async function main() {
  const session = { token: await login() };
  const rejectedIds = await fetchSeedIds('/admin/seed/rejected');
  const existingIds = force ? new Set() : await fetchSeedIds('/admin/seed/existing');
  const blacklist = await fetchBlacklist();
  if (blacklist.length) console.log(`blacklist: ${blacklist.length} aktywnych reguł (${BASE_URL})`);
  const tmp = mkdtempSync(join(tmpdir(), 'pp-seed-'));
  const results = { done: [], errors: [], skipped: 0 };

  for (let i = 0; i < events.length; i++) {
    const entry = events[i];
    const label = entry.external_id || entry.title || `#${i}`;

    if (entry.status === 'done' && !force) {
      results.skipped += 1;
      continue;
    }

    // Blacklist: skip BEFORE downloading any media (the backend POST /posts is
    // the backstop; this saves the media bytes on the 256 MB box).
    const bl = blacklist.find((r) => blMatch(r, entry));
    if (bl) {
      entry.status = 'done'; // terminal — do not retry
      entry.error = null;
      results.skipped += 1;
      console.log(`⊘ ${label}: blacklisted${bl.pattern ? ` "${bl.pattern}"` : ''}${bl.partner_name ? ` / ${bl.partner_name}` : ''} — skip`);
      continue;
    }

    // Never resurrect a rejected post (manual dedupe cleanup / moderation).
    if (rejectedIds.has(entry.external_id || '')) {
      entry.status = 'done'; // terminal — do not retry
      results.skipped += 1;
      console.log(`↷ ${label}: already rejected — skip`);
      continue;
    }

    // Resume: a post that already exists is left untouched (upsert would also
    // keep its status, but skipping avoids re-converting media on every pass).
    if (existingIds.has(entry.external_id || '')) {
      entry.status = 'done';
      results.skipped += 1;
      console.log(`↷ ${label}: already exists — skip`);
      continue;
    }

    try {
      const mediaRel = entry.media;
      if (!mediaRel) throw new Error('missing media path');
      const src = join(baseDir, mediaRel);
      if (!existsSync(src)) throw new Error(`media file not found: ${mediaRel}`);

      const createdAt = parseCreatedAt(entry.created_at);
      const now = Date.now();
      if (createdAt < now - TTL_MS) throw new Error('created_at too far in the past');
      if (createdAt > now + MAX_LOOKAHEAD_MS) throw new Error('created_at too far in the future');
      if (!entry.external_id) throw new Error('missing external_id');
      if (typeof entry.lat !== 'number' || typeof entry.lng !== 'number') throw new Error('invalid lat/lng');

      const media = optimize(src, tmp);
      const data = await upload(session, entry, media, createdAt);

      entry.status = 'done';
      entry.post_id = data.id;
      entry.error = null;

      // POST /posts already creates non-no_geo entries as APPROVED (api/posts.ts
      // defaults status to approved; upload() only sends 'pending' for no_geo), so
      // the separate approvePost call was REDUNDANT — removing it halves the API
      // calls during large backfills. no_geo entries stay pending for the admin.
      if (!entry.no_geo) {
        results.done.push({ id: data.id, label, approved: true });
      } else {
        results.done.push({ id: data.id, label, approved: false });
      }
      console.log(`✓ ${label} -> ${data.id} (${media.type}, created_at ${new Date(createdAt).toISOString()})`);
    } catch (e) {
      const msg = e.message || String(e);
      // The backend POST /posts blacklist backstop (400 "blacklisted: …") means
      // the rule list changed between our fetch and the POST — terminal, not a
      // transient error (never retry in a loop).
      entry.status = /blacklisted/i.test(msg) ? 'done' : 'error';
      entry.error = msg;
      results.errors.push({ label, error: msg });
      console.error(`✗ ${label}: ${msg}`);
    }
  }

  rmSync(tmp, { recursive: true, force: true });
  const tmpOut = `${jsonPath}.tmp`;
  writeFileSync(tmpOut, JSON.stringify(events, null, 2) + '\n');
  renameSync(tmpOut, jsonPath);

  console.log(`\nDone: done=${results.done.length} errors=${results.errors.length} skipped=${results.skipped} (base: ${BASE_URL})`);
  if (results.errors.length) {
    console.log('\nErrors:');
    for (const e of results.errors) console.log(`  - ${e.label}: ${e.error}`);
  }
  if (!approve && results.done.length) {
    console.log('\nApprove in moderation queue:');
    for (const d of results.done) console.log(`  node admin/src/cli.js approve ${d.id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
