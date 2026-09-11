import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planSeedUnits,
  writeDayUnits,
  claimUnit,
  completeUnit,
  failUnit,
  watchdogUnits,
  unitDayStatus,
  MAX_UNIT_ATTEMPTS,
} from '../src/seed/pipeline/queue/units';

interface UnitRow {
  id: string; day: string; batch_id: string; provider: string; slice: string;
  executor: string; kind: string; generation: number; status: string; attempts: number; claimed_by: string | null;
  claimed_at: number | null; lease_expires_at: number | null; rows_written: number;
  error: string | null; created_at: number; updated_at: number;
}

// Minimal in-memory D1 for seed_units: dispatches on SQL shape.
class MockUnitsDB {
  units = new Map<string, UnitRow>();
  now = 1_000_000;

  prepare(sql: string) {
    const db = this;
    const make = (args: (string | number | null)[]) => ({
      async first<T>(): Promise<T | null> {
        if (sql.includes("status='pending' OR (status='claimed'")) {
          const [executor, t] = args as [string, number];
          const row = [...db.units.values()]
            .filter((u) => u.executor === executor && (u.status === 'pending' || (u.status === 'claimed' && (u.lease_expires_at ?? 0) < t)))
            .sort((a, b) => a.created_at - b.created_at)[0];
          return (row ? { id: row.id } : null) as T;
        }
        if (sql.includes('claimed_by=?')) {
          const [id, token] = args as [string, string];
          const row = db.units.get(id);
          if (!row || row.claimed_by !== token) return null as T;
          return {
            id: row.id, day: row.day, batch_id: row.batch_id, provider: row.provider,
            slice: row.slice, executor: row.executor, kind: row.kind, generation: row.generation, attempts: row.attempts,
          } as T;
        }
        return null as T;
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (sql.includes('GROUP BY status')) {
          const [day] = args as [string];
          const counts = new Map<string, number>();
          for (const u of db.units.values()) {
            if (u.day !== day) continue;
            counts.set(u.status, (counts.get(u.status) ?? 0) + 1);
          }
          return { results: [...counts].map(([status, n]) => ({ status, n }) as T) };
        }
        return { results: [] as T[] };
      },
      async run(): Promise<{ meta: { changes: number } }> {
        if (sql.includes('INSERT OR IGNORE INTO seed_units')) {
          const [id, day, batch_id, provider, slice, executor, kind, generation, t1, t2] = args as
            [string, string, string, string, string, string, string, number, number, number];
          const dup = [...db.units.values()].some(
            (u) => u.day === day && u.provider === provider && u.slice === slice && u.kind === kind,
          );
          if (dup) return { meta: { changes: 0 } };
          db.units.set(id, {
            id, day, batch_id, provider, slice, executor, kind, generation, status: 'pending',
            attempts: 0, claimed_by: null, claimed_at: null, lease_expires_at: null,
            rows_written: 0, error: null, created_at: t1, updated_at: t2,
          });
          return { meta: { changes: 1 } };
        }
        if (sql.includes("SET status='claimed'")) {
          const [token, claimedAt, lease, t] = args as [string, number, number, number];
          const id = args[4] as string;
          const t2 = args[5] as number;
          const row = db.units.get(id);
          const claimable = row && (row.status === 'pending' || (row.status === 'claimed' && (row.lease_expires_at ?? 0) < t2));
          if (!claimable) return { meta: { changes: 0 } };
          row!.status = 'claimed';
          row!.claimed_by = token;
          row!.claimed_at = claimedAt;
          row!.lease_expires_at = lease;
          row!.attempts += 1;
          row!.updated_at = t;
          return { meta: { changes: 1 } };
        }
        if (sql.includes("SET status='done'")) {
          const [rows, t, id, token] = args as [number, number, string, string];
          const row = db.units.get(id);
          if (!row || row.status !== 'claimed' || row.claimed_by !== token) return { meta: { changes: 0 } };
          row.status = 'done';
          row.rows_written = rows;
          row.updated_at = t;
          return { meta: { changes: 1 } };
        }
        if (sql.includes("error='lease expired after max attempts'")) {
          const [t, t2, maxAttempts] = args as [number, number, number];
          let n = 0;
          for (const row of db.units.values()) {
            if (row.status === 'claimed' && (row.lease_expires_at ?? 0) < t2 && row.attempts >= maxAttempts) {
              row.status = 'failed'; row.error = 'lease expired after max attempts'; row.updated_at = t; n++;
            }
          }
          return { meta: { changes: n } };
        }
        if (sql.includes("SET status='failed'")) {
          const [error, t, id, token] = args as [string, number, string, string];
          const row = db.units.get(id);
          if (!row || row.status !== 'claimed' || row.claimed_by !== token) return { meta: { changes: 0 } };
          row.status = 'failed';
          row.error = error;
          row.updated_at = t;
          return { meta: { changes: 1 } };
        }
        if (sql.includes("SET status='pending', claimed_by=NULL")) {
          const [t, t2, maxAttempts] = args as [number, number, number];
          let n = 0;
          for (const row of db.units.values()) {
            if (row.status === 'claimed' && (row.lease_expires_at ?? 0) < t2 && row.attempts < maxAttempts) {
              row.status = 'pending'; row.claimed_by = null; row.claimed_at = null; row.lease_expires_at = null; row.updated_at = t; n++;
            }
          }
          return { meta: { changes: n } };
        }
        return { meta: { changes: 0 } };
      },
    });
    return {
      bind(...args: (string | number | null)[]) {
        return make(args);
      },
    };
  }

