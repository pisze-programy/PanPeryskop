import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestWinnerRow, RawWinnerRow } from '../src/seed/pipeline/queue/ingest';
import { fallbackSeedGeo } from '../src/seed/core/geo';
import type { SeedProvider } from '../src/seed/core/types';

const DAY = '2026-09-08';
// 16:00 Warsaw (CEST) on DAY.
const START_MIN = 16 * 60;

// Minimal valid WEBP (RIFF....WEBP) for detectMediaType.
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3]);

interface MockPost {
  id: string; external_id: string; status: string; lat: number; lng: number;
  description: string; media_key: string | null; thumb_key: string | null;
  link_url: string | null; showtimes: string | null; showtime_booking: string | null;
  price_pln: number | null;
}
interface MockRaw { id: string; status: string; post_id: string | null; reason: string | null; attempts: number }

// In-memory D1 + R2. Unknown SQL throws: the ingest must touch nothing else
// (in particular, no Nominatim — geo tests stay hermetic).
class MockIngestDB {
  venues = new Map<string, { lat: number | null; lng: number | null }>();
  posts = new Map<string, MockPost>(); // key: external_id
  raws = new Map<string, { status: string; post_id: string | null; reason: string | null; attempts: number }>();
  rules: { id: string; pattern: string | null; venue: string | null; partner_id: string | null; partner_name: string | null; active: number }[] = [];

  prepare(sql: string) {
    const db = this;
    const all = async <T>(): Promise<{ results: T[] }> => {
      if (sql.includes('FROM event_blacklist')) {
        return { results: db.rules as T[] };
      }
      throw new Error(`unexpected all(): ${sql.slice(0, 80)}`);
    };
    return {
      all,
      bind(...args: (string | number | null | boolean)[]) {
        return {
          async first<T>(): Promise<T | null> {
            if (sql.includes('FROM venues WHERE id = ?')) {
              const v = db.venues.get(String(args[0]));
              return (v ? { lat: v.lat, lng: v.lng } : null) as T;
            }
            if (sql.includes('FROM posts WHERE external_id=?')) {
              const p = db.posts.get(String(args[0]));
              return (p ? { id: p.id, media_key: p.media_key, thumb_key: p.thumb_key } : null) as T;
            }
            throw new Error(`unexpected first(): ${sql.slice(0, 80)}`);
          },
          async all<T>(): Promise<{ results: T[] }> {
            if (sql.includes('FROM event_blacklist')) {
              return { results: db.rules as T[] };
            }
            throw new Error(`unexpected all(): ${sql.slice(0, 80)}`);
          },
          async run(): Promise<{ meta: { changes: number } }> {
            if (sql.includes('INSERT INTO posts (')) {
              // doSavePost bind order: postId, userId, type, lat, lng, description,
              // status, mediaKey, thumbKey, createdAt, cellId, sponsored, category,
              // linkUrl, externalId, soldOut, eventDate, showtimes, booking, tags,
              // partnerId, partnerName, price (23 binds).
              const [id, , , lat, lng, description, status, mediaKey, thumbKey, , , , , linkUrl, externalId, , , showtimes, booking, , partnerId, partnerName, price] = args as [
                string, string, string, number, number, string, string, string | null, string | null,
                number, string, number, string, string | null, string, number, string | null, string | null,
                string | null, string | null, string | null, string | null, number | null,
              ];
              db.posts.set(String(externalId), {
                id, external_id: String(externalId), status, lat, lng, description,
                media_key: mediaKey, thumb_key: thumbKey, link_url: linkUrl,
                showtimes, showtime_booking: booking, price_pln: price,
              });
              return { meta: { changes: 1 } };
            }
            if (sql.includes('UPDATE posts')) {
              // bind: type,lat,lng,description,mediaKey,thumbKey,...,showtimes,booking,...,price,postId
              const postId = String(args[args.length - 1]);
              const p = [...db.posts.values()].find((x) => x.id === postId);
              if (!p) return { meta: { changes: 0 } };
              const [, lat, lng, description, mediaKey, thumbKey] = args as [string, number, number, string, string | null, string | null];
              p.lat = lat; p.lng = lng; p.description = description;
              p.media_key = mediaKey; p.thumb_key = thumbKey;
              p.link_url = args[8] as string | null;
              p.status = args[11] as string;
              p.showtimes = args[14] as string | null;
              p.showtime_booking = args[15] as string | null;
              p.price_pln = args[19] as number | null;
              return { meta: { changes: 1 } };
            }
            if (sql.includes('INSERT INTO grid_cells')) return { meta: { changes: 1 } };
            if (sql.includes('UPDATE seed_raw SET')) {
              const id = String(args[args.length - 1]);
              // Upsert-track: the real row exists (reconcile wrote it); create the
              // tracker lazily so status transitions stay assertable.
              if (!db.raws.has(id)) db.raws.set(id, { status: 'winner', post_id: null, reason: null, attempts: 0 });
              const r = db.raws.get(id)!;
              if (sql.includes("status='ingesting'")) r.attempts += 1;
              if (sql.includes("status='duplicate'")) { r.status = 'duplicate'; r.reason = String(args[0]); }
              if (sql.includes("status='done'")) { r.status = 'done'; r.post_id = String(args[0]); }
              if (sql.includes("status='error'")) { r.status = 'error'; r.reason = String(args[0]); }
              return { meta: { changes: 1 } };
            }
            throw new Error(`unexpected run(): ${sql.slice(0, 80)}`);
          },
        };
      },
    };
  }

