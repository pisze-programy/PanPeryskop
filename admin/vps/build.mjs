#!/usr/bin/env node
// Build the VPS seed into a single self-contained bundle.
//   node admin/vps/build.mjs
// Output: backend/dist/vps-seed.mjs — run on the VPS as `node vps-seed.mjs`.
// ONE node process, no tsx/esbuild at runtime (that's what blew the 256 MB box).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BACKEND = join(ROOT, 'backend');
const ENTRY = join(BACKEND, 'src', 'seed', 'executors', 'vps', 'index.ts');
const OUT_DIR = join(BACKEND, 'dist');
const OUT = join(OUT_DIR, 'vps-seed.mjs');
const ESBUILD = join(BACKEND, 'node_modules', '.bin', 'esbuild');

mkdirSync(OUT_DIR, { recursive: true });
execFileSync(ESBUILD, [
  ENTRY,
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--external:node:*',
  `--outfile=${OUT}`,
], { stdio: 'inherit' });
console.log(`built ${OUT}`);
