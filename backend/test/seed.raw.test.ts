import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeRawRows } from '../src/seed/pipeline/queue/raw';
import { resolveVenueGeo } from '../src/seed/venues/venueStore';
import type { SeedCandidate } from '../src/seed/core/types';

interface VenueRow {
  id: string; name: string; city: string | null; lat: number | null; lng: number | null;
}
interface RawRow {
  id: string; day: string; provider: string; external_id: string; title: string;
  title_tokens: string; start_min: number; booking_key: string | null; price_pln: number | null;
  canonical_venue_id: string | null; status: string; [k: string]: unknown;
}

// In-memory D1 honoring the WHERE clauses it receives (a real DB would do the
// same): rows with NULL lat/lng are returned ONLY to queries without the
// IS NOT NULL guard. This is what makes the stub-exclusion test meaningful.
class MockRawDB {
  venues = new Map<string, VenueRow>();
  raw = new Map<string, RawRow>(); // key: day|provider|external_id

  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: (string | number | null)[]) {
        return {
          async first<T>(): Promise<T | null> {
            if (sql.startsWith('SELECT id, city FROM venues WHERE id = ?')) {
              const row = db.venues.get(String(args[0]));
              return (row ? { id: row.id, city: row.city } : null) as T;
            }
            if (sql.includes('city IS NULL AND lat IS NOT NULL')) {
              const row = db.venues.get(String(args[0]));
              const ok = row && row.city === null && row.lat !== null && row.lng !== null;
              return (ok ? row : null) as T;
            }
            return null as T;
          },
          async all<T>(): Promise<{ results: T[] }> {
            if (sql.startsWith('SELECT * FROM venues')) {
              const guarded = sql.includes('lat IS NOT NULL');
              let rows = [...db.venues.values()];
              if (sql.includes('WHERE city = ?')) {
                const city = String(args[0]);
                rows = rows.filter((r) => r.city === city);
              } else if (sql.includes('city IS NULL')) {
                rows = rows.filter((r) => r.city === null);
              }
              if (guarded) rows = rows.filter((r) => r.lat !== null && r.lng !== null);
              return { results: rows as T[] };
            }
            return { results: [] as T[] };
          },
          async run(): Promise<{ meta: { changes: number } }> {
            if (sql.includes('INSERT OR IGNORE INTO venues')) {
              // ensureCanonicalVenue stub: bind (id, name, city, now, now, now).
              // No ON CONFLICT clause: an existing id is left untouched.
              const [id, name, city] = args as [string, string, string | null];
              if (db.venues.has(id)) return { meta: { changes: 0 } };
              db.venues.set(id, { id, name, city, lat: null, lng: null });
              return { meta: { changes: 1 } };
            }
            if (sql.includes('INSERT INTO venues') && sql.includes('ON CONFLICT(id) DO UPDATE')) {
              // upsertVenue new-venue branch: bind
              // (id, name, lat, lng, city, sources, now, now, now). On id conflict
              // production OVERWRITES lat/lng — a geo'd visit heals a stub.
              const [id, name, lat, lng, city] = args as [string, string, number, number, string | null];
              const prev = db.venues.get(id);
              if (prev) {
                prev.lat = lat; prev.lng = lng; prev.city = city;
                return { meta: { changes: 1 } };
              }
              db.venues.set(id, { id, name, city, lat, lng });
              return { meta: { changes: 1 } };
            }
            if (sql.startsWith('UPDATE venues SET lat=')) {
              // upsertVenue fuzzy-match branch: bind
              // (lat, lng, aliases, sources, city, last_seen, id).
              const id = String(args[6]);
              const row = db.venues.get(id);
              if (!row) return { meta: { changes: 0 } };
              row.lat = args[0] as number; row.lng = args[1] as number;
              return { meta: { changes: 1 } };
            }
            if (sql.includes('INSERT INTO seed_raw')) {
              // bind order mirrors raw.ts: id, day, batch_id, unit_id, provider,
              // external_id, title, title_tokens, raw_venue, city, canonical_venue_id,
              // start_min, showtimes, showtime_booking, tags, price_pln, media_url,
              // thumb_url, link_url, booking_key, affiliate_link, partner_id,
              // partner_name, is_sold_out, content_hash, t, t
              const a = args as (string | number | null)[];
              const [id, day, , , provider, external_id, title, title_tokens] = a as string[];
              const key = `${day}|${provider}|${external_id}`;
              const row: RawRow = {
                id, day, provider, external_id, title,
                title_tokens: title_tokens as string,
                start_min: a[11] as number,
                booking_key: a[19] as string | null,
                price_pln: a[15] as number | null,
                canonical_venue_id: a[10] as string | null,
                status: 'raw',
              };
              const keptId = db.raw.get(key)?.id ?? id; // conflict keeps the original id
              db.raw.set(key, { ...row, id: keptId });
              return { meta: { changes: 1 } };
            }
            if (sql.includes('UPDATE venues SET hit_count')) {
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
        };
      },
    };
  }

  async batch(stmts: { run: () => Promise<unknown> }[]): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }
}