  async batch(_stmts: unknown[]): Promise<unknown[]> {
    return [];
  }

  // Track seed_raw rows so status transitions are assertable.
  trackRaw(id: string) {
    if (!this.raws.has(id)) this.raws.set(id, { status: 'winner', post_id: null, reason: null, attempts: 0 });
  }
}

function row(over: Partial<RawWinnerRow> = {}): RawWinnerRow {
  return {
    id: 'raw1', day: DAY, batch_id: 'b1', provider: 'ebilet',
    external_id: 'ebilet-1-20260908', title: 'Berek, czyli upiór w moherze',
    raw_venue: 'Scena Relax', city: 'Warszawa', canonical_venue_id: 'scenarelax',
    start_min: START_MIN, showtimes: '["16:00","19:00"]',
    showtime_booking: JSON.stringify([
      { time: '16:00', kind: 'link', params: { url: 'https://x.pl/16' } },
      { time: '19:00', kind: 'link', params: { url: 'https://x.pl/19' } },
    ]),
    price_pln: 120, is_sold_out: 0,
    media_url: 'https://www.ebilet.pl/img/x.webp', thumb_url: null,
    link_url: 'https://www.ebilet.pl/muzyka/berek', affiliate_link: null,
    partner_id: null, partner_name: null, status: 'winner',
    ...over,
  };
}

function providerStub(fetchBytes: (url: string) => Promise<Uint8Array>): SeedProvider {
  return {
    id: 'ebilet', transport: 'fetch', fetchCandidates: async () => [], fetchBytes,
    scopes: ['pl'], fetchScope: async () => [],
  } as unknown as SeedProvider;
}

function envOf(db: MockIngestDB, puts: string[]) {
  return {
    DB: db as unknown as D1Database,
    MEDIA: { put: async (key: string) => { puts.push(key); } } as unknown as R2Bucket,
  };
}

test('ingest: canonical venue hit → approved post with merged fields, row done', async () => {
  const db = new MockIngestDB();
  db.venues.set('scenarelax', { lat: 52.23, lng: 21.01 });
  let fetches = 0;
  const provider = providerStub(async () => { fetches += 1; return WEBP; });
  const puts: string[] = [];

  const res = await ingestWinnerRow(envOf(db, puts), provider, 'u1', DAY, row());
  assert.equal(res.skipped, false);
  assert.equal(res.pendingGeo, false);
  assert.ok(res.postId);
  assert.equal(fetches, 1, 'media downloaded once for a new post');
  assert.deepEqual(puts, [`posts/${res.postId}/media.webp`]);

  const post = db.posts.get('ebilet-1-20260908')!;
  assert.equal(post.status, 'approved');
  assert.equal(post.lat, 52.23, 'canonical venue coords, no geocoder involved');
  assert.ok(post.description.includes('16:00') && post.description.includes('Scena Relax'));
  assert.equal(post.showtimes, '["16:00","19:00"]', 'merged showtimes stored');
  assert.equal(post.price_pln, 120);
  assert.equal(post.link_url, 'https://www.ebilet.pl/muzyka/berek');
  assert.equal(db.raws.get('raw1')!.status, 'done', 'winner row marked done');
  assert.equal(db.raws.get('raw1')!.post_id, res.postId, 'row points at its post');
});

