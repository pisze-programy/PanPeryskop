import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, parseArgs, configFromEnv, TTL_MS, MAX_LOOKAHEAD_MS, USAGE } from '../src/seed/cli.mjs';

// ---------- parseArgs ----------

test('parseArgs: bare manifest → no flags', () => {
  assert.deepEqual(parseArgs(['events.json']), { fileArg: 'events.json', force: false, approve: false });
});

test('parseArgs: flags anywhere are picked up, first non-flag is the file', () => {
  assert.deepEqual(parseArgs(['--force', 'events.json', '--approve']), { fileArg: 'events.json', force: true, approve: true });
});

test('parseArgs: no file → undefined', () => {
  assert.deepEqual(parseArgs(['--force']), { fileArg: undefined, force: true, approve: false });
});

// ---------- configFromEnv ----------

test('configFromEnv: defaults', () => {
  assert.deepEqual(configFromEnv({}), {
    baseUrl: 'https://api.panperyskop.app',
    deviceId: 'panperyskop-seed',
    adminSecret: undefined,
  });
});

test('configFromEnv: overrides', () => {
  assert.deepEqual(configFromEnv({ BASE_URL: 'http://x', SEED_DEVICE_ID: 'd', ADMIN_SECRET: 's' }), {
    baseUrl: 'http://x', deviceId: 'd', adminSecret: 's',
  });
});

// ---------- runCli ----------

function makeDeps(over = {}) {
  const calls = { logs: [], errors: [], written: [], renamed: [], rm: [], optimize: [], apiConfig: null, ctx: null, ingestArgs: null };
  const deps = {
    readFileSync: () => JSON.stringify([{ external_id: 'e1' }]),
    writeFileSync: (p, d) => calls.written.push({ p, d }),
    renameSync: (a, b) => calls.renamed.push({ a, b }),
    mkdtempSync: () => '/tmp/seed-xyz',
    rmSync: (...a) => calls.rm.push(a),
    existsSync: () => true,
    tmpdir: () => '/tmp',
    createApi: (cfg) => { calls.apiConfig = cfg; return { login: async () => 't' }; },
    optimize: (...a) => { calls.optimize.push(a); return { type: 'photo' }; },
    run: () => {},
    now: () => 42,
    ingestEvents: async (args) => { calls.ingestArgs = args; return { done: [], errors: [], skipped: 0 }; },
    log: (m) => calls.logs.push(m),
    error: (m) => calls.errors.push(m),
    ...over,
  };
  return { deps, calls };
}

test('runCli: no manifest → usage to stderr, exit 1, nothing read/written', async () => {
  const { deps, calls } = makeDeps({ readFileSync: () => { throw new Error('should not read'); } });
  const code = await runCli({ argv: [], env: {}, deps });
  assert.equal(code, 1);
  assert.deepEqual(calls.errors, [USAGE]);
  assert.equal(calls.written.length, 0);
});

test('runCli: --approve without ADMIN_SECRET → exit 1', async () => {
  const { deps, calls } = makeDeps();
  const code = await runCli({ argv: ['events.json', '--approve'], env: {}, deps });
  assert.equal(code, 1);
  assert.deepEqual(calls.errors, ['--approve requires ADMIN_SECRET env']);
});

test('runCli: happy path → exit 0, manifest written via tmp+rename, tmp removed', async () => {
  const { deps, calls } = makeDeps({
    ingestEvents: async () => ({ done: [{ id: 'p1', label: 'e1' }], errors: [], skipped: 0 }),
  });
  const code = await runCli({ argv: ['events.json'], env: { BASE_URL: 'http://x' }, deps });
  assert.equal(code, 0);
  // manifest rewritten through a .tmp file then renamed onto the original
  assert.equal(calls.written.length, 1);
  assert.match(calls.written[0].p, /events\.json\.tmp$/);
  assert.equal(calls.renamed.length, 1);
  assert.match(calls.renamed[0].b, /events\.json$/);
  assert.equal(calls.rm.length, 1);
  assert.ok(calls.logs.some((l) => /Done: done=1 errors=0 skipped=0/.test(l)));
  // not approving → prints the moderation-queue hint
  assert.ok(calls.logs.some((l) => /Approve in moderation queue/.test(l)));
});

