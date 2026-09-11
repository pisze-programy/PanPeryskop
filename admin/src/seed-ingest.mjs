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
import { mkdtempSync, rmSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createApi } from './seed/api.mjs';
import { optimize, run } from './seed/media.mjs';
import { ingestEvents } from './seed/ingest.mjs';
import { runCli } from './seed/cli.mjs';

process.exitCode = await runCli({
  argv: process.argv.slice(2),
  env: process.env,
  deps: {
    readFileSync, writeFileSync, renameSync, mkdtempSync, rmSync, existsSync, tmpdir,
    createApi, optimize, run, ingestEvents,
    now: Date.now, log: console.log, error: console.error,
  },
});