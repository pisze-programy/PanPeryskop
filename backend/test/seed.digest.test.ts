import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeSeedProviders, recordSeedDigest, snitchReport, checkDigestIncomplete } from '../src/seed/digest';

// In-memory D1 for the digest tables (seed_digest / seed_digest_done / seed_digest_incomplete).
class MockDigestDB {
  digest = new Map<string, { day: string; provider: string; status: string; candidates: number; ingested: number; errors: number; message: string | null }>();
  done = new Set<string>();
  incomplete = new Set<string>();

  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: (string | number | null)[]) {
        const a = args.map((x) => String(x ?? ''));
        const s = String(sql);
        return {
          async first<T>(): Promise<T | null> {
            if (s.includes('SELECT status FROM seed_digest')) {
              const row = db.digest.get(`${a[0]}|${a[1]}`);
              return (row ? { status: row.status } : null) as T;
            }
            if (s.includes('COUNT(DISTINCT provider)')) {
              const n = new Set([...db.digest.values()].filter((r) => r.day === a[0]).map((r) => r.provider)).size;
              return { n } as T;
            }
            return null as T;
          },
          async all<T>(): Promise<{ results: T[] }> {
            if (s.includes('SELECT provider, status, candidates, ingested, errors FROM seed_digest')) {
              return { results: [...db.digest.values()].filter((r) => r.day === a[0]).map((r) => ({ provider: r.provider, status: r.status, candidates: r.candidates, ingested: r.ingested, errors: r.errors })) as T[] };
            }
            if (s.includes('SELECT DISTINCT provider FROM seed_digest')) {
              return { results: [...db.digest.values()].filter((r) => r.day === a[0]).map((r) => ({ provider: r.provider }) as T) };
            }
            return { results: [] as T[] };
          },
          async run(): Promise<{ meta: { changes: number } }> {
            if (s.includes('INSERT INTO seed_digest ')) {
              const [day, provider, status, candidates, ingested, errors, message] = a;
              db.digest.set(`${day}|${provider}`, { day, provider, status, candidates: Number(candidates), ingested: Number(ingested), errors: Number(errors), message });
              return { meta: { changes: 1 } };
            }
            if (s.includes('seed_digest_done')) {
              if (db.done.has(a[0])) return { meta: { changes: 0 } };
              db.done.add(a[0]);
              return { meta: { changes: 1 } };
            }
            if (s.includes('seed_digest_incomplete')) {
              if (db.incomplete.has(a[0])) return { meta: { changes: 0 } };
              db.incomplete.add(a[0]);
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 1 } };
          },
        };
      },
    };
  }
}

const DAY = '2026-08-30';
type Report = { source: string; status: string; data?: Record<string, unknown> };

function capturedReports(): { reports: Report[]; fetch: typeof fetch } {
  const reports: Report[] = [];
  const original = global.fetch;
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    reports.push({ source: body.source, status: body.status, data: body.data });
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;
  return { reports, fetch: original };
}

test('activeSeedProviders: returns the 7 automated providers, excludes facebook + disabled', () => {
  const p = activeSeedProviders();
  assert.deepEqual(p, ['cinemacity', 'going', 'helios', 'kupbilecik', 'luma', 'meetup', 'multikino'].sort());
  assert.ok(!p.includes('facebook'), 'manual facebook is not a daily job');
  assert.ok(!p.includes('maratonypolskie') && !p.includes('getyourguide'), 'disabled providers are excluded');
});

test('recordSeedDigest: dedupes a same-status retry (one email)', async () => {
  const { reports, fetch } = capturedReports();
  try {
    const db = new MockDigestDB();
    const env = { DB: db, SNITCH_URL: 'https://cf-snitch.example', SNITCH_TOKEN: 't' };
    await recordSeedDigest(env, { day: DAY, provider: 'kupbilecik', status: 'ok', candidates: 10, ingested: 9 });
    await recordSeedDigest(env, { day: DAY, provider: 'kupbilecik', status: 'ok', candidates: 10, ingested: 9 });
    const mine = reports.filter((r) => r.source === 'panperyskop/seed/kupbilecik');
    assert.equal(mine.length, 1, 'same status must not re-email');
    assert.equal(mine[0].status, 'ok');
    assert.equal(mine[0].data?.job, '1/7');
  } finally {
    global.fetch = fetch;
  }
});