test('ingest: re-run is a no-op — same post, no second download', async () => {
  const db = new MockIngestDB();
  db.venues.set('scenarelax', { lat: 52.23, lng: 21.01 });
  let fetches = 0;
  const provider = providerStub(async () => { fetches += 1; return WEBP; });
  const env = envOf(db, []);
  const first = await ingestWinnerRow(env, provider, 'u1', DAY, row());
  // Simulate the status flip the real UPDATE would have applied.
  const second = await ingestWinnerRow(env, provider, 'u1', DAY, { ...row(), status: 'done' } as RawWinnerRow);
  assert.equal(second.skipped, true);
  assert.equal(second.postId, first.postId, 'same post id, no duplicate');
  assert.equal(fetches, 1, 'media not re-downloaded');
  assert.equal(db.posts.size, 1);
});

test('ingest: no venue anywhere → city-center pin, PENDING, never shown', async () => {
  const db = new MockIngestDB();
  let fetches = 0;
  const provider = providerStub(async () => { fetches += 1; return WEBP; });
  const res = await ingestWinnerRow(
    envOf(db, []), provider, 'u1', DAY,
    row({ raw_venue: '', canonical_venue_id: null }),
  );
  const fb = fallbackSeedGeo('Warszawa');
  const post = db.posts.get('ebilet-1-20260908')!;
  assert.equal(res.pendingGeo, true);
  assert.equal(post.status, 'pending');
  assert.equal(post.lat, fb.lat);
  assert.equal(post.lng, fb.lng);
});

test('ingest: blacklist match drops the row before any download', async () => {
  const db = new MockIngestDB();
  db.rules.push({ id: 'bl', pattern: 'Berek, czyli upiór', venue: '', partner_id: '', partner_name: '', active: 1 });
  let fetches = 0;
  const provider = providerStub(async () => { fetches += 1; return WEBP; });
  const res = await ingestWinnerRow(envOf(db, []), provider, 'u1', DAY, row());
  assert.equal(res.skipped, true);
  assert.equal(res.postId, null);
  assert.equal(fetches, 0, 'no media fetch for blacklisted rows');
  assert.equal(db.posts.size, 0, 'no post created');
});

test('ingest: existing post reuses media, updates in place', async () => {
  const db = new MockIngestDB();
  db.venues.set('scenarelax', { lat: 52.23, lng: 21.01 });
  db.posts.set('ebilet-1-20260908', {
    id: 'oldpost', external_id: 'ebilet-1-20260908', status: 'approved',
    lat: 0, lng: 0, description: 'stale', media_key: 'posts/oldpost/media.webp',
    thumb_key: null, link_url: 'https://old.example/', showtimes: null,
    showtime_booking: null, price_pln: null,
  });
  let fetches = 0;
  const provider = providerStub(async () => { fetches += 1; return WEBP; });
  const res = await ingestWinnerRow(envOf(db, []), provider, 'u1', DAY, row());
  assert.equal(res.postId, 'oldpost', 'same post id, no duplicate');
  assert.equal(fetches, 0, 'stored media reused, origin untouched');
  const post = db.posts.get('ebilet-1-20260908')!;
  assert.equal(post.media_key, 'posts/oldpost/media.webp');
  assert.ok(post.description.includes('Scena Relax'), 'content refreshed');
  assert.equal(post.showtimes, '["16:00","19:00"]');
});