function cand(over: Partial<SeedCandidate> = {}): SeedCandidate {
  return {
    source: 'ebilet',
    externalId: 'ebilet-1-20260908',
    title: 'Berek, czyli upiór w moherze',
    startMs: Date.UTC(2026, 8, 8, 14, 0, 0), // 16:00 Warsaw (CEST)
    lat: null, lng: null,
    city: 'Warszawa',
    venue: 'Scena Relax',
    address: '',
    link: 'https://www.ebilet.pl/muzyka/berek',
    mediaUrl: 'https://www.ebilet.pl/img/x.webp',
    thumbUrl: null,
    ...over,
  } as SeedCandidate;
}

const INPUT = { day: '2026-09-08', batchId: 'b1', unitId: 'u1', provider: 'ebilet', candidates: [] as SeedCandidate[] };

test('sink: ebilet-like venue stamps a stub id, tokens/start/booking derived', async () => {
  const db = new MockRawDB() as unknown as D1Database;
  const n = await writeRawRows(db, { ...INPUT, candidates: [cand()] }, 90);
  assert.equal(n, 1);
  const row = db.raw.get('2026-09-08|ebilet|ebilet-1-20260908')!;
  assert.ok(row, 'row written');
  assert.equal(row.canonical_venue_id, 'scenarelax');
  assert.equal(row.start_min, 16 * 60, '16:00 Warsaw');
  assert.deepEqual(JSON.parse(row.title_tokens), ['berek', 'czyli', 'upior', 'moherze'], 'venue tokens subtracted, diacritics folded');
  assert.equal(row.booking_key, 'ebilet.pl/muzyka/berek', 'linkKey of the real page');
  assert.equal(row.price_pln, null);
  assert.equal(row.status, 'raw');
  const stub = db.venues.get('scenarelax')!;
  assert.ok(stub, 'stub venue row created');
  assert.equal(stub.lat, null, 'stub has no coordinates');
});

test('sink: same venue twice → one stub; other city → separate id', async () => {
  const db = new MockRawDB() as unknown as D1Database;
  await writeRawRows(db, { ...INPUT, candidates: [cand(), cand({ externalId: 'ebilet-2-20260908', title: 'Inny tytuł' })] }, 90);
  assert.equal(db.venues.size, 1, 'one stub for one venue');
  await writeRawRows(db, { ...INPUT, candidates: [cand({ externalId: 'ebilet-3-20260908', city: 'Kraków' })] }, 90);
  assert.equal(db.venues.size, 2, 'same name in another city gets its own id');
  assert.equal(db.raw.get('2026-09-08|ebilet|ebilet-3-20260908')!.canonical_venue_id, 'scenarelax@krakow');
});

test('sink: existing geo venue wins over stub; empty venue → null', async () => {
  const db = new MockRawDB() as unknown as D1Database;
  db.venues.set('scenarelax', { id: 'scenarelax', name: 'Scena Relax', city: 'warszawa', lat: 52.23, lng: 21.01 });
  await writeRawRows(db, { ...INPUT, candidates: [cand()] }, 90);
  assert.equal(db.venues.size, 1, 'no stub created when the venue is known');
  assert.equal(db.raw.get('2026-09-08|ebilet|ebilet-1-20260908')!.canonical_venue_id, 'scenarelax');
  await writeRawRows(db, { ...INPUT, candidates: [cand({ externalId: 'ebilet-9-20260908', venue: '' })] }, 90);
  assert.equal(db.raw.get('2026-09-08|ebilet|ebilet-9-20260908')!.canonical_venue_id, null);
});

