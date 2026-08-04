#!/usr/bin/env node
// Backfill existing media in R2 + D1:
//  - photos: re-compress to max 1080px (overwrite media object), add 320px thumb
//  - videos: add 320px thumb (frame extraction via ffmpeg), keep video as-is
//  - sets thumb_key in D1 for every post
//
// Requirements:
//  - wrangler authenticated with the SAME account that owns the R2 bucket
//    (run `wrangler whoami`; the deployed Worker uses `dev-4cb` account)
//  - `sips` (macOS) and `ffmpeg` on PATH
//  - run from repo root:  node admin/scripts/backfill-media.mjs
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, '../../backend');
const BUCKET = 'panperyskop-media';
const BASE = process.env.MEDIA_BASE ?? 'https://panperyskop-api.dev-4cb.workers.dev/media';
const PHOTO_MAX = 1080;
const THUMB_MAX = 320;

const run = (cmd, cwd = BACKEND_DIR) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function posts() {
  const out = run(
    `npx wrangler d1 execute panperyskop-db --remote --json --command "SELECT id, type, status, media_key, thumb_key FROM posts WHERE media_key IS NOT NULL ORDER BY created_at"`
  );
  const parsed = JSON.parse(out);
  return parsed[0]?.results ?? [];
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  const all = posts();
  const targets = all.filter((p) => p.media_key);
  console.log(`Found ${all.length} posts with media, ${targets.length} to process.`);
  const tmp = mkdtempSync(join(tmpdir(), 'pp-backfill-'));
  const ok = [];
  const failed = [];

  for (const post of targets) {
    const id = post.id;
    const key = post.media_key;
    const url = `${BASE}/${key}`;
    const ext = key.endsWith('.mp4') ? 'mp4' : 'jpg';
    try {
      const srcMedia = join(tmp, `${id}.src.${ext}`);
      const outMedia = join(tmp, `${id}.media.${ext}`);
      const outThumb = join(tmp, `${id}.thumb.jpg`);
      const before = await download(url, srcMedia);

      if (ext === 'mp4') {
        run(`ffmpeg -y -i "${srcMedia}" -ss 00:00:00.5 -vframes 1 -vf "scale='min(${THUMB_MAX},iw)':-2" "${outThumb}" 2>/dev/null || ffmpeg -y -i "${srcMedia}" -vframes 1 -vf "scale='min(${THUMB_MAX},iw)':-2" "${outThumb}"`);
        run(`npx wrangler r2 object put ${BUCKET}/posts/${id}/thumb.jpg --file "${outThumb}" --remote`);
      } else {
        run(`sips -Z ${PHOTO_MAX} -s format jpeg "${srcMedia}" --out "${outMedia}" >/dev/null 2>&1`);
        const after = (await import('node:fs')).statSync(outMedia).size;
        if (after > 0 && after < before) {
          run(`npx wrangler r2 object put ${BUCKET}/${key} --file "${outMedia}" --remote`);
          console.log(`  photo ${id}: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`);
        } else {
          console.log(`  photo ${id}: skip overwrite (${(before / 1024).toFixed(0)}KB, resized ${(after / 1024).toFixed(0)}KB)`);
        }
        run(`sips -Z ${THUMB_MAX} -s format jpeg "${srcMedia}" --out "${outThumb}" >/dev/null 2>&1`);
        run(`npx wrangler r2 object put ${BUCKET}/posts/${id}/thumb.jpg --file "${outThumb}" --remote`);
      }

      if (!post.thumb_key || post.thumb_key !== `posts/${id}/thumb.jpg`) {
        run(
          `npx wrangler d1 execute panperyskop-db --remote --command "UPDATE posts SET thumb_key='posts/${id}/thumb.jpg' WHERE id='${id}'"`
        );
      }
      ok.push(id);
      console.log(`✓ ${id} (${post.type})`);
    } catch (e) {
      failed.push(id);
      console.error(`✗ ${id}: ${e.message}`);
    }
  }

  rmSync(tmp, { recursive: true, force: true });
  console.log(`\nDone. OK=${ok.length} failed=${failed.length}`);
  if (failed.length) console.log('Failed:', failed.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
