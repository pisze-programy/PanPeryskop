import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enabledProviders, SEED_PROVIDERS } from '../src/seed';
import { ProviderId, SeedContext } from '../src/seed/core/types';
import { parseLocalDateTime } from '../src/seed/providers/dzisapp';
import { parseEvlEvent, getOfferUrl } from '../src/seed/providers/eventylive';
import { parseMkFilms, extractToken, resolveMkGeo } from '../src/seed/providers/multikino';
import { mkScopes, MK_CINEMAS, MK_ALL_CINEMAS } from '../src/seed/core/constants';

test('providers: going=fetch, kupbilecik=browser, all enabled (multikino local-only)', () => {
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
  }
  assert.ok(byId.get('going')!.enabled);
  assert.ok(byId.get('kupbilecik')!.enabled);
  assert.ok(byId.get('dzisapp')!.enabled);
  assert.ok(byId.get('eventylive')!.enabled);
  assert.equal(byId.get('multikino')!.enabled, false, 'multikino fetched locally (clean IP), not from the Worker');
  assert.ok(enabledProviders().length >= 4);
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