test('recordSeedDigest: status change (failed → ok) emails again', async () => {
  const { reports, fetch } = capturedReports();
  try {
    const db = new MockDigestDB();
    const env = { DB: db, SNITCH_URL: 'https://cf-snitch.example', SNITCH_TOKEN: 't' };
    await recordSeedDigest(env, { day: DAY, provider: 'going', status: 'failed', message: 'boom' });
    await recordSeedDigest(env, { day: DAY, provider: 'going', status: 'ok', candidates: 5, ingested: 5 });
    const mine = reports.filter((r) => r.source === 'panperyskop/seed/going');
    assert.equal(mine.length, 2, 'failed then ok must email both states');
    assert.deepEqual(mine.map((r) => r.status), ['failed', 'ok']);
  } finally {
    global.fetch = fetch;
  }
});

test('recordSeedDigest: day-done email fires once when all 7 providers report', async () => {
  const { reports, fetch } = capturedReports();
  try {
    const db = new MockDigestDB();
    const env = { DB: db, SNITCH_URL: 'https://cf-snitch.example', SNITCH_TOKEN: 't' };
    for (const p of activeSeedProviders()) {
      await recordSeedDigest(env, { day: DAY, provider: p, status: 'ok', candidates: 3, ingested: 2 });
    }
    // Re-report one provider — must not send day-done again.
    await recordSeedDigest(env, { day: DAY, provider: 'going', status: 'ok', candidates: 3, ingested: 2 });
    const dayDone = reports.filter((r) => r.source === 'panperyskop/seed/day-done');
    assert.equal(dayDone.length, 1, 'day-done must fire exactly once');
    assert.equal(dayDone[0].status, 'ok');
    assert.equal(dayDone[0].data?.providers, 7);
  } finally {
    global.fetch = fetch;
  }
});

test('snitchReport: no-op without secrets', async () => {
  const { reports, fetch } = capturedReports();
  try {
    await snitchReport({ DB: {} as never }, 'x', 'ok');
    await snitchReport({ DB: {} as never, SNITCH_URL: 'https://x', SNITCH_TOKEN: undefined }, 'x', 'ok');
    assert.equal(reports.length, 0, 'missing secrets must not send email');
  } finally {
    global.fetch = fetch;
  }
});

test('checkDigestIncomplete: only emails missing providers after the deadline', async () => {
  const { reports, fetch } = capturedReports();
  try {
    const db = new MockDigestDB();
    const env = { DB: db, SNITCH_URL: 'https://cf-snitch.example', SNITCH_TOKEN: 't' };
    // Two providers reported; five are still missing. Fixed clock: 2026-08-24 15:00
    // Warsaw (past the 14:00 deadline for the 2026-08-30 far-edge job).
    const nowMs = Date.UTC(2026, 7, 24, 13, 0, 0);
    await recordSeedDigest(env, { day: DAY, provider: 'going', status: 'ok' });
    await recordSeedDigest(env, { day: DAY, provider: 'helios', status: 'ok' });
    await checkDigestIncomplete(env, nowMs);
    const inc = reports.filter((r) => r.source === 'panperyskop/seed/day-incomplete');
    assert.ok(inc.length >= 1, 'missing providers must be reported');
    assert.equal(inc[0].status, 'failed');
    const missing = String((inc[0].data?.missing as string) ?? '');
    assert.ok(!missing.includes('going') && !missing.includes('helios'), 'reported providers must not be in missing');
    // Second run — guarded, no duplicate.
    await checkDigestIncomplete(env, nowMs);
    assert.equal(reports.filter((r) => r.source === 'panperyskop/seed/day-incomplete').length, inc.length, 'guarded once');
  } finally {
    global.fetch = fetch;
  }
});
