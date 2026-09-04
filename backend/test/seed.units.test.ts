import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planDayUnits,
  writeDayUnits,
  claimUnit,
  completeUnit,
  failUnit,
  unitDayStatus,
} from '../src/seed/pipeline/queue/units';

interface UnitRow {
  id: string; day: string; batch_id: string; provider: string; slice: string;
  executor: string; status: string; attempts: number; claimed_by: string | null;
  claimed_at: number | null; lease_expires_at: number | null; rows_written: number;
  error: string | null; created_at: number; updated_at: number;
}

// Minimal in-memory D1 for seed_units: dispatches on SQL shape, like MockDigestDB.
class MockUnitsDB {
  units = new Map<string, UnitRow>();

  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: (string | number | null)[]) {
        return {
          async first<T>(): Promise<T | null> {
            if (sql.includes("status='pending' AND executor=")) {
              const [executor] = args as [string];
              const row = [...db.units.values()]
                .filter((u) => u.status === 'pending' && u.executor === executor)
                .sort((a, b) => a.created_at - b.created_at)[0];
              return (row ? { id: row.id } : null) as T;
            }
            if (sql.includes('claimed_by=?')) {
              const [id, token] = args as [string, string];
              const row = db.units.get(id);
              if (!row || row.claimed_by !== token) return null as T;
              return {
                id: row.id, day: row.day, batch_id: row.batch_id, provider: row.provider,
                slice: row.slice, executor: row.executor, attempts: row.attempts,
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
              const [id, day, batch_id, provider, slice, executor, , , t1, t2] = args as
                [string, string, string, string, string, string, string, number, number, number, number];
              const dup = [...db.units.values()].some(
                (u) => u.day === day && u.provider === provider && u.slice === slice,
              );
              if (dup) return { meta: { changes: 0 } };
              db.units.set(id, {
                id, day, batch_id, provider, slice, executor, status: 'pending',
                attempts: 0, claimed_by: null, claimed_at: null, lease_expires_at: null,
                rows_written: 0, error: null, created_at: t1, updated_at: t2,
              });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET status='claimed'")) {
              const [token, claimedAt, lease, t, id] = args as [string, number, number, number, string];
              const row = db.units.get(id);
              if (!row || row.status !== 'pending') return { meta: { changes: 0 } };
              row.status = 'claimed';
              row.claimed_by = token;
              row.claimed_at = claimedAt;
              row.lease_expires_at = lease;
              row.attempts += 1;
              row.updated_at = t;
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET status='done'")) {
              const [rows, t, id] = args as [number, number, string];
              const row = db.units.get(id);
              if (!row || (row.status !== 'claimed' && row.status !== 'pending')) return { meta: { changes: 0 } };
              row.status = 'done';
              row.rows_written = rows;
              row.updated_at = t;
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET status='failed'")) {
              const [error, t, id] = args as [string, number, string];
              const row = db.units.get(id);
              if (!row) return { meta: { changes: 0 } };
              row.status = 'failed';
              row.error = error;
              row.updated_at = t;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
        };
      },
    };
  }

  async batch(stmts: { bind: unknown }[]): Promise<unknown[]> {
    // Statements are already bound at prepare().bind() time in writeDayUnits —
    // but our prepare().bind() returns the executor directly, so batch() here
    // only needs to exist for the type. Real execution happened inline above
    // is NOT how it works: writeDayUnits calls db.batch(preparedArray), where each
    // prepared item is the object returned by .bind(). We execute them now.
    const out: unknown[] = [];
    for (const s of stmts) out.push(await (s as { run: () => Promise<unknown> }).run());
    return out;
  }
}

test('planDayUnits: one unit per scope, executor from registry, manual skipped', () => {
  const units = planDayUnits('2026-09-08', 'b1');
  assert.ok(units.length > 0, 'plans units');
  const byProvider = new Map<string, string>();
  for (const u of units) {
    assert.equal(u.day, '2026-09-08');
    assert.equal(u.batch_id, 'b1');
    if (!byProvider.has(u.provider)) byProvider.set(u.provider, u.executor);
    else assert.equal(byProvider.get(u.provider), u.executor, 'one executor per provider');
  }
  assert.ok(!byProvider.has('facebook'), 'manual facebook produces no units');
  assert.equal(byProvider.get('kupbilecik'), 'worker');
  assert.equal(byProvider.get('ebilet'), 'worker');
  // A VPS provider is present with executor vps (going/86+ scopes covered in code).
  assert.ok([...byProvider.values()].includes('vps'), 'vps providers planned too');
});

test('writeDayUnits + claim: exactly one winner, ownership verified', async () => {
  const db = new MockUnitsDB() as unknown as D1Database;
  const units = planDayUnits('2026-09-08', 'b1').slice(0, 3);
  await writeDayUnits(db, units, 1000, 90);
  // Idempotent re-write: UNIQUE(day,provider,slice) must not explode.
  await writeDayUnits(db, units, 1000, 90);

  const w1 = await claimUnit(db, 'worker');
  assert.ok(w1, 'first claim wins a unit');
  // Simulate a lost race: flip it back to pending behind our back is impossible
  // through the API — instead verify a second claim gets a DIFFERENT unit.
  const w2 = await claimUnit(db, 'worker');
  assert.ok(w2 && w2.id !== w1!.id, 'second claim gets a different unit');
  assert.equal((w1 as { attempts: number }).attempts, 1, 'claim bumps attempts');
});

test('completeUnit/failUnit + unitDayStatus', async () => {
  const db = new MockUnitsDB() as unknown as D1Database;
  const all = planDayUnits('2026-09-08', 'b1');
  const units = [all.find((u) => u.executor === 'worker')!, all.find((u) => u.executor === 'vps')!];
  await writeDayUnits(db, units, 1000, 90);
  const u1 = await claimUnit(db, 'worker');
  assert.ok(u1);
  assert.equal(await completeUnit(db, u1!.id, 12), true);
  assert.equal(await completeUnit(db, 'nope', 0), false, 'unknown id completes nothing');
  const u2 = await claimUnit(db, 'vps');
  assert.ok(u2, 'vps unit claimable independently');
  await failUnit(db, u2!.id, 'boom');
  const counts = await unitDayStatus(db, '2026-09-08');
  assert.equal(counts.done, 1);
  assert.equal(counts.failed, 1);
  const empty = await unitDayStatus(db, '2026-09-01');
  assert.deepEqual(empty, {}, 'no rows for other days');
});
