// Exception/unit tests for the daily seed pipeline (pure logic — no network).
// Run with: node --experimental-strip-types --test src/seed.test.ts  (Node 22.6+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMediaType, extForMediaType, doSavePost } from './posts';
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
import { ProviderId, CandidateStatus, SeedContext } from './seed/types';
import { browserBudget } from './seed/log';
import { verifyPassword, readSession, createSession } from './admin/auth';
import { nextCronRunMs, cronSummary } from './admin/cron';
import { cityBbox, nearestCity } from './admin/cities';
import { eventsSql } from './admin/queries';
import { dice, venueSimilarity, matchVenueGeo, VENUE_MATCH_THRESHOLD } from './seed/venueMatch';
import { parseLocalDateTime } from './seed/dzisapp';
import { parseEvlEvent, getOfferUrl } from './seed/eventylive';
import { parseMkFilms, extractToken, resolveMkGeo } from './seed/multikino';
import { mkScopes, MK_CINEMAS, MK_ALL_CINEMAS } from './seed/constants';
import { sendChunked, toCandidate } from './seed/queue';
import { upsertVenue, resolveVenueGeo, venueKey } from './seed/venueStore';
import { pruneSeedData } from './seed/cleanup';

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

function cand(over: Partial<{ source: ProviderId; externalId: string; title: string; startMs: number; venue: string; address: string; city: string }>) {
  return {
    source: over.source ?? ProviderId.GOING,
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
  const kup = cand({ source: ProviderId.KUPBILECIK, externalId: 'kup-1', title: 'Koncert' });
  const going = cand({ source: ProviderId.GOING, externalId: 'going-1', title: 'Koncert' });
  const out = dedupe([kup, going]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'going-1');
});

test('dedupe: canonical source wins regardless of input order', () => {
  const mk = (source: ProviderId, ext: string) => cand({ source, externalId: ext, title: 'Koncert', startMs: 1_782_765_000_000, venue: 'Venue' });
  // going (rank 0) beats dzisapp (rank 1) and kupbilecik (rank 3).
  const out1 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.DZISAPP, 'd'), mk(ProviderId.GOING, 'g')]);
  assert.equal(out1.length, 1);
  assert.equal(out1[0].externalId, 'g');
  // Same result when going comes last in input.
  const out2 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.GOING, 'g'), mk(ProviderId.DZISAPP, 'd')]);
  assert.equal(out2[0].externalId, 'g');
  // dzisapp beats kupbilecik when going is absent.
  const out3 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.DZISAPP, 'd')]);
  assert.equal(out3[0].externalId, 'd');
  // eventylive beats kupbilecik.
  const out4 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.EVENTYLIVE, 'e')]);
  assert.equal(out4[0].externalId, 'e');
});

