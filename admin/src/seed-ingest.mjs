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
//   BASE_URL       default https://panperyskop-api.dev-4cb.workers.dev (remote)
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
const BASE_URL = process.env.BASE_URL || 'https://panperyskop-api.dev-4cb.workers.dev';
const SEED_DEVICE_ID = process.env.SEED_DEVICE_ID || 'panperyskop-seed';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const PHOTO_MAX = 1080;
const THUMB_MAX = 320;
const TTL_MS = 24 * 3_600_000;
const MAX_LOOKAHEAD_MS = 366 * 24 * 3_600_000;

const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'pipe'] });

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
// portrait already, so orientation correction is unnecessary.
function compressImage(src, out, max) {
  if (process.platform === 'darwin') {
    run(`sips -Z ${max} -s format jpeg "${src}" --out "${out}"`);
  } else {
    run(`convert "${src}" -resize ${max}x${max}\\> -quality 85 "${out}"`);
  }
}

async function login() {
  const res = await fetch(`${BASE_URL}/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: SEED_DEVICE_ID }),
  });
  if (!res.ok) throw new Error(`auth/device -> ${res.status}`);
  return (await res.json()).session_token;
}

async function upload(token, entry, media, createdAt) {
  const form = new FormData();
  form.append('type', media.type);
  form.append('lat', String(entry.lat));
  form.append('lng', String(entry.lng));
  form.append('description', entry.description || entry.title || '');
  form.append('created_at', String(createdAt));
  form.append('is_sponsored', '1');
  if (entry.link) form.append('link_url', entry.link);
  form.append('external_id', entry.external_id);
  form.append('file', new Blob([media.file], { type: media.mime }), media.fileName);
  form.append('thumb', new Blob([media.thumb], { type: 'image/jpeg' }), 'thumb.jpg');

  const res = await fetch(`${BASE_URL}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST /posts -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function approvePost(id) {
  const res = await fetch(`${BASE_URL}/admin/posts/${id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
  });
  if (!res.ok) throw new Error(`approve ${id} -> ${res.status}`);
}

async function main() {
  const token = await login();
  const tmp = mkdtempSync(join(tmpdir(), 'pp-seed-'));
  const results = { done: [], errors: [], skipped: 0 };

  for (let i = 0; i < events.length; i++) {
    const entry = events[i];
    const label = entry.external_id || entry.title || `#${i}`;

    if (entry.status === 'done' && !force) {
      results.skipped += 1;
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
      const data = await upload(token, entry, media, createdAt);

      entry.status = 'done';
      entry.post_id = data.id;
      entry.error = null;

      if (approve) {
        await approvePost(data.id);
        results.done.push({ id: data.id, label, approved: true });
      } else {
        results.done.push({ id: data.id, label, approved: false });
      }
      console.log(`✓ ${label} -> ${data.id} (${media.type}, created_at ${new Date(createdAt).toISOString()})`);
    } catch (e) {
      entry.status = 'error';
      entry.error = e.message;
      results.errors.push({ label, error: e.message });
      console.error(`✗ ${label}: ${e.message}`);
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
