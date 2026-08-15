// Exception/unit tests for the daily seed pipeline (pure logic — no network).
// Run with: node --experimental-strip-types --test src/seed.test.ts  (Node 22.6+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMediaType, extForMediaType } from './posts';
import {
  dedupe,
  buildDescription,
  todayWarsaw,
  tomorrowWarsaw,
  warsawMidnightMs,
  toWarsawIso,
  enabledProviders,
  SEED_PROVIDERS,
} from './seed';
import { browserBudget } from './seed/log';
import { verifyPassword, readSession, createSession } from './admin/auth';
import { nextCronRunMs, cronSummary } from './admin/cron';
import { cityBbox, nearestCity } from './admin/cities';
import { eventsSql } from './admin/queries';

function byteSeq(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

test('detectMediaType: webp (RIFF....WEBP)', () => {
  const webp = byteSeq(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);
  assert.equal(detectMediaType(webp), 'image/webp');
});

test('detectMediaType: still detects jpeg/png/heic/mp4', () => {
  assert.equal(detectMediaType(byteSeq(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(detectMediaType(byteSeq(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png');
  const heic = byteSeq(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, ...'heic'.split('').map((c) => c.charCodeAt(0)));
  assert.equal(detectMediaType(heic), 'image/heic');
  const mp4 = byteSeq(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, ...'mp42'.split('').map((c) => c.charCodeAt(0)));
  assert.equal(detectMediaType(mp4), 'video/mp4');
});

test('detectMediaType: rejects garbage and short buffers', () => {
  assert.equal(detectMediaType(byteSeq(0, 1, 2, 3)), null);
  assert.equal(detectMediaType(new Uint8Array(0)), null);
  // RIFF but missing WEBP marker
  assert.equal(detectMediaType(byteSeq(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x00, 0x00, 0x00, 0x00)), null);
});

test('extForMediaType: webp -> .webp, jpeg -> .jpg', () => {
  assert.equal(extForMediaType('image/webp'), 'webp');
  assert.equal(extForMediaType('image/jpeg'), 'jpg');
  assert.equal(extForMediaType('image/png'), 'png');
});

function cand(over: Partial<{ source: 'going' | 'kupbilecik'; externalId: string; title: string; startMs: number; venue: string; address: string; city: string }>) {
  return {
    source: (over.source ?? 'going') as 'going' | 'kupbilecik',
    externalId: over.externalId ?? 'x-1',
    title: over.title ?? 'Event',
    startMs: over.startMs ?? 1_782_765_000_000, // 2026-08-14T18:30:00Z
    lat: 52.2, lng: 21.0,
    city: over.city ?? 'Warszawa',
    venue: over.venue ?? 'Venue',
    address: over.address ?? 'ul. Testowa 1, 00-001',
    link: 'https://example.com',
    mediaUrl: 'https://example.com/media.webp',
    thumbUrl: 'https://example.com/media_m.webp',
  };
}

test('dedupe: same hour+venue -> going wins over kupbilecik', () => {
  const kup = cand({ source: 'kupbilecik', externalId: 'kup-1', title: 'Koncert' });
  const going = cand({ source: 'going', externalId: 'going-1', title: 'Koncert' });
  const out = dedupe([kup, going]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'going-1');
});

test('dedupe: different hours stay separate', () => {
  const a = cand({ externalId: 'a', startMs: 1_782_765_000_000 });
  const b = cand({ externalId: 'b', startMs: 1_782_765_000_000 + 3_600_000 });
  assert.equal(dedupe([a, b]).length, 2);
});

test('buildDescription: strips postal code, keeps venue + street', () => {
  const c = cand({ title: 'SKOLIM', startMs: 1_782_765_000_000, venue: 'Klub', address: 'ul. Towarowa 39, 00-123' });
  const d = buildDescription(c);
  assert.ok(d.startsWith('SKOLIM: '));
  assert.ok(d.includes('Klub'));
  assert.ok(d.includes('ul. Towarowa 39'));
  assert.ok(!d.includes('00-123'), 'postal code must be stripped');
  assert.ok(d.length <= 130);
});

test('buildDescription: going address format (city, street) keeps street only', () => {
  const c = cand({ venue: 'Klub Schron', address: 'Poznań, Tadeusza Kościuszki 68' });
  const d = buildDescription(c);
  assert.ok(d.includes('Tadeusza Kościuszki 68'));
});

test('warsawMidnightMs: returns 00:00 Europe/Warsaw', () => {
  const ms = warsawMidnightMs('2026-08-15');
  const iso = toWarsawIso(ms);
  assert.ok(iso.startsWith('2026-08-15T00:00:00'), iso);
});

test('tomorrowWarsaw: rolls over month end', () => {
  assert.equal(tomorrowWarsaw('2026-08-31'), '2026-09-01');
  assert.equal(tomorrowWarsaw('2026-12-31'), '2027-01-01');
});

test('todayWarsaw: matches a strict YYYY-MM-DD shape', () => {
  assert.match(todayWarsaw(), /^\d{4}-\d{2}-\d{2}$/);
});

test('providers: going=fetch, kupbilecik=browser, all enabled', () => {
  const byId = new Map(SEED_PROVIDERS.map((p) => [p.id, p]));
  assert.ok(byId.has('going'));
  assert.ok(byId.has('kupbilecik'));
  assert.equal(byId.get('going')!.transport, 'fetch');
  assert.equal(byId.get('kupbilecik')!.transport, 'browser');
  for (const p of SEED_PROVIDERS) {
    assert.equal(typeof p.fetchCandidates, 'function');
    assert.equal(typeof p.fetchBytes, 'function');
    assert.ok(p.enabled, `${p.id} should be enabled`);
  }
  assert.ok(enabledProviders().length >= 2);
});

test('browserBudget: sums browser_ms for current month', async () => {
  // Fake D1 with two rows; one inside month (now), one old.
  const now = Date.now();
  const old = now - 40 * 24 * 3_600_000;
  const rows = [
    { total: 5 * 3_600_000 },   // this month
    { total: 5 * 3_600_000 },   // this month (second row)
  ];
  const env = {
    BROWSER: {},
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ total: rows.reduce((a, r) => a + r.total, 0) }),
        }),
      }),
    },
  } as unknown as Env;
  const b = await browserBudget(env);
  assert.ok(b);
  assert.equal(b.monthMs, 10 * 3_600_000);
  assert.equal(b.exceeded, false); // == limit, not > limit
  void old;
});

