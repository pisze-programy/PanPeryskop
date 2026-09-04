import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDay, reconcileReady, RECONCILE_TIME_GUARD_MIN } from '../src/seed/reconcile';

interface RawRow {
  id: string; provider: string; external_id: string; title: string;
  raw_venue: string; city: string | null; canonical_venue_id: string | null;
  start_min: number; showtimes: string; showtime_booking: string;
  price_pln: number | null; is_sold_out: number; link_url: string | null;
  booking_key: string | null; status: string; winner_raw_id: string | null;
}
interface PostRow { id: string; external_id: string; status: string; locked: boolean }

// In-memory D1 honoring the SQL it receives: status transitions apply by row id,
// posts flip to rejected, failures accumulate. Mirrors the MockDigestDB pattern.
class MockReconDB {
  raw = new Map<string, RawRow>();
  posts = new Map<string, PostRow>(); // key: external_id
  failures: unknown[] = [];
  openUnits = 0;

  seedRaw(r: Partial<RawRow> & { id: string; provider: string; external_id: string }) {
    this.raw.set(r.id, {
      title: '', raw_venue: '', city: null, canonical_venue_id: null, start_min: 0,
      showtimes: '[]', showtime_booking: '[]', price_pln: null, is_sold_out: 0,
      link_url: null, booking_key: null, status: 'raw', winner_raw_id: null,
      ...r,
    } as RawRow);
  }

  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: (string | number | null)[]) {
        return {
          async first<T>(): Promise<T | null> {
            if (sql.includes('FROM seed_units')) {
              return { n: db.openUnits } as T;
            }
            return null as T;
          },
          async all<T>(): Promise<{ results: T[] }> {
            if (sql.includes('FROM seed_raw WHERE day=')) {
              return { results: [...db.raw.values()].filter((r) => r.status === 'raw') as T[] };
            }
            if (sql.includes('FROM posts') && sql.includes('external_id IN (')) {
              const ids = new Set(args.map(String));
              return {
                results: [...db.posts.values()]
                  .filter((p) => ids.has(p.external_id))
                  .map((p) => ({
                    id: p.id, external_id: p.external_id,
                    geo_locked: 0, tags_locked: 0,
                    time_locked: p.locked ? 1 : 0, sold_out_locked: 0,
                  }) as T),
              };
            }
            return { results: [] as T[] };
          },
          async run(): Promise<{ meta: { changes: number } }> {
            if (sql.includes('INSERT INTO reconciliation_failures')) {
              db.failures.push({ args });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET status='winner'")) {
              const row = db.raw.get(String(args[args.length - 1]));
              if (!row) return { meta: { changes: 0 } };
              const [showtimes, booking, price, sold, start] = args as [string, string, number | null, number, number];
              row.status = 'winner';
              (row as unknown as Record<string, unknown>).showtimes = showtimes;
              (row as unknown as Record<string, unknown>).showtime_booking = booking;
              row.price_pln = price;
              row.is_sold_out = sold;
              row.start_min = start;
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET status='duplicate'")) {
              const row = db.raw.get(String(args[args.length - 1]));
              if (!row) return { meta: { changes: 0 } };
              row.status = 'duplicate';
              row.winner_raw_id = String(args[0]);
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET status='failure'")) {
              const row = db.raw.get(String(args[args.length - 1]));
              if (!row) return { meta: { changes: 0 } };
              row.status = 'failure';
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET status='rejected'")) {
              const post = [...db.posts.values()].find((p) => p.id === String(args[args.length - 1]));
              if (!post) return { meta: { changes: 0 } };
              post.status = 'rejected';
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
        };
      },
    };
  }

  async batch(_stmts: unknown[]): Promise<unknown[]> {
    return [];
  }
}

const DAY = '2026-09-08';

function row(over: Partial<RawRow> & { id: string; provider: string; external_id: string }): Partial<RawRow> & { id: string; provider: string; external_id: string } {
  return over;
}

