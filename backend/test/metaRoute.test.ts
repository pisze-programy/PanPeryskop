import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { metaRoutes } from '../src/api/meta';

const TOKEN = 'client-token-under-test';
const EXTINFO = ['i2', 'pl.piszeprogramy.panperyskop', '1.3.1', '108', '18.0', 'iPhone15,2', 'pl_PL', 'GMT+2', '', '1179', '2556', '3', '6', '64', '32', 'Europe/Warsaw'];

function env(withToken = true): Env {
  return (withToken ? { META_CLIENT_TOKEN: TOKEN } : {}) as unknown as Env;
}

function report(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event_id: 'event-1234',
    kind: 'banner',
    content_id: 'verify.example',
    label: 'verify',
    anon_id: 'anon-1234',
    tracking_enabled: 0,
    extinfo: EXTINFO,
    ...overrides,
  });
}

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

async function post(body: string, header?: string, withToken = true): Promise<number> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (header) headers['x-pp-client'] = header;
  const res = await metaRoutes.request('/checkout', { method: 'POST', headers, body }, env(withToken), CTX);
  return res.status;
}

test('the endpoint rejects a missing header', async () => {
  assert.equal(await post(report()), 401);
});

test('the endpoint rejects a wrong header', async () => {
  assert.equal(await post(report(), 'not-the-token'), 401);
});

test('the endpoint is closed when the token var is absent', async () => {
  assert.equal(await post(report(), undefined, false), 401);
});

test('the endpoint accepts a well formed report', async () => {
  assert.equal(await post(report(), TOKEN), 200);
});

test('the endpoint accepts a long content id and label', async () => {
  const longId = 'worldsmarathons:thames-meander-autumn-10km-half-marathon-marathon';
  assert.ok(longId.length > 64);
  assert.equal(await post(report({ content_id: longId, label: longId }), TOKEN), 200);
});

test('the endpoint rejects a report without a content id', async () => {
  assert.equal(await post(report({ content_id: undefined }), TOKEN), 400);
});

test('the endpoint rejects an unknown kind', async () => {
  assert.equal(await post(report({ kind: 'spaceship' }), TOKEN), 400);
});

test('the endpoint rejects a short extinfo array', async () => {
  assert.equal(await post(report({ extinfo: ['i2'] }), TOKEN), 400);
});

test('the app and the Worker agree on the referral kinds', () => {
  const swift = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ios', 'PanPeryskop', 'Services', 'Meta', 'MetaTaxonomy.swift'),
    'utf8'
  );
  const line = /static let referralKinds[^=]*=\s*\[([^\]]*)\]/.exec(swift);
  assert.ok(line, 'referralKinds not found in MetaTaxonomy.swift');
  const swiftKinds = line[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^\./, ''))
    .filter((entry) => entry.length > 0)
    .sort();

  const worker = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'analytics', 'meta.ts'),
    'utf8'
  );
  const workerLine = /const REFERRAL_KINDS\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(worker);
  assert.ok(workerLine, 'REFERRAL_KINDS not found in analytics/meta.ts');
  const workerKinds = workerLine[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^'|'$/g, ''))
    .filter((entry) => entry.length > 0)
    .sort();

  assert.deepEqual(swiftKinds, workerKinds, 'the SDK event name and the CAPI event name would diverge, and event_id dedup would break');
});

test('every app content kind is a kind the Worker accepts', () => {
  const swift = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ios', 'PanPeryskop', 'Services', 'Analytics', 'ContentKind.swift'),
    'utf8'
  );
  const cases = [...swift.matchAll(/case ([a-z_]+)/g)].map((match) => match[1]).sort();

  const worker = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'api', 'meta.ts'),
    'utf8'
  );
  const line = /const KINDS = new Set\(\[([^\]]*)\]\)/.exec(worker);
  assert.ok(line, 'KINDS not found in api/meta.ts');
  const kinds = line[1]
    .split(',')
    .map((entry) => entry.trim().replace(/'/g, ''))
    .filter((entry) => entry.length > 0)
    .sort();

  assert.deepEqual(cases, kinds, 'a kind the app sends without a Worker entry is rejected, and the tap is lost');
});