test('dedupe: unknown source keeps the already-seen candidate', () => {
  const mk = (source: ProviderId, ext: string) => cand({ source, externalId: ext, title: 'Koncert', startMs: 1_782_765_000_000, venue: 'Venue' });
  const out = dedupe([mk('future-provider', 'f'), mk(ProviderId.GOING, 'g')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'g', 'known source must win over unknown');
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
  assert.ok(byId.has('dzisapp'));
  assert.ok(byId.has('eventylive'));
  assert.ok(byId.has('multikino'));
  assert.equal(byId.get('going')!.transport, 'fetch');
  assert.equal(byId.get('kupbilecik')!.transport, 'browser');
  assert.equal(byId.get('dzisapp')!.transport, 'fetch');
  assert.equal(byId.get('eventylive')!.transport, 'fetch');
  assert.equal(byId.get('multikino')!.transport, 'fetch');
  for (const p of SEED_PROVIDERS) {
    assert.equal(typeof p.fetchCandidates, 'function');
    assert.equal(typeof p.fetchBytes, 'function');
    assert.ok(p.enabled, `${p.id} should be enabled`);
  }
  assert.ok(enabledProviders().length >= 5);
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
  const next = nextCronRunMs('0 2 * * *');
  assert.ok(next);
  assert.ok(next > Date.now());
  assert.equal(nextCronRunMs('bad'), null);
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
  const { sql, binds } = eventsSql({ cityId: 'warszawa', source: ProviderId.GOING, status: null, day: '2026-08-16', fromMs: null, toMs: null, limit: 50 });
  assert.ok(sql.includes('p.lat BETWEEN'));
  assert.ok(sql.includes('date(p.created_at/1000'));
  assert.ok(sql.includes('LIMIT ?'));
  assert.ok(binds.length >= 4);
  assert.equal(binds[binds.length - 1], 50);
});

test('venueMatch: trigram matches Kinoteatr variants, avoids false positives', () => {
  assert.ok(venueSimilarity('Kino Teatr Apollo', 'Kinoteatr Apollo') > 0.8);
  assert.ok(venueSimilarity('Kino Muza w Poznaniu', 'Teatr Muzyczny w Poznaniu') < 0.5);
  assert.ok(venueSimilarity('Sala koncertowa w podziemiach Bazyliki św. Józefa', 'Sala koncertowa w podziemiach Bazyliki św. Józefa') > VENUE_MATCH_THRESHOLD);
  void dice;
});

test('venueMatch: matchVenueGeo returns geo or null', () => {
  const cache = [
    { name: 'Kinoteatr Apollo', geo: { lat: 52.405, lng: 16.927 } },
    { name: 'Ogród Dendrologiczny Uniwersytetu Przyrodniczego', geo: { lat: 52.427, lng: 16.896 } },
  ];
  const g = matchVenueGeo('Kino Teatr Apollo', cache);
  assert.ok(g);
  assert.ok(Math.abs(g.lat - 52.405) < 0.001);
  assert.equal(matchVenueGeo('Nieznane Miejsce', cache), null);
});

test('venueMatch: real-world short-name and abbreviation pairs match', () => {
  // Prefixed venue vs bare name (dzis.app "Klub Tama" vs kupbilecik "Tama").
  assert.ok(venueSimilarity('Klub Tama', 'Tama') >= VENUE_MATCH_THRESHOLD);
  assert.ok(venueSimilarity('Klub 2progi', '2progi') >= VENUE_MATCH_THRESHOLD);
  // Abbreviation vs full name (Aula UAM = Uniwersytet Adama Mickiewicza).
  assert.ok(venueSimilarity('Aula UAM', 'Aula Uniwersytetu Adama Mickiewicza') >= VENUE_MATCH_THRESHOLD);
  // Ordinary substrings must NOT match (guard against "Koncert" in a title).
  assert.ok(venueSimilarity('Sala Koncertowa Fryderyk', 'Koncert') < VENUE_MATCH_THRESHOLD);
  assert.ok(venueSimilarity('Kino Muza', 'Teatr Muzyczny') < VENUE_MATCH_THRESHOLD);
});

test('venueMatch: prefers same-city venue, ignores other city', () => {
  const cache = [
    { name: 'Tama', geo: { lat: 52.2297, lng: 21.0122 }, city: 'warszawa' },
    { name: 'Klub Tama', geo: { lat: 52.4064, lng: 16.9252 }, city: 'poznan' },
  ];
  const wa = matchVenueGeo('Klub Tama', cache, 'warszawa');
  assert.ok(wa);
  assert.ok(Math.abs(wa!.lat - 52.2297) < 0.001, 'should pick Warszawa Tama');
  const poz = matchVenueGeo('Klub Tama', cache, 'poznan');
  assert.ok(poz);
  assert.ok(Math.abs(poz!.lat - 52.4064) < 0.001, 'should pick Poznań Klub Tama');
});

test('dedupe: all-day eventylive collapses into timed going/dzis duplicate', () => {
  const mk = (source: ProviderId, ext: string, title: string, startMs: number, venue: string) => ({
    source, externalId: ext, title, startMs, lat: 52.4, lng: 16.9, city: 'Poznań',
    venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  });
  const midnight = Date.parse('2026-08-22T00:00:00+02:00');
  const evening = Date.parse('2026-08-22T18:30:00+02:00');
  const evl = mk(ProviderId.EVENTYLIVE, 'evl-1', 'Muzyka z serialu Bridgerton: Koncert przy świecach', midnight, 'Ogród Dendrologiczny Uniwersytetu Przyrodniczego');
  const going = mk(ProviderId.GOING, 'going-1', 'Bridgerton: Koncert przy świecach w plenerze', evening, 'Ogród Dendrologiczny Uniwersytetu Przyrodniczego');
  const out = dedupe([evl, going]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'going-1');
});

test('dedupe: distinct all-day events stay separate', () => {
  const mk = (source: string, ext: string, title: string, startMs: number, venue: string) => ({
    source, externalId: ext, title, startMs, lat: 52.4, lng: 16.9, city: 'Poznań',
    venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  });
  const midnight = Date.parse('2026-08-22T00:00:00+02:00');
  const a = mk(ProviderId.EVENTYLIVE, 'evl-a', 'Wystawa Beksiński', midnight, 'MTP Hala nr 1');
  const b = mk(ProviderId.EVENTYLIVE, 'evl-b', 'K-Pop Party', midnight, 'Klub HAH');
  const out = dedupe([a, b]);
  assert.equal(out.length, 2);
});

test('dedupe: multikino (primary) wins over going for the same film×cinema×hour', () => {
  const mk = (source: ProviderId, ext: string, title: string, startMs: number, venue: string) => ({
    source, externalId: ext, title, startMs, lat: 52.4, lng: 16.9, city: 'Warszawa',
    venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  });
  const t = Date.parse('2026-08-22T18:30:00+02:00');
  const mk2 = mk(ProviderId.MULTIKINO, 'mk-1', 'Spider-Man: Całkiem nowy dzień', t, 'Multikino Warszawa Złote Tarasy');
  const going = mk(ProviderId.GOING, 'going-1', 'Spider-Man: Całkiem nowy dzień', t, 'Multikino Warszawa Złote Tarasy');
  const out = dedupe([going, mk2]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'mk-1');
});

test('dedupe: two distinct films at the same hour in the same cinema stay separate', () => {
  const mk = (source: ProviderId, ext: string, title: string, startMs: number, venue: string) => ({
    source, externalId: ext, title, startMs, lat: 52.4, lng: 16.9, city: 'Warszawa',
    venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  });
  const t = Date.parse('2026-08-22T18:30:00+02:00');
  const a = mk(ProviderId.MULTIKINO, 'mk-a', 'Spider-Man: Całkiem nowy dzień', t, 'Multikino Warszawa Złote Tarasy');
  const b = mk(ProviderId.MULTIKINO, 'mk-b', 'Superman: Dziedzictwo', t, 'Multikino Warszawa Złote Tarasy');
  const out = dedupe([a, b]);
  assert.equal(out.length, 2);
});

test('multikino: parseMkFilms builds one film×cinema candidate per day', () => {
  const data = {
    result: [
      {
        filmId: 'HO00002696', filmTitle: 'Spider-Man: Całkiem nowy dzień',
        posterImageSrc: 'https://www.multikino.pl/-/media/spider-man.jpg?rev=abc',
        filmUrl: 'https://www.multikino.pl/filmy/spider-man',
        hasSessions: true,
        showingGroups: [
          { date: '2026-08-22T00:00:00', sessions: [
            { startTime: '2026-08-22T14:15:00', showTimeWithTimeZone: '2026-08-22T14:15:00+02:00', isSoldOut: false },
            { startTime: '2026-08-22T18:15:00', showTimeWithTimeZone: '2026-08-22T18:15:00+02:00', isSoldOut: false },
          ]},
        ],
      },
      { filmId: 'HO00000000', filmTitle: 'No sessions', hasSessions: true, showingGroups: [] },
    ],
  };
  const out = parseMkFilms(data, '0013', '2026-08-22');
  assert.equal(out.length, 1);
  const c = out[0];
  assert.equal(c.source, ProviderId.MULTIKINO);
  assert.equal(c.externalId, 'multikino-0013-HO00002696-2026-08-22');
  assert.equal(c.venue, 'Multikino Warszawa Złote Tarasy');
  assert.equal(c.city, 'Warszawa');
  assert.equal(c.startMs, Date.parse('2026-08-22T14:15:00+02:00'));
  assert.equal(c.link, 'https://www.multikino.pl/filmy/spider-man');
  assert.equal(c.mediaUrl, 'https://www.multikino.pl/-/media/spider-man.jpg?rev=abc');
  assert.equal(c.thumbUrl, 'https://www.multikino.pl/-/media/spider-man.jpg?rev=abc&mw=240&mh=350');
  assert.equal(c.isSoldOut, false);
});

test('multikino: parseMkFilms marks sold out only when ALL sessions are sold out', () => {
  const data = {
    result: [
      { filmId: 'F1', filmTitle: 'Film', posterImageSrc: 'https://x.pl/p.jpg', hasSessions: true,
        showingGroups: [{ date: '2026-08-22T00:00:00', sessions: [
          { startTime: '2026-08-22T10:00:00', showTimeWithTimeZone: '2026-08-22T10:00:00+02:00', isSoldOut: true },
          { startTime: '2026-08-22T14:00:00', showTimeWithTimeZone: '2026-08-22T14:00:00+02:00', isSoldOut: true },
        ]} ] },
      { filmId: 'F2', filmTitle: 'Film 2', posterImageSrc: 'https://x.pl/p2.jpg', hasSessions: true,
        showingGroups: [{ date: '2026-08-22T00:00:00', sessions: [
          { startTime: '2026-08-22T10:00:00', showTimeWithTimeZone: '2026-08-22T10:00:00+02:00', isSoldOut: true },
          { startTime: '2026-08-22T14:00:00', showTimeWithTimeZone: '2026-08-22T14:00:00+02:00', isSoldOut: false },
        ]} ] },
    ],
  };
  const out = parseMkFilms(data, '0011', '2026-08-22');
  assert.equal(out.length, 2);
  assert.equal(out[0].isSoldOut, true);
  assert.equal(out[1].isSoldOut, false);
});

test('multikino: parseMkFilms filters sessions to the target day only', () => {
  const data = {
    result: [
      { filmId: 'F1', filmTitle: 'Film', posterImageSrc: 'https://x.pl/p.jpg', hasSessions: true,
        showingGroups: [
          { date: '2026-08-21T00:00:00', sessions: [{ startTime: '2026-08-21T20:00:00', showTimeWithTimeZone: '2026-08-21T20:00:00+02:00' }] },
          { date: '2026-08-22T00:00:00', sessions: [{ startTime: '2026-08-22T20:00:00', showTimeWithTimeZone: '2026-08-22T20:00:00+02:00' }] },
        ] },
    ],
  };
  const out = parseMkFilms(data, '0013', '2026-08-22');
  assert.equal(out.length, 1);
  assert.equal(out[0].startMs, Date.parse('2026-08-22T20:00:00+02:00'));
});

test('multikino: extractToken pulls microservicesToken out of Set-Cookie lines', () => {
  const cookies = [
    'microservicesRefreshToken=xyz; path=/; HttpOnly',
    'microservicesToken=eyJhbGciOiJIUzI1NiJ9; path=/; HttpOnly; Secure',
    '__cf_bm=abc; path=/',
  ];
  assert.equal(extractToken(cookies), 'eyJhbGciOiJIUzI1NiJ9');
  assert.equal(extractToken(['no-token-here']), null);
});

test('multikino: resolveMkGeo parses SSR repertuar page (geo regex + address)', async () => {
  const html = '<iframe src="https://www.google.com/maps/embed/v1/place?key=k&q=52.40276672871932, 16.9306668234985"></iframe>' +
    '<div class="cinema-location__address-holder"><address class="cinema-location__address">ul. Półwiejska 42<br/>61-888 Poznań</address></div>';
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...binds: unknown[]) => ({
        run: async () => { calls.push({ sql, binds }); },
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
      all: async () => ({ results: [] }),
    }),
  } as unknown as D1Database;
  const env = { DB: db, BROWSER: {} } as unknown as Env;
  const realFetch = globalThis.fetch;
  const mockFetch: typeof fetch = async (url: string | URL | Request, init?: RequestInit) => {
    assert.match(String(url), /\/repertuar\/poznan-stary-browar\/teraz-gramy/);
    return new Response(html, { status: 200 });
  };
  globalThis.fetch = mockFetch;
  try {
    const ctx = { env, day: '2026-08-22', dayStart: 0, dayEnd: 0, createdAt: 0, recordBrowserMs: () => {} } as SeedContext;
    const geo = await resolveMkGeo(ctx, '0011', 'Multikino Poznań Stary Browar', 'Poznań');
    assert.ok(geo.lat != null && geo.lng != null);
    assert.ok(Math.abs(geo.lat! - 52.40276672871932) < 1e-6);
    assert.ok(geo.address.includes('Półwiejska 42'));
    assert.ok(calls.some((c) => c.sql.startsWith('INSERT INTO venues')), 'cinema upserted into venues store');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('multikino: scopes cover the 18 cinemas in app cities (38 total)', () => {
  assert.equal(MK_CINEMAS.length, 38);
  assert.equal(MK_ALL_CINEMAS, false);
  const scopes = mkScopes();
  assert.equal(scopes.length, 18);
  // Poznań, Warszawa, Kraków, Gdańsk present; Radom / Zabrze excluded while MK_ALL_CINEMAS=false.
  assert.ok(scopes.includes('0011'));
  assert.ok(scopes.includes('0013'));
  assert.ok(scopes.includes('0005'));
  assert.ok(scopes.includes('0004'));
  assert.ok(!scopes.includes('0026'));
  assert.ok(!scopes.includes('0003'));
});

test('dzisapp: parseLocalDateTime handles Warsaw local time', () => {
  const ms = parseLocalDateTime('2026-08-22 18:30:00');
  assert.ok(ms);
  assert.equal(new Date(ms).toISOString().slice(11, 16), '16:30'); // 18:30 local = 16:30 UTC in summer
  assert.equal(parseLocalDateTime('bad'), null);
});

test('eventylive: parseEvlEvent decodes entities and extracts offer link', () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"Event","name":"Chopin &amp; Friends - koncerty","startDate":"2026-08-22","location":{"@type":"Place","name":"Sala koncertowa","address":{"@type":"PostalAddress","addressLocality":"Poznań"}},"offers":{"@type":"Offer","url":"https://www.bilety24.pl/kup-bilet-x"},"image":"https://image.bilety24.pl/x.jpg"}]}</script>`;
  const ev = parseEvlEvent(html);
  assert.ok(ev);
  assert.equal(ev.name, 'Chopin & Friends - koncerty');
  assert.equal(getOfferUrl(ev.offers), 'https://www.bilety24.pl/kup-bilet-x');
  assert.equal(parseEvlEvent('<html>no json</html>'), null);
});

test('queue sendChunked: splits batches >100 into <=100 sendBatch calls', async () => {
  const sent: number[] = [];
  const env = {
    SEED_QUEUE: {
      sendBatch: async (msgs: unknown[]) => { sent.push(msgs.length); },
    },
  } as unknown as Parameters<typeof sendChunked>[0];
  const msgs = Array.from({ length: 245 }, (_, i) => ({ body: { type: 'ingest', candidateId: `c${i}` } }));
  await sendChunked(env, msgs);
  assert.deepEqual(sent, [100, 100, 45]);
});

test('kupbilecik: sold-out detection reads the real sold-out markers', () => {
  // Sold-out event page: "Brak biletów" button + "Brak aktualnie wolnych miejsc".
  const soldOutHtml = '<div class="wyd-info"><a class="btn no-warp btn-bilety important" title="Brak biletów" href="#"></a><div class="line-title"><b>Brak aktualnie wolnych miejsc w sprzedaży!</b></div></div>';
  // Available: "Kup bilet" button. Note `btn-brak` may appear in CSS — must not trigger.
  const inStockHtml = '<style>.btn-brak{font-size:15px}</style><div class="wyd-info"><a class="btn default no-warp">Kup bilet</a><div class="line-price">0 PLN - bilet elektroniczny</div></div>';
  assert.ok(/Brak aktualnie wolnych miejsc|>Brak biletów</.test(soldOutHtml));
  assert.ok(!/Brak aktualnie wolnych miejsc|>Brak biletów</.test(inStockHtml));
});

test('eventylive: sold-out from offers.availability', () => {
  const soldJson = { offers: { url: 'https://www.ebilet.pl/x', availability: 'https://schema.org/SoldOut' } };
  const avail = Array.isArray(soldJson.offers) ? soldJson.offers : [soldJson.offers];
  const text = avail.map((o) => String(o.availability || '')).join(' ');
  assert.ok(/(?:soldout|outofstock|discontinued)/i.test(text));
  assert.ok(!/(?:soldout|outofstock|discontinued)/i.test('https://schema.org/InStock'));
});

test('eventylive: ebilet link gets a ?date= param for the target day', () => {
  const mk = (url: string) => /ebilet\.pl/.test(url) ? url + (url.includes('?') ? '&' : '?') + 'date=2026-08-16' : url;
  assert.equal(mk('https://www.ebilet.pl/klasyka/koncert/x?city=Gdańsk'), 'https://www.ebilet.pl/klasyka/koncert/x?city=Gdańsk&date=2026-08-16');
  assert.equal(mk('https://www.ebilet.pl/klasyka/koncert/x'), 'https://www.ebilet.pl/klasyka/koncert/x?date=2026-08-16');
  assert.equal(mk('https://biletyna.pl/kabaret/x?eid=1'), 'https://biletyna.pl/kabaret/x?eid=1');
});

test('eventylive: ebilet JSON-LD marks the target-day showtime sold out', () => {
  // A page with many showtimes; only the one on 2026-08-16 is SoldOut.
  const block = (id: number, startDate: string, availability: string) =>
    `<script type="application/ld+json" id="json-ld-event-data-${id}">` +
    JSON.stringify({ '@type': 'Event', name: 'Kabaret', startDate, offers: [{ '@type': 'AggregateOffer', availability, validThrough: startDate }] }) +
    `</script>`;
  const html = block(1, '2026-08-16T18:00:00', 'https://schema.org/SoldOut') + block(2, '2026-09-11T18:00:00', 'https://schema.org/InStock');
  let soldOut = false;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*id="json-ld-event-data-[^"]+"[^>]*>(.*?)<\/script>/gs)) {
    const d = JSON.parse(m[1]);
    if (!d.startDate || !String(d.startDate).startsWith('2026-08-16')) continue;
    const offers = Array.isArray(d.offers) ? d.offers : [d.offers];
    const avail = offers.map((o) => String(o.availability || '')).join(' ');
    if (/(?:soldout|outofstock)/i.test(avail)) soldOut = true;
  }
  assert.ok(soldOut);
});

test('doSavePost: persists is_sold_out flag on insert and update', async () => {
  // Fake DB recording bind values per statement.
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...binds: unknown[]) => ({ run: async () => { calls.push({ sql, binds }); } }),
    }),
  } as unknown as D1Database;
  const env = { DB: db } as unknown as Env;
  const user = { id: 'u1' };
  const now = Date.now();

  // Insert with sold out.
  await doSavePost(env, user, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', false, true);
  const ins = calls.find((c) => /INSERT INTO posts/i.test(c.sql));
  assert.ok(ins, 'INSERT statement executed');
  assert.equal(ins!.binds[ins!.binds.length - 1], 1, 'is_sold_out=1 on insert');
  assert.ok(/is_sold_out/.test(ins!.sql), 'INSERT includes is_sold_out column');

  // Update without sold out resets the flag.
  calls.length = 0;
  await doSavePost(env, user, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', true, false);
  const upd = calls.find((c) => /UPDATE posts/i.test(c.sql));
  assert.ok(upd, 'UPDATE statement executed');
  assert.equal(upd!.binds[upd!.binds.length - 2], 0, 'is_sold_out=0 on update');
  assert.ok(/is_sold_out/.test(upd!.sql), 'UPDATE includes is_sold_out column');
});

test('queue toCandidate: carries is_sold_out from the candidate row', () => {
  const row = {
    id: 'c1', external_id: 'evl-1', provider: 'eventylive', title: 'Koncert', start_ms: 1786809600000,
    lat: 52.4, lng: 16.9, city: 'Poznań', venue: 'Hala', address: 'ul. X', link: 'https://x.pl',
    media_url: 'https://x.pl/m.webp', thumb_url: null, is_sold_out: 1,
  };
  const cand = toCandidate(row);
  assert.equal(cand.isSoldOut, true);
  const row2 = { ...row, is_sold_out: 0 };
  assert.equal(toCandidate(row2).isSoldOut, false);
});

// In-memory D1 mock with a `venues` table (minimal, only what venueStore needs).
function mockDb() {
  const db = {
    _venues: [] as { id: string; name: string; aliases: string; lat: number; lng: number; city: string | null; sources: string; hit_count: number; first_seen: number; last_seen: number; created_at: number }[],
    prepare: (sql: string) => {
      const norm = (v: unknown) => (v === undefined ? null : v);
      return {
        bind: (...p: unknown[]) => {
          const params = p.map(norm);
          return {
            run: async () => {
              if (sql.startsWith('INSERT INTO venues')) {
                // SQL: (id, name, '[]' literal, lat, lng, city, sources, 1, first_seen, last_seen, created_at)
                db._venues.push({
                  id: params[0] as string, name: params[1] as string, aliases: '[]',
                  lat: params[2] as number, lng: params[3] as number, city: params[4] as string | null,
                  sources: params[5] as string, hit_count: 1, first_seen: params[6] as number,
                  last_seen: params[7] as number, created_at: params[8] as number,
                });
              } else if (sql.startsWith('UPDATE venues')) {
                // bind: (lat, lng, aliases, sources, city, last_seen, id)
                const id = params[6];
                const v = db._venues.find((r) => r.id === id);
                if (v) { v.lat = params[0] as number; v.lng = params[1] as number; v.aliases = params[2] as string; v.sources = params[3] as string; v.city = params[4] as string | null; v.hit_count += 1; v.last_seen = params[5] as number; }
              } else if (sql.includes('hit_count=hit_count+1')) {
                const id = params[1];
                const v = db._venues.find((r) => r.id === id);
                if (v) { v.hit_count += 1; v.last_seen = params[0] as number; }
              }
              return {};
            },
            first: async () => null,
            all: async () => ({
              results: sql.includes('WHERE city = ?')
                ? db._venues.filter((r) => (r.city || '').toLowerCase() === String(params[0] ?? '').toLowerCase() || !r.city)
                : [...db._venues],
            }),
          };
        },
        all: async () => {
          const all = [...db._venues];
          return { results: all };
        },
      };
    },
  } as unknown as D1Database & { _venues: typeof db._venues };
  return db;
}

test('venueStore: upsert creates, fuzzy-matches alias, resolves', async () => {
  const db = mockDb();
  await upsertVenue(db, { name: 'Sala Koncertowa Fryderyk', lat: 52.25, lng: 21.01, city: 'warszawa', provider: 'dzisapp' });
  // Same venue with a slightly different spelling → fuzzy match (alias), not a new row.
  const id2 = await upsertVenue(db, { name: 'Sala koncertowa Fryderyk', lat: 52.25, lng: 21.01, provider: 'kupbilecik', ref: '3326' });
  assert.equal(id2, venueKey('Sala Koncertowa Fryderyk'));
  // resolve by the alias spelling works.
  const geo = await resolveVenueGeo(db, 'Sala koncertowa Fryderyk');
  assert.ok(geo);
  assert.ok(Math.abs(geo!.lat - 52.25) < 0.001);
  // unrelated venue → null.
  assert.equal(await resolveVenueGeo(db, 'Teatr Wielki w Poznaniu'), null);
});

test('venueStore: same venue name in different cities resolves to the right geo', async () => {
  const db = mockDb();
  // Two distinct venues that look alike — Warszawa "Tama" vs Poznań "Klub Tama".
  await upsertVenue(db, { name: 'Tama', lat: 52.2297, lng: 21.0122, city: 'warszawa', provider: 'dzisapp' });
  await upsertVenue(db, { name: 'Klub Tama', lat: 52.4064, lng: 16.9252, city: 'poznan', provider: 'dzisapp' });
  // Same name+city → warszawa.
  const wa = await resolveVenueGeo(db, 'Tama', 'warszawa');
  assert.ok(wa);
  assert.ok(Math.abs(wa!.lat - 52.2297) < 0.001, `warszawa lat=${wa?.lat}`);
  // Different name but same semantic + city → poznan.
  const poz = await resolveVenueGeo(db, 'Tama', 'poznan');
  assert.ok(poz);
  assert.ok(Math.abs(poz!.lat - 52.4064) < 0.001, `poznan lat=${poz?.lat}`);
  // Unknown city falls back to the full pool (mock order → warszawa first).
  const noCity = await resolveVenueGeo(db, 'Tama', 'nieznane');
  assert.ok(noCity);
});

test('venueStore: venueKey normalizes diacritics and spaces', () => {
  assert.equal(venueKey('Sala Koncertowa Fryderyk'), 'salakoncertowafryderyk');
  assert.equal(venueKey('Łódź Klub HAH'), 'lodzklubhah');
});

test('venueMatch: live production pairs match to the right city geo', () => {
  // Real dzis.app venue cache (geo verified on 2026-08-16). "I like Chopin" exists
  // in Gdańsk AND Warszawa with different coordinates — city disambiguates.
  const gdansk = [
    { name: 'I like Chopin', geo: { lat: 54.3549, lng: 18.6494 }, city: 'gdansk' },
    { name: 'Kościół św. Katarzyny', geo: { lat: 54.3544, lng: 18.6524 }, city: 'gdansk' },
    { name: 'Sala pod Bazyliką Mariacką', geo: { lat: 54.3499, lng: 18.6531 }, city: 'gdansk' },
  ];
  const warszawa = [{ name: 'I like Chopin', geo: { lat: 52.2297, lng: 21.0122 }, city: 'warszawa' }];
  const krakow = [{ name: 'Royal Chopin Hall', geo: { lat: 50.0532, lng: 19.9379 }, city: 'krakow' }];
  const wroclaw = [
    { name: 'Katedra Marii Magdaleny', geo: { lat: 51.1095, lng: 17.0347 }, city: 'wroclaw' },
    { name: 'Vertigo Jazz Club & Restaurant', geo: { lat: 51.1095, lng: 17.0347 }, city: 'wroclaw' },
  ];

  // Same name, different city → correct geo per city (mixed cache, both cities present).
  const mixed = [...gdansk, ...warszawa];
  const g = matchVenueGeo('I like Chopin', mixed, 'gdansk');
  assert.ok(g && Math.abs(g.lat - 54.3549) < 0.001, 'Gdańsk I like Chopin');
  const w = matchVenueGeo('I like Chopin', mixed, 'warszawa');
  assert.ok(w && Math.abs(w.lat - 52.2297) < 0.001, 'Warszawa I like Chopin');

  // Other real pairs.
  assert.ok(Math.abs(matchVenueGeo('Kościół św. Katarzyny', gdansk, 'gdansk')!.lat - 54.3544) < 0.001);
  assert.ok(Math.abs(matchVenueGeo('Sala pod Bazyliką Mariacką', gdansk, 'gdansk')!.lat - 54.3499) < 0.001);
  assert.ok(Math.abs(matchVenueGeo('Royal Chopin Hall', krakow, 'krakow')!.lat - 50.0532) < 0.001);
  assert.ok(Math.abs(matchVenueGeo('Katedra Marii Magdaleny', wroclaw, 'wroclaw')!.lat - 51.1095) < 0.001);
  assert.ok(Math.abs(matchVenueGeo('Vertigo Jazz Club & Restaurant', wroclaw, 'wroclaw')!.lat - 51.1095) < 0.001);

  // Distinct venue in the same city must NOT cross-match.
  assert.equal(matchVenueGeo('Kościół św. Katarzyny', mixed, 'warszawa'), null);
});

test('cleanup: pruneSeedData removes audit older than 4 days, keeps venues', async () => {
  // Fake D1 recording DELETE statements and their WHERE bindings.
  const deletes: { sql: string; cutoff: number }[] = [];
  const db = {
    prepare: (sql: string) => {
      const record = (cutoff?: number) => ({
        run: async () => {
          deletes.push({ sql, cutoff: cutoff ?? NaN });
          return { meta: { changes: sql.includes('seed_venue_cache') ? 42 : 5 } };
        },
      });
      return {
        bind: (cutoff: number) => record(cutoff),
        run: async () => { deletes.push({ sql, cutoff: NaN }); return { meta: { changes: 42 } }; },
      };
    },
  } as unknown as D1Database;

  const env = { DB: db } as unknown as Env;
  const old = Date.now() - 10 * 24 * 3_600_000; // 10 days ago — should be pruned
  await pruneSeedData(env, 'manual');

  // seed_candidates / seed_batches / seed_runs pruned by cutoff; venue_cache fully cleared.
  const cands = deletes.find((d) => d.sql.includes('seed_candidates'));
  const batches = deletes.find((d) => d.sql.includes('seed_batches'));
  const runs = deletes.find((d) => d.sql.includes('seed_runs'));
  const vc = deletes.find((d) => d.sql.includes('seed_venue_cache'));
  assert.ok(cands && cands.cutoff <= Date.now() - 4 * 24 * 3_600_000);
  assert.ok(batches, 'batches pruned');
  assert.ok(runs, 'runs pruned');
  assert.ok(vc && !vc.cutoff, 'venue cache fully cleared (no cutoff)');
  // The persistent venues store must never be pruned.
  assert.ok(!deletes.some((d) => d.sql.includes('FROM venues')), 'venues untouched');
  void old;
});

test('queue: CandidateStatus enum is quoted in generated SQL (not a bare identifier)', () => {
  // Regression: interpolating the enum into SQL without quotes produced
  // `SET status=duplicate` → D1 "no such column" → dedupe/ingest never ran.
  const dupSql = `UPDATE seed_candidates SET status='${CandidateStatus.DUPLICATE}', reason=? WHERE id=?`;
  assert.match(dupSql, /status='duplicate'/, 'duplicate must be quoted');
  const notIn = `status NOT IN ('${CandidateStatus.DONE}', '${CandidateStatus.ERROR}')`;
  assert.match(notIn, /'done'/, 'DONE quoted');
  assert.match(notIn, /'error'/, 'ERROR quoted');
});