test('reconcileReady: gate opens only when no unit is pending/claimed', async () => {
  const db = new MockReconDB() as unknown as D1Database;
  db.openUnits = 2;
  assert.deepEqual(await reconcileReady(db, DAY), { ready: false, open: 2 });
  db.openUnits = 0;
  assert.deepEqual(await reconcileReady(db, DAY), { ready: true, open: 0 });
});

test('reconcile: solo row becomes winner, empty day is a no-op', async () => {
  const db = new MockReconDB() as unknown as D1Database;
  assert.deepEqual(await reconcileDay(db, DAY, 'b1'), { day: DAY, winners: 0, duplicates: 0, failures: 0, rejectedPosts: 0 });
  db.seedRaw(row({ id: 'r1', provider: 'kupbilecik', external_id: 'kupbilecik-1-20260908', title: 'Solo koncert', raw_venue: 'Klub X', canonical_venue_id: 'klubx', start_min: 1200, showtimes: '["20:00"]' }));
  const s = await reconcileDay(db, DAY, 'b1');
  assert.deepEqual(s, { day: DAY, winners: 1, duplicates: 0, failures: 0, rejectedPosts: 0 });
  assert.equal(db.raw.get('r1')!.status, 'winner');
});

test('reconcile: kup+ebilet same event merge, winner absorbs times/booking/price', async () => {
  const db = new MockReconDB() as unknown as D1Database;
  db.seedRaw(row({
    id: 'rk', provider: 'kupbilecik', external_id: 'kupbilecik-1-20260908',
    title: 'Berek, czyli Upiór w Moherze', raw_venue: 'Scena Relax', canonical_venue_id: 'scenarelax',
    start_min: 960, showtimes: '["16:00","19:00"]',
    showtime_booking: JSON.stringify([
      { time: '16:00', kind: 'link', params: { url: 'https://www.kupbilecik.pl/imprezy/1/' } },
      { time: '19:00', kind: 'link', params: { url: 'https://www.kupbilecik.pl/imprezy/2/' } },
    ]),
    price_pln: 140,
  }));
  db.seedRaw(row({
    id: 're', provider: 'ebilet', external_id: 'ebilet-9-20260908',
    title: 'Berek, czyli upiór w moherze', raw_venue: 'Scena Relax', canonical_venue_id: 'scenarelax',
    start_min: 960, showtimes: '["16:00"]',
    showtime_booking: JSON.stringify([{ time: '16:00', kind: 'link', params: { url: 'https://pdt.tradedoubler.com/x' } }]),
    price_pln: 120,
  }));
  // The ebilet row already produced a post in an earlier batch (the live Berek case).
  db.posts.set('ebilet-9-20260908', { id: 'p9', external_id: 'ebilet-9-20260908', status: 'approved', locked: false });

  const s = await reconcileDay(db, DAY, 'b1');
  assert.deepEqual(s, { day: DAY, winners: 1, duplicates: 1, failures: 0, rejectedPosts: 1 });
  const winner = db.raw.get('rk')!;
  assert.equal(winner.status, 'winner');
  assert.deepEqual(JSON.parse(winner.showtimes), ['16:00', '19:00'], 'times union');
  assert.equal(JSON.parse(winner.showtime_booking).length, 2, 'booking union keeps both pages');
  assert.equal(winner.price_pln, 120, 'cheapest price survives even though ebilet lost');
  const loser = db.raw.get('re')!;
  assert.equal(loser.status, 'duplicate');
  assert.equal(loser.winner_raw_id, 'rk');
  assert.equal(db.posts.get('ebilet-9-20260908')!.status, 'rejected', 'superseded post displaced');
});

