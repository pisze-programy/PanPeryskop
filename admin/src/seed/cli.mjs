// CLI orchestration for the seed ingest, extracted from the entry point so it
// can be unit-tested with injected dependencies. seed-ingest.mjs is the thin
// real entry that wires the concrete deps.
import { dirname, join, resolve } from 'node:path';

export const TTL_MS = 24 * 3_600_000;
export const MAX_LOOKAHEAD_MS = 366 * 24 * 3_600_000;
export const USAGE = 'Usage: node admin/src/seed-ingest.mjs <events.json> [--force] [--approve]';

/** argv (without node/script) → { fileArg, force, approve }. */
export function parseArgs(argv) {
  return {
    fileArg: argv.find((a) => !a.startsWith('--')),
    force: argv.includes('--force'),
    approve: argv.includes('--approve'),
  };
}

/** Env → config with defaults. */
export function configFromEnv(env) {
  return {
    baseUrl: env.BASE_URL || 'https://api.panperyskop.app',
    deviceId: env.SEED_DEVICE_ID || 'panperyskop-seed',
    adminSecret: env.ADMIN_SECRET,
  };
}

/**
 * Run the ingest. `deps` injects every side effect:
 *   readFileSync, writeFileSync, renameSync, mkdtempSync, rmSync, existsSync,
 *   tmpdir, createApi, optimize, run, ingestEvents, now, log, error
 * Returns the process exit code (0 ok, 1 usage/error) — never calls process.exit.
 */
export async function runCli({ argv, env, deps }) {
  const log = deps.log || console.log;
  const error = deps.error || console.error;
  const now = deps.now || Date.now;

  const { fileArg, force, approve } = parseArgs(argv);
  if (!fileArg) {
    error(USAGE);
    return 1;
  }

  const config = configFromEnv(env);
  if (approve && !config.adminSecret) {
    error('--approve requires ADMIN_SECRET env');
    return 1;
  }

  try {
    const jsonPath = resolve(fileArg);
    const baseDir = dirname(jsonPath);
    const events = JSON.parse(deps.readFileSync(jsonPath, 'utf8'));

    const api = deps.createApi(config);
    const tmpDir = deps.mkdtempSync(join(deps.tmpdir(), 'pp-seed-'));
    const io = {
      api,
      fs: { existsSync: deps.existsSync },
      media: { optimize: (src) => deps.optimize(deps.run, src, tmpDir) },
    };
    const ctx = {
      force, baseDir, baseUrl: config.baseUrl, now: now(),
      ttlMs: TTL_MS, maxLookaheadMs: MAX_LOOKAHEAD_MS,
    };

    const results = await deps.ingestEvents({ events, io, ctx });

    deps.rmSync(tmpDir, { recursive: true, force: true });
    const tmpOut = `${jsonPath}.tmp`;
    deps.writeFileSync(tmpOut, JSON.stringify(events, null, 2) + '\n');
    deps.renameSync(tmpOut, jsonPath);

    log(`\nDone: done=${results.done.length} errors=${results.errors.length} skipped=${results.skipped} (base: ${config.baseUrl})`);
    if (results.errors.length) {
      log('\nErrors:');
      for (const e of results.errors) log(`  - ${e.label}: ${e.error}`);
    }
    if (!approve && results.done.length) {
      log('\nApprove in moderation queue:');
      for (const d of results.done) log(`  node admin/src/cli.js approve ${d.id}`);
    }
    return 0;
  } catch (e) {
    error(e);
    return 1;
  }
}