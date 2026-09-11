import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normHashInput } from '../src/seed/pipeline/queue/raw';
import { produceSeedWindow } from '../src/seed/pipeline/queue/produce';
import { SEED_REFILL_AHEAD } from '../src/seed/core/constants';
import type { SeedCandidate } from '../src/seed/core/types';

// ---------- content_hash stability ----------

const cand = (over: Partial<SeedCandidate> = {}): SeedCandidate => ({
  source: 'going' as SeedCandidate['source'],
  externalId: 'going-1',
  title: 'Koncert',
  startMs: 1_700_000_000_000,
  lat: 52.4, lng: 16.9,
  city: 'Poznań', venue: 'Sala', address: '',
  link: 'https://x/event', mediaUrl: 'https://cdn/x.jpg?_a=SIG1',
  thumbUrl: null,
  times: ['19:00', '16:00'],
  tags: ['muzyka', 'inne'],
  price: null,
  ...over,
});

test('normHashInput: rotating media URL sig + array order do NOT change the hash', () => {
  const a = cand();
  const b = cand({ mediaUrl: 'https://cdn/x.jpg?_a=DIFFERENT', times: ['16:00', '19:00'], tags: ['inne', 'muzyka'] });
  assert.equal(normHashInput(a), normHashInput(b));
});

test('normHashInput: real content changes DO change the hash', () => {
  assert.notEqual(normHashInput(cand()), normHashInput(cand({ title: 'Inny koncert' })));
  assert.notEqual(normHashInput(cand()), normHashInput(cand({ times: ['18:00'] })));
  assert.notEqual(normHashInput(cand()), normHashInput(cand({ price: 120 })));
});

test('normHashInput: null price and 0 price are DISTINCT (no 0 substitution)', () => {
  assert.notEqual(normHashInput(cand({ price: null })), normHashInput(cand({ price: 0 })));
});

// ---------- producer ----------

class MockProducerDB {
  maxGen = 3;
  batches: unknown[][] = [];
  days = new Map<string, number>();
  inserts = 0;
  resets = 0;
  prepare(sql: string) {
    const self = this;
    return {
      bind(...args: (string | number | null)[]) {
        return {
          async first() {
            if (sql.includes('MAX(gen)')) return { g: self.maxGen };
            return null;
          },
          async run() {
            if (sql.includes('INSERT INTO seed_batches')) self.batches.push(args);
            else if (sql.includes('INSERT INTO seed_days')) self.days.set(String(args[0]), Number(args[1]));
            else if (sql.includes('UPDATE seed_units')) self.resets += 1;
            else if (sql.includes('INSERT OR IGNORE INTO seed_units')) self.inserts += 1;
            return { meta: { changes: 1 } };
          },
        };
      },
    };
  }
  async batch(stmts: { run: () => Promise<unknown> }[]) {
    const out: unknown[] = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }
}

test('produceSeedWindow: bumps generation, marks every window day, resets old units, wakes workers', async () => {
  const db = new MockProducerDB();
  let sent = 0;
  const env = {
    DB: db as unknown as D1Database,
    SEED_FETCH_QUEUE: { sendBatch: async (msgs: unknown[]) => { sent += msgs.length; } },
    SEED_INGEST_QUEUE: {}, SEED_FINALIZE_QUEUE: {},
  } as unknown as Parameters<typeof produceSeedWindow>[0];

  const res = await produceSeedWindow(env, '2026-09-08');
  assert.equal(res.generation, 4, 'max gen 3 + 1');
  assert.equal(db.days.size, SEED_REFILL_AHEAD + 1, 'every window day marked');
  assert.ok([...db.days.values()].every((g) => g === 4), 'all days on the new generation');
  assert.equal(db.resets, 1, 'older-generation units reset once');
  assert.ok(db.inserts > 0, 'units written');
  // Worker providers (kupbilecik/ebilet/eventim, day kind) = 3 x 8 days.
  assert.equal(sent, 24, 'one wake-up per worker unit');
});