  async batch(stmts: { run: () => Promise<unknown> }[]): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }
}

const db = () => new MockUnitsDB() as unknown as D1Database;
const plan = (gen = 1) => planSeedUnits({ windowStart: '2026-09-08', days: ['2026-09-08'], batchId: 'b1', generation: gen });

test('planSeedUnits: day providers one unit per scope; window providers one per scope; manual skipped', () => {
  const units = plan(7);
  assert.ok(units.length > 0);
  const byProvider = new Map<string, { executor: string; kind: string }>();
  for (const u of units) {
    assert.equal(u.batch_id, 'b1');
    assert.equal(u.generation, 7);
    if (!byProvider.has(u.provider)) byProvider.set(u.provider, { executor: u.executor, kind: u.kind });
    else assert.equal(byProvider.get(u.provider)!.executor, u.executor, 'one executor per provider');
  }
  assert.ok(!byProvider.has('facebook'));
  assert.equal(byProvider.get('kupbilecik')!.executor, 'worker');
  assert.equal(byProvider.get('helios')!.kind, 'window');
  assert.equal(byProvider.get('cinemacity')!.kind, 'day');
  const helios = units.filter((u) => u.provider === 'helios');
  assert.ok(helios.length > 0 && helios.every((u) => u.day === '2026-09-08' && u.kind === 'window'));
});

test('planSeedUnits: day providers emit one unit per day; window providers once', () => {
  const days = ['2026-09-08', '2026-09-09', '2026-09-10'];
  const units = planSeedUnits({ windowStart: days[0], days, batchId: 'b1', generation: 1 });
  assert.deepEqual([...new Set(units.filter((u) => u.provider === 'cinemacity').map((u) => u.day))].sort(), days);
  assert.deepEqual([...new Set(units.filter((u) => u.provider === 'helios').map((u) => u.day))], [days[0]]);
});

test('claim returns a token; only that token can complete', async () => {
  const d = db();
  const units = plan().slice(0, 3);
  await writeDayUnits(d, units, 1000, 90);
  await writeDayUnits(d, units, 1000, 90); // idempotent

  const w1 = await claimUnit(d, 'worker');
  assert.ok(w1 && w1.token, 'first claim returns a token');
  const w2 = await claimUnit(d, 'worker');
  assert.ok(w2 && w2.id !== w1!.id, 'second claim gets a different unit');
  assert.equal((w1 as { attempts: number }).attempts, 1);

  assert.equal(await completeUnit(d, w1!.id, 'wrong-token', 5), false, 'wrong token cannot complete');
  assert.equal(await completeUnit(d, w1!.id, w1!.token, 12), true, 'owner completes');
});

test('fail requires the owner token too', async () => {
  const d = db();
  await writeDayUnits(d, plan().slice(0, 2), 1000, 90);
  const u = await claimUnit(d, 'vps');
  assert.ok(u);
  assert.equal(await failUnit(d, u!.id, 'nope', 'boom'), false);
  assert.equal(await failUnit(d, u!.id, u!.token, 'boom'), true);
});

test('claim re-claims an expired lease; watchdog requeues/fails by attempts', async () => {
  const mock = new MockUnitsDB();
  const d = mock as unknown as D1Database;
  await writeDayUnits(d, plan().slice(0, 2), 1000, 90);

  // Claim one and expire its lease.
  const u = await claimUnit(d, 'worker');
  assert.ok(u);
  mock.units.get(u!.id)!.lease_expires_at = 0; // already expired

  // Watchdog requeues it (attempts=1 < MAX).
  const wd = await watchdogUnits(d);
  assert.equal(wd.requeued, 1);

  // A poison unit: attempts at the cap stays failed after lease expiry.
  const u2 = await claimUnit(d, 'worker');
  assert.ok(u2);
  mock.units.get(u2!.id)!.attempts = MAX_UNIT_ATTEMPTS;
  mock.units.get(u2!.id)!.lease_expires_at = 0;
  const wd2 = await watchdogUnits(d);
  assert.equal(wd2.failed, 1);
});

test('unitDayStatus counts by status', async () => {
  const d = db();
  const u = plan().slice(0, 2);
  await writeDayUnits(d, u, 1000, 90);
  const c = await claimUnit(d, 'worker');
  await completeUnit(d, c!.id, c!.token, 3);
  const counts = await unitDayStatus(d, '2026-09-08');
  assert.equal(counts.done, 1);
  assert.equal(counts.pending, 1);
  assert.deepEqual(await unitDayStatus(d, '2026-09-01'), {});
});