test('sink: re-run keeps row id, refreshes content (idempotent re-seed)', async () => {
  const db = new MockRawDB() as unknown as D1Database;
  await writeRawRows(db, { ...INPUT, candidates: [cand({ price: 120 })] }, 90);
  const first = db.raw.get('2026-09-08|ebilet|ebilet-1-20260908')!;
  await writeRawRows(db, { ...INPUT, candidates: [cand({ price: 99, title: 'Berek, czyli upiór w moherze!' })] }, 90);
  const second = db.raw.get('2026-09-08|ebilet|ebilet-1-20260908')!;
  assert.equal(second.id, first.id, 'stable id across re-runs');
  assert.equal(second.price_pln, 99, 'content refreshed, not duplicated');
  assert.equal(db.raw.size, 1);
});

test('resolveVenueGeo: coordinate-less stubs never resolve', async () => {
  const db = new MockRawDB() as unknown as D1Database;
  await writeRawRows(db, { ...INPUT, candidates: [cand()] }, 90); // creates stub only
  const hit = await resolveVenueGeo(db, 'Scena Relax', 'Warszawa');
  assert.equal(hit, null, 'stub must not resolve to null coordinates');
  db.venues.set('scenarelax', { id: 'scenarelax', name: 'Scena Relax', city: 'warszawa', lat: 52.23, lng: 21.01 });
  const hit2 = await resolveVenueGeo(db, 'Scena Relax', 'Warszawa');
  assert.deepEqual(hit2, { lat: 52.23, lng: 21.01, id: 'scenarelax' });
});

test('sink: geo candidate reuses the known venue (cheap, no geo API call)', async () => {
  const db = new MockRawDB() as unknown as D1Database;
  db.venues.set('scenarelax', { id: 'scenarelax', name: 'Scena Relax', city: 'warszawa', lat: 52.23, lng: 21.01 });
  await writeRawRows(db, {
    ...INPUT,
    candidates: [cand({ venue: 'scena relax', lat: 52.2301, lng: 21.0102 })],
  }, 90);
  assert.equal(db.venues.size, 1, 'no new row for a known place');
  assert.equal(
    db.raw.get('2026-09-08|ebilet|ebilet-1-20260908')!.canonical_venue_id,
    'scenarelax',
    'same canonical id reused',
  );
});

test('sink: geo candidate with an unknown venue saves its coordinates (no stub)', async () => {
  const db = new MockRawDB() as unknown as D1Database;
  await writeRawRows(db, {
    ...INPUT,
    candidates: [cand({ venue: 'Nowa Sala', lat: 50.06, lng: 19.94, city: 'Kraków' })],
  }, 90);
  const row = db.venues.get('nowasala')!;
  assert.ok(row, 'venue row created');
  assert.equal(row.lat, 50.06, 'provided geo saved to cache — future seeds skip the geo API');
  assert.equal(row.lng, 19.94);
  assert.equal(
    db.raw.get('2026-09-08|ebilet|ebilet-1-20260908')!.canonical_venue_id,
    'nowasala',
  );
});

test('sink: a later geo visit heals a stub left by a geo-less candidate', async () => {
  const db = new MockRawDB() as unknown as D1Database;
  await writeRawRows(db, { ...INPUT, candidates: [cand()] }, 90); // geo-less → stub
  assert.equal(db.venues.get('scenarelax')!.lat, null);
  await writeRawRows(db, {
    ...INPUT,
    candidates: [cand({ externalId: 'ebilet-2-20260908', lat: 52.23, lng: 21.01 })],
  }, 90); // same place, now WITH coordinates
  const healed = db.venues.get('scenarelax')!;
  assert.equal(healed.lat, 52.23, 'stub filled in — no second row, no second geo lookup ever');
  assert.equal(db.venues.size, 1);
  assert.equal(
    db.raw.get('2026-09-08|ebilet|ebilet-2-20260908')!.canonical_venue_id,
    'scenarelax',
  );
});