test('reconcile: time guard keeps 14:00 vs 16:00 apart; booking_key forces a merge', async () => {
  const db = new MockReconDB() as unknown as D1Database;
  const mk = (id: string, start: number, key: string | null) => row({
    id, provider: 'kupbilecik', external_id: `kupbilecik-${id}-20260908`,
    title: 'Ten sam tytuł', raw_venue: 'Sala Y', canonical_venue_id: 'salay',
    start_min: start, showtimes: JSON.stringify([]), booking_key: key,
  });
  db.seedRaw(mk('a', 14 * 60, null));
  db.seedRaw(mk('b', 16 * 60, null));
  const s = await reconcileDay(db, DAY, 'b1');
  assert.equal(s.winners, 2, 'two hours apart stay separate');
  assert.equal(s.duplicates, 0);

  const db2 = new MockReconDB() as unknown as D1Database;
  db2.seedRaw(mk('a', 14 * 60, 'kupbilecik.pl/imprezy/1/'));
  db2.seedRaw(mk('b', 16 * 60, 'kupbilecik.pl/imprezy/1/'));
  const s2 = await reconcileDay(db2, DAY, 'b1');
  assert.equal(s2.winners, 1, 'same booking page merges past the time guard');
  assert.equal(s2.duplicates, 1);
});

test('reconcile: ambiguous same-source pair goes to failures, nothing merges', async () => {
  const db = new MockReconDB() as unknown as D1Database;
  // The documented 0.8-containment trap: two REAL concerts, same venue.
  db.seedRaw(row({
    id: 'g1', provider: 'going', external_id: 'going-1-20260908',
    title: 'Muzyka filmowa: Koncert przy świecach w plenerze',
    raw_venue: 'Park', canonical_venue_id: 'park', start_min: 1200,
  }));
  db.seedRaw(row({
    id: 'g2', provider: 'going', external_id: 'going-2-20260908',
    title: 'Bridgerton: Koncert przy świecach w plenerze',
    raw_venue: 'Park', canonical_venue_id: 'park', start_min: 1260,
  }));
  const s = await reconcileDay(db, DAY, 'b1');
  assert.equal(s.failures, 1, 'one ambiguous pair recorded');
  assert.equal(s.winners, 0, 'nothing auto-merged');
  assert.equal(s.duplicates, 0);
  assert.equal(db.failures.length, 1);
  assert.equal(db.raw.get('g1')!.status, 'failure');
  assert.equal(db.raw.get('g2')!.status, 'failure');
});

test('reconcile: locked existing post is never auto-demoted', async () => {
  const db = new MockReconDB() as unknown as D1Database;
  db.seedRaw(row({
    id: 'rk', provider: 'kupbilecik', external_id: 'kupbilecik-1-20260908',
    title: 'Berek, czyli Upiór w Moherze', raw_venue: 'Scena Relax',
    canonical_venue_id: 'scenarelax', start_min: 960, showtimes: '["16:00"]',
  }));
  db.seedRaw(row({
    id: 're', provider: 'ebilet', external_id: 'ebilet-9-20260908',
    title: 'Berek, czyli upiór w moherze', raw_venue: 'Scena Relax',
    canonical_venue_id: 'scenarelax', start_min: 960, showtimes: '["16:00"]',
  }));
  db.posts.set('ebilet-9-20260908', { id: 'p9', external_id: 'ebilet-9-20260908', status: 'approved', locked: true });
  const s = await reconcileDay(db, DAY, 'b1');
  assert.equal(s.failures, 1);
  assert.equal(s.rejectedPosts, 0, 'locked post untouched');
  assert.equal(db.posts.get('ebilet-9-20260908')!.status, 'approved');
  assert.equal(db.raw.get('re')!.status, 'failure');
  assert.equal(db.raw.get('rk')!.status, 'winner');
});

test('reconcile: idempotent re-run finds nothing left to do', async () => {
  const db = new MockReconDB() as unknown as D1Database;
  db.seedRaw(row({
    id: 'r1', provider: 'kupbilecik', external_id: 'kupbilecik-1-20260908',
    title: 'Solo koncert', raw_venue: 'Klub X', canonical_venue_id: 'klubx', start_min: 1200,
  }));
  await reconcileDay(db, DAY, 'b1');
  const s2 = await reconcileDay(db, DAY, 'b1');
  assert.deepEqual(s2, { day: DAY, winners: 0, duplicates: 0, failures: 0, rejectedPosts: 0 });
});

test('reconcile: time guard constant is 30 minutes', () => {
  assert.equal(RECONCILE_TIME_GUARD_MIN, 30);
});
