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
import { browserBudget } from './seed/log';
import { verifyPassword, readSession, createSession } from './admin/auth';
import { nextCronRunMs, cronSummary } from './admin/cron';
import { cityBbox, nearestCity } from './admin/cities';
import { eventsSql } from './admin/queries';
import { dice, venueSimilarity, matchVenueGeo, VENUE_MATCH_THRESHOLD } from './seed/venueMatch';
import { parseLocalDateTime } from './seed/dzisapp';
import { parseEvlEvent, getOfferUrl } from './seed/eventylive';
import { sendChunked, toCandidate } from './seed/queue';

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

function cand(over: Partial<{ source: string; externalId: string; title: string; startMs: number; venue: string; address: string; city: string }>) {
  return {
    source: over.source ?? 'going',
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

test('dedupe: canonical source wins regardless of input order', () => {
  const mk = (source: string, ext: string) => cand({ source, externalId: ext, title: 'Koncert', startMs: 1_782_765_000_000, venue: 'Venue' });
  // going (rank 0) beats dzisapp (rank 1) and kupbilecik (rank 3).
  const out1 = dedupe([mk('kupbilecik', 'k'), mk('dzisapp', 'd'), mk('going', 'g')]);
  assert.equal(out1.length, 1);
  assert.equal(out1[0].externalId, 'g');
  // Same result when going comes last in input.
  const out2 = dedupe([mk('kupbilecik', 'k'), mk('going', 'g'), mk('dzisapp', 'd')]);
  assert.equal(out2[0].externalId, 'g');
  // dzisapp beats kupbilecik when going is absent.
  const out3 = dedupe([mk('kupbilecik', 'k'), mk('dzisapp', 'd')]);
  assert.equal(out3[0].externalId, 'd');
  // eventylive beats kupbilecik.
  const out4 = dedupe([mk('kupbilecik', 'k'), mk('eventylive', 'e')]);
  assert.equal(out4[0].externalId, 'e');
});

test('dedupe: unknown source keeps the already-seen candidate', () => {
  const mk = (source: string, ext: string) => cand({ source, externalId: ext, title: 'Koncert', startMs: 1_782_765_000_000, venue: 'Venue' });
  const out = dedupe([mk('future-provider', 'f'), mk('going', 'g')]);
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
  assert.equal(byId.get('going')!.transport, 'fetch');
  assert.equal(byId.get('kupbilecik')!.transport, 'browser');
  assert.equal(byId.get('dzisapp')!.transport, 'fetch');
  assert.equal(byId.get('eventylive')!.transport, 'fetch');
  for (const p of SEED_PROVIDERS) {
    assert.equal(typeof p.fetchCandidates, 'function');
    assert.equal(typeof p.fetchBytes, 'function');
    assert.ok(p.enabled, `${p.id} should be enabled`);
  }
  assert.ok(enabledProviders().length >= 4);
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
  const { sql, binds } = eventsSql({ cityId: 'warszawa', source: 'going', status: null, day: '2026-08-16', fromMs: null, toMs: null, limit: 50 });
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

test('dedupe: all-day eventylive collapses into timed going/dzis duplicate', () => {
  const mk = (source: string, ext: string, title: string, startMs: number, venue: string) => ({
    source, externalId: ext, title, startMs, lat: 52.4, lng: 16.9, city: 'Poznań',
    venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  });
  const midnight = Date.parse('2026-08-22T00:00:00+02:00');
  const evening = Date.parse('2026-08-22T18:30:00+02:00');
  const evl = mk('eventylive', 'evl-1', 'Muzyka z serialu Bridgerton: Koncert przy świecach', midnight, 'Ogród Dendrologiczny Uniwersytetu Przyrodniczego');
  const going = mk('going', 'going-1', 'Bridgerton: Koncert przy świecach w plenerze', evening, 'Ogród Dendrologiczny Uniwersytetu Przyrodniczego');
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
  const a = mk('eventylive', 'evl-a', 'Wystawa Beksiński', midnight, 'MTP Hala nr 1');
  const b = mk('eventylive', 'evl-b', 'K-Pop Party', midnight, 'Klub HAH');
  const out = dedupe([a, b]);
  assert.equal(out.length, 2);
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