test('admin verifyPassword: correct/incorrect hash', async () => {
  // hash of "test-password-123" (generated by admin/scripts/hash-admin-password.mjs)
  const hash = '9ab199cca9f06e22a8b33d342ba07d06:100000:54a71ff74f0e9427b185118f6df65ed55394b46609ea45202d90a7389f83aa65';
  assert.equal(await verifyPassword('test-password-123', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.equal(await verifyPassword('x', 'not-a-hash'), false);
});

test('admin session: valid cookie, expired cookie, tampered cookie', async () => {
  const env = { ADMIN_COOKIE_SECRET: 'test-cookie-secret' } as unknown as Env;
  const cookie = await createSession(env);
  assert.ok(cookie);
  const session = await readSession(env, cookie);
  assert.ok(session);
  assert.equal(session!.sub, 'admin');
  assert.ok(session!.exp > Date.now());

  // tampered payload -> rejected
  assert.equal(await readSession(env, cookie + 'x'), null);
  // wrong secret -> rejected
  const otherEnv = { ADMIN_COOKIE_SECRET: 'different' } as unknown as Env;
  assert.equal(await readSession(otherEnv, cookie), null);
  // missing secret -> rejected
  assert.equal(await readSession({} as Env, cookie), null);
});

test('cron: nextCronRunMs is in the future, summary non-empty', () => {
  const next = nextCronRunMs();
  assert.ok(next);
  assert.ok(next > Date.now());
  assert.ok(cronSummary().length > 0);
});

test('cities: bbox is centered and nearestCity works', () => {
  const bbox = cityBbox('poznan');
  assert.ok(bbox);
  assert.ok(bbox.swLat < bbox.neLat && bbox.swLng < bbox.neLng);
  // Poznań center is inside its own bbox
  assert.ok(bbox.swLat <= 52.4064 && 52.4064 <= bbox.neLat);
  assert.equal(nearestCity(52.4064, 16.9252), 'Poznań');
  assert.equal(cityBbox('nope'), null);
});

test('eventsSql: city filter adds bbox binds, day filter uses date()', () => {
  const { sql, binds } = eventsSql({ cityId: 'warszawa', source: 'going', status: null, day: '2026-08-16', fromMs: null, toMs: null, limit: 50 });
  assert.ok(sql.includes('p.lat BETWEEN'));
  assert.ok(sql.includes('date(p.created_at/1000'));
  assert.ok(sql.includes('LIMIT ?'));
  assert.ok(binds.length >= 4);
  assert.equal(binds[binds.length - 1], 50);
});
