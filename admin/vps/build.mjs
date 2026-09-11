#!/usr/bin/env node
// Build the VPS executables into self-contained bundles.
//   node admin/vps/build.mjs
// Outputs:
//   backend/dist/vps-seed.mjs — the orchestrator (all providers).
//   backend/dist/kup-warm.mjs — the standalone kupbilecik warm (tiny footprint:
//     imports only the kupbilecik module, NOT the whole orchestrator — the 256 MB
//     box OOM'd when the full bundle ran the warm).
// ONE node process each, no tsx/esbuild at runtime (that blew the 256 MB box).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BACKEND = join(ROOT, 'backend');
const OUT_DIR = join(BACKEND, 'dist');
const ESBUILD = join(BACKEND, 'node_modules', '.bin', 'esbuild');

mkdirSync(OUT_DIR, { recursive: true });

function build(entry, out) {
  execFileSync(ESBUILD, [
    entry,
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--external:node:*',
    `--outfile=${out}`,
  ], { stdio: 'inherit' });
  console.log(`built ${out}`);
}

build(join(BACKEND, 'src', 'seed', 'executors', 'vps', 'index.ts'), join(OUT_DIR, 'vps-seed.mjs'));
build(join(BACKEND, 'src', 'seed', 'executors', 'vps', 'consumer.ts'), join(OUT_DIR, 'seed-consumer.mjs'));
build(join(BACKEND, 'src', 'seed', 'executors', 'vps', 'kupWarmCli.ts'), join(OUT_DIR, 'kup-warm.mjs'));
build(join(BACKEND, 'src', 'seed', 'executors', 'vps', 'awinWarmCli.ts'), join(OUT_DIR, 'awin-warm.mjs'));
build(join(BACKEND, 'src', 'seed', 'executors', 'vps', 'espnCli.ts'), join(OUT_DIR, 'travel-espn.mjs'));