test('runCli: --approve suppresses the moderation-queue hint', async () => {
  const { deps, calls } = makeDeps({
    ingestEvents: async () => ({ done: [{ id: 'p1', label: 'e1' }], errors: [], skipped: 0 }),
  });
  const code = await runCli({ argv: ['events.json', '--approve'], env: { ADMIN_SECRET: 's' }, deps });
  assert.equal(code, 0);
  assert.equal(calls.logs.some((l) => /Approve in moderation queue/.test(l)), false);
});

test('runCli: errors are listed in the report', async () => {
  const { deps, calls } = makeDeps({
    ingestEvents: async () => ({ done: [], errors: [{ label: 'e1', error: 'boom' }], skipped: 0 }),
  });
  const code = await runCli({ argv: ['events.json'], env: {}, deps });
  assert.equal(code, 0);
  assert.ok(calls.logs.includes('\nErrors:'));
  assert.ok(calls.logs.some((l) => /- e1: boom/.test(l)));
});

test('runCli: wiring — api built from env config, ctx carries force/baseUrl/now/limits', async () => {
  const { deps, calls } = makeDeps();
  await runCli({ argv: ['events.json', '--force'], env: { BASE_URL: 'http://x', SEED_DEVICE_ID: 'dev', ADMIN_SECRET: 'sec' }, deps });
  assert.deepEqual(calls.apiConfig, { baseUrl: 'http://x', deviceId: 'dev', adminSecret: 'sec' });
  assert.equal(calls.ctx, null); // ctx captured via ingestEvents instead
  assert.equal(calls.ingestArgs.ctx.force, true);
  assert.equal(calls.ingestArgs.ctx.baseUrl, 'http://x');
  assert.equal(calls.ingestArgs.ctx.now, 42);
  assert.equal(calls.ingestArgs.ctx.ttlMs, TTL_MS);
  assert.equal(calls.ingestArgs.ctx.maxLookaheadMs, MAX_LOOKAHEAD_MS);
  // io.media.optimize closes over deps.run + the created tmp dir
  calls.ingestArgs.io.media.optimize('/src/poster.jpg');
  assert.deepEqual(calls.optimize[0], [deps.run, '/src/poster.jpg', '/tmp/seed-xyz']);
});

test('runCli: manifest read/parse failure → exit 1, error logged (no crash)', async () => {
  const { deps, calls } = makeDeps({ readFileSync: () => { throw new Error('ENOENT'); } });
  const code = await runCli({ argv: ['missing.json'], env: {}, deps });
  assert.equal(code, 1);
  assert.ok(calls.errors.some((e) => /ENOENT/.test(String(e))));
  assert.equal(calls.written.length, 0);
});

test('runCli: ingestEvents throw → exit 1, error logged, manifest NOT written', async () => {
  const { deps, calls } = makeDeps({ ingestEvents: async () => { throw new Error('fatal'); } });
  const code = await runCli({ argv: ['events.json'], env: {}, deps });
  assert.equal(code, 1);
  assert.equal(calls.written.length, 0);
  assert.equal(calls.rm.length, 0);
  assert.ok(calls.errors.some((e) => /fatal/.test(String(e))));
});

test('runCli: defaults to console.log/console.error/Date.now when not provided', async () => {
  const logs = [];
  const origLog = console.log, origErr = console.error;
  console.log = (m) => logs.push(m);
  console.error = (m) => logs.push(m);
  try {
    const { deps } = makeDeps({ log: undefined, error: undefined, now: undefined });
    const code = await runCli({ argv: [], env: {}, deps });
    assert.equal(code, 1);
    assert.ok(logs.includes(USAGE));
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
});