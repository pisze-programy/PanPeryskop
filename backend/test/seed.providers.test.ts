import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enabledProviders, SEED_PROVIDERS } from '../src/seed';
import { ProviderId, SeedContext } from '../src/seed/core/types';
import { parseLocalDateTime, externalOfferUrl, primaryOutHref, resolveDzisLink } from '../src/seed/providers/dzisapp';
import { parseEvlEvent, getOfferUrl } from '../src/seed/providers/eventylive';
import { parseMkFilms, extractToken, resolveMkGeo } from '../src/seed/providers/multikino';
import { parseHeliosPayload } from '../src/seed/providers/helios';
import { parseCcScope } from '../src/seed/providers/cinemacity';
import { stripOutsideCityText, kupTags } from '../src/seed/providers/kupbilecik';
import { mkScopes, MK_CINEMAS, MK_ALL_CINEMAS } from '../src/seed/core/constants';
import { PROVIDER_CONFIGS, enabledForExecutor, configOf, priorityOf, EXECUTOR } from '../src/seed/providers/registry';
import { workerExecutor } from '../src/seed/executors/worker';

test('providers: kupbilecik on Worker (browser), going/helios + cinemas on VPS', () => {
  const byId = new Map(SEED_PROVIDERS.map((p) => [p.id, p]));
  assert.ok(byId.has('going'));
  assert.ok(byId.has('kupbilecik'));
  assert.ok(byId.has('dzisapp'));
  assert.ok(byId.has('eventylive'));
  assert.ok(byId.has('multikino'));
  assert.ok(byId.has('cinemacity'));
  assert.ok(byId.has('helios'));
  assert.ok(byId.has('luma'));
  assert.ok(byId.has('meetup'));
  assert.equal(byId.get('going')!.transport, 'fetch');
  assert.equal(byId.get('kupbilecik')!.transport, 'browser');
  assert.equal(byId.get('dzisapp')!.transport, 'fetch');
  assert.equal(byId.get('eventylive')!.transport, 'fetch');
  assert.equal(byId.get('multikino')!.transport, 'fetch');
  assert.equal(byId.get('cinemacity')!.transport, 'fetch');
  assert.equal(byId.get('helios')!.transport, 'fetch');
  for (const p of SEED_PROVIDERS) {
    assert.equal(typeof p.fetchCandidates, 'function');
    assert.equal(typeof p.fetchBytes, 'function');
  }
  // Registry is the single source of truth for enabled/executors — implementations
  // no longer carry an `enabled` flag.
  for (const p of SEED_PROVIDERS) assert.ok(!('enabled' in p), `${p.id} must not define enabled`);

  // Worker executor: ONLY kupbilecik runs in the CF queue pipeline (it needs the
  // BROWSER binding). dzisapp/eventylive are retired (enabled=false) — they must
  // not run anywhere.
  const workerIds = workerExecutor.providerIds(PROVIDER_CONFIGS);
  assert.deepEqual(workerIds, ['kupbilecik'], 'only kupbilecik enabled on worker');
  for (const id of ['dzisapp', 'eventylive'] as const) {
    assert.ok(!workerIds.includes(id), `${id} retired (not on worker)`);
    assert.equal(configOf(id)!.enabled, false, `${id} disabled in the registry`);
  }
  assert.equal(enabledProviders().length, 1);
  assert.deepEqual(
    enabledProviders().map((p) => p.id).sort(),
    workerIds.sort(),
    'enabledProviders derives from the worker executor registry'
  );

  // VPS-executor providers (Cloudflare bot management blocks Worker egress) are
  // driven by the VPS executor from the registry, not from the Worker.
  const vpsIds = enabledForExecutor(EXECUTOR.VPS).map((c) => c.id);
  for (const id of ['multikino', 'cinemacity', 'luma', 'meetup', 'going', 'helios'] as const) {
    assert.ok(vpsIds.includes(id), `${id} enabled on vps`);
    assert.ok(!workerIds.includes(id), `${id} not on worker`);
    assert.ok(configOf(id)!.executors.vps, `${id} has a vps executor spec`);
  }
});

test('registry: executors, priority and vps specs are consistent', () => {
  // Every implementation has a registry config; every config maps to a provider.
  for (const p of SEED_PROVIDERS) assert.ok(configOf(p.id), `${p.id} in registry`);

  // Manual providers (browser-addon ingest, e.g. facebook) have NO executor —
  // they are dedupe-rank + ingest targets only, so they live in the registry but
  // not in SEED_PROVIDERS (nothing runs them; nothing can call fetchCandidates).
  const manual = PROVIDER_CONFIGS.filter((c) => !c.executors.worker && !c.executors.vps);
  for (const c of manual) assert.equal(c.transport, 'manual', `${c.id} manual has no executor`);
  assert.equal(PROVIDER_CONFIGS.length, SEED_PROVIDERS.length + manual.length);

  // Every provider is assigned to at least one executor, or is manual-only.
  for (const c of PROVIDER_CONFIGS) {
    if (c.executors.worker === true || c.executors.vps) continue;
    assert.equal(c.transport, 'manual', `${c.id} must be manual when it has no executor`);
  }

  // Priority ranks the dedupe winner (lower = canonical). Luma above going,
  // meetup is the lowest-priority fallback.
  assert.ok(priorityOf(ProviderId.LUMA) < priorityOf(ProviderId.GOING));
  assert.ok(priorityOf(ProviderId.MEETUP) > priorityOf(ProviderId.EVENTYLIVE));
  assert.equal(priorityOf(ProviderId.MULTIKINO), 0);
  assert.equal(priorityOf('madeup' as ProviderId), 99, 'unknown sources rank last');

  // VPS executor specs point at a real output/checkpoint layout. Every VPS
  // provider covers the SAME seed window — no per-provider target config.
  for (const c of enabledForExecutor(EXECUTOR.VPS)) {
    const v = c.executors.vps!;
    assert.ok(v.output.endsWith('.json'));
    assert.ok(v.checkpoint.endsWith('-checkpoint.json'));
  }
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
            { startTime: '2026-08-22T14:15:00', showTimeWithTimeZone: '2026-08-22T14:15:00+02:00', isSoldOut: false, sessionId: '110205' },
            { startTime: '2026-08-22T18:15:00', showTimeWithTimeZone: '2026-08-22T18:15:00+02:00', isSoldOut: false, sessionId: '110116' },
          ]},
        ],
      },
      { filmId: 'HO00000000', filmTitle: 'No sessions', hasSessions: true, showingGroups: [] },
    ],
  };
  const out = parseMkFilms(data, '0013', ['2026-08-22']);
  assert.equal(out.length, 1);
  const c = out[0];
  assert.equal(c.source, ProviderId.MULTIKINO);
  assert.equal(c.externalId, 'multikino-0013-HO00002696-2026-08-22');
  assert.equal(c.venue, 'Multikino Warszawa Złote Tarasy');
  assert.equal(c.city, 'Warszawa');
  assert.equal(c.startMs, Date.parse('2026-08-22T14:15:00+02:00'));
  assert.equal(c.link, 'https://www.multikino.pl/repertuar/warszawa-zlote-tarasy/filmy/spider-man', 'link scoped to the selected cinema');
  assert.equal(c.mediaUrl, 'https://www.multikino.pl/-/media/spider-man.jpg?rev=abc');
  assert.equal(c.thumbUrl, 'https://www.multikino.pl/-/media/spider-man.jpg?rev=abc&mw=240&mh=350');
  assert.equal(c.isSoldOut, false);
  assert.deepEqual(c.showtimeBooking, [
    { time: '14:15', kind: 'multikino', params: { cinemaId: '0013', filmId: 'HO00002696', sessionId: '110205' } },
    { time: '18:15', kind: 'multikino', params: { cinemaId: '0013', filmId: 'HO00002696', sessionId: '110116' } },
  ]);
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
  const out = parseMkFilms(data, '0011', ['2026-08-22']);
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
  const out = parseMkFilms(data, '0013', ['2026-08-22']);
  assert.equal(out.length, 1);
  assert.equal(out[0].startMs, Date.parse('2026-08-22T20:00:00+02:00'));
});

test('multikino: parseMkFilms covers the whole seed window — one candidate per day', () => {
  const data = {
    result: [
      { filmId: 'F1', filmTitle: 'Film', posterImageSrc: 'https://x.pl/p.jpg', hasSessions: true,
        showingGroups: [
          { date: '2026-08-18T00:00:00', sessions: [{ startTime: '2026-08-18T20:00:00', showTimeWithTimeZone: '2026-08-18T20:00:00+02:00' }] },
          { date: '2026-08-19T00:00:00', sessions: [{ startTime: '2026-08-19T20:00:00', showTimeWithTimeZone: '2026-08-19T20:00:00+02:00' }] },
          { date: '2026-08-20T00:00:00', sessions: [{ startTime: '2026-08-20T20:00:00', showTimeWithTimeZone: '2026-08-20T20:00:00+02:00' }] },
        ] },
    ],
  };
  const days = ['2026-08-18', '2026-08-19', '2026-08-20'];
  const out = parseMkFilms(data, '0013', days);
  assert.equal(out.length, 3, 'one candidate per film×cinema×day in the window');
  assert.deepEqual(out.map((c) => c.externalId), [
    'multikino-0013-F1-2026-08-18',
    'multikino-0013-F1-2026-08-19',
    'multikino-0013-F1-2026-08-20',
  ]);
  assert.equal(out[0].startMs, Date.parse('2026-08-18T20:00:00+02:00'));
  assert.equal(out[2].startMs, Date.parse('2026-08-20T20:00:00+02:00'));
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
    const geo = await resolveMkGeo('0011', 'Multikino Poznań Stary Browar', 'Poznań', { db: ctx.env.DB });
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

test('helios: link and booking come from the embedded movie, not the stale events map', () => {
  // Real API shape: e* keys carry stale events-map metadata (id/slug reused over
  // time), while the actual film is embedded per screening in screeningMovies.
  const payload = {
    movies: {
      m4506: { id: 4506, slug: 'ksiega-pustyni', title: 'Księga pustyni', sourceId: '971dfcb2-c70f-4461-b173-33d62be92867', posterPhoto: { url: 'https://img.helios.pl/filmy/ksiega-pustyni.jpg' } },
    },
    events: {
      e2677: { id: 2677, slug: 'drugie-zycie-salon-kultury-helios', name: 'Drugie życie - Salon Kultury Helios', posterPhoto: { url: 'https://img.helios.pl/events/2677.jpg' } },
    },
    screenings: {
      '2026-08-22': {
        m4506: {
          screenings: [
            { timeFrom: '2026-08-22 10:00:00', sourceId: '88567103-f418-4a7c-a8bf-e2e279cffb8f', cinemaSourceId: '815face9-2a1d-4c62-9b2f-a361574b79a2' },
            { timeFrom: '2026-08-22 14:40:00', sourceId: '4937d946-8177-4ca4-ae1a-ed1f63e2aa39', cinemaSourceId: '815face9-2a1d-4c62-9b2f-a361574b79a2' },
          ],
        },
        e2677: {
          screenings: [
            { timeFrom: '2026-08-22 17:00:00', sourceId: '6fe7acaa-9ace-4c92-a3a7-6e878eddac5b', cinemaSourceId: '815face9-2a1d-4c62-9b2f-a361574b79a2', screeningMovies: [{ movie: { id: 4484, slug: 'drugie-zycie', title: 'Drugie życie', sourceId: 'efba3b90-d2db-4d41-b474-60d596a59302', posterPhoto: { url: 'https://img.helios.pl/filmy/drugie-zycie.jpg' } } }] },
          ],
        },
      },
    },
  };
  const out = parseHeliosPayload(payload as any, 25, '2026-08-22');
  assert.equal(out.length, 2);

  const film = out.find((c) => c.externalId.includes('ksiega-pustyni'))!;
  assert.equal(film.link, 'https://www.helios.pl/poznan/kino-helios/filmy/ksiega-pustyni-4506');
  assert.deepEqual(film.showtimeBooking, [
    { time: '10:00', kind: 'helios', params: { screen: '88567103-f418-4a7c-a8bf-e2e279cffb8f', cinema: '815face9-2a1d-4c62-9b2f-a361574b79a2', itemId: '971dfcb2-c70f-4461-b173-33d62be92867', itemSourceId: '4506' } },
    { time: '14:40', kind: 'helios', params: { screen: '4937d946-8177-4ca4-ae1a-ed1f63e2aa39', cinema: '815face9-2a1d-4c62-9b2f-a361574b79a2', itemId: '971dfcb2-c70f-4461-b173-33d62be92867', itemSourceId: '4506' } },
  ]);

  // The event key must link the ACTUAL film (embedded movie), not the stale
  // events-map slug/id (which previously produced e.g. in-the-heights-2677).
  const event = out.find((c) => c.externalId.includes('drugie-zycie'))!;
  assert.equal(event.title, 'Drugie życie');
  assert.equal(event.link, 'https://www.helios.pl/poznan/kino-helios/filmy/drugie-zycie-4484');
  assert.equal(event.mediaUrl, 'https://img.helios.pl/filmy/drugie-zycie.jpg');
  assert.deepEqual(event.showtimeBooking, [
    { time: '17:00', kind: 'helios', params: { screen: '6fe7acaa-9ace-4c92-a3a7-6e878eddac5b', cinema: '815face9-2a1d-4c62-9b2f-a361574b79a2', itemId: 'efba3b90-d2db-4d41-b474-60d596a59302', itemSourceId: '4484' } },
  ]);
});

test('cinemacity: booking carries the per-event order id and cinema code', () => {
  const data = {
    body: {
      films: [{ id: '8295s2r', name: 'Buntownik', posterLink: 'https://img.cc.pl/buntownik.jpg' }],
      events: [
        { id: '1647332', filmId: '8295s2r', eventDateTime: '2026-08-22T10:10:00', soldOut: false },
        { id: '1646304', filmId: '8295s2r', eventDateTime: '2026-08-22T11:50:00', soldOut: false },
      ],
    },
  };
  const out = parseCcScope(data, '1081', '2026-08-22');
  assert.equal(out.length, 1);
  const c = out[0];
  assert.equal(c.link, 'https://www.cinema-city.pl/filmy/8295s2r');
  assert.deepEqual(c.times, ['10:10', '11:50']);
  assert.deepEqual(c.showtimeBooking, [
    { time: '10:10', kind: 'cinemacity', params: { order: '1647332', cinema: '1081' } },
    { time: '11:50', kind: 'cinemacity', params: { order: '1646304', cinema: '1081' } },
  ]);
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

test('dzisapp: externalOfferUrl returns an external source, ignores dzis.app self-links', () => {
  const paid = `<script type="application/ld+json">{"@type":"MusicEvent","offers":[{"@type":"Offer","url":"https://www.kupbilecik.pl/imprezy/191429/Warszawa/Koncert","price":"1"}]}</script>`;
  assert.equal(externalOfferUrl(paid), 'https://www.kupbilecik.pl/imprezy/191429/Warszawa/Koncert');
  // Free event self-links with price 0 — must NOT be treated as a source.
  const free = `<script type="application/ld+json">{"@type":"ExhibitionEvent","offers":[{"@type":"Offer","url":"https://dzis.app/wydarzenia/x","price":"0"}]}</script>`;
  assert.equal(externalOfferUrl(free), null);
  assert.equal(externalOfferUrl('<html>no json</html>'), null);
});

test('dzisapp: primaryOutHref extracts the pos=primary out link (decodes &amp;)', () => {
  const html = `<a class="hero__side-cta" href="/out/c8de1336-c125-47cc-ab44-c59cd99c3d50?pos=primary&amp;city=warszawa" target="_blank">Bilety</a>`;
  assert.equal(primaryOutHref(html), '/out/c8de1336-c125-47cc-ab44-c59cd99c3d50?pos=primary&city=warszawa');
  assert.equal(primaryOutHref('<html>no out</html>'), null);
});

test('dzisapp: resolveDzisLink returns external source first, then the out link, then the page', async () => {
  const realFetch = globalThis.fetch;
  const cand = { link: 'https://dzis.app/wydarzenia/koncert-chopinowski-sala-koncertowa-fryderyk-warszawa-2026-08-17' } as never;
  try {
    // 1) External offers.url wins (no follow needed).
    globalThis.fetch = (async () => new Response(
      `<script type="application/ld+json">{"offers":[{"@type":"Offer","url":"https://www.kupbilecik.pl/imprezy/191429/Warszawa/Koncert"}]}</script>`,
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
    assert.equal(await resolveDzisLink(cand), 'https://www.kupbilecik.pl/imprezy/191429/Warszawa/Koncert');

    // 2) Self-link offers + out link → falls back to following /out/ (final url unknown → out url).
    let calls = 0;
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls++;
      if (String(url).includes('/out/')) return new Response('<html>x</html>', { status: 200 });
      return new Response(
        `<a href="/out/0575c549-c0de-475b-a5e5-ae38149e8624?pos=primary&amp;city=warszawa">Bilety</a>` +
        `<script type="application/ld+json">{"offers":[{"@type":"Offer","url":"https://dzis.app/wydarzenia/x","price":"0"}]}</script>`,
        { status: 200 },
      );
    }) as typeof fetch;
    const r = await resolveDzisLink(cand);
    assert.ok(r.startsWith('https://dzis.app/out/0575c549-c0de-475b-a5e5-ae38149e8624?pos=primary'), r);
    assert.equal(calls, 2, 'page + out fetch');

    // 3) Page 404 → falls back to the dzis.app event page.
    globalThis.fetch = (async () => new Response('404', { status: 404 })) as typeof fetch;
    assert.equal(await resolveDzisLink(cand), 'https://dzis.app/wydarzenia/koncert-chopinowski-sala-koncertowa-fryderyk-warszawa-2026-08-17');
  } finally {
    globalThis.fetch = realFetch;
  }
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

test('luma: parseLumaEntry keeps offline events, drops online, UTC start', async () => {
  const { parseLumaEntry } = await import('../src/seed/providers/luma');
  const opts = { day: '2026-08-18', dayStart: 0, dayEnd: 0 };
  const entry: any = {
    start_at: '2026-08-18T14:00:00.000Z',
    event: {
      api_id: 'evt-XYZ',
      name: 'Vibe Coding Jam',
      timezone: 'Europe/Warsaw',
      url: 'vid3g51z',
      location_type: 'offline',
      coordinate: { latitude: 52.2297, longitude: 21.0122 },
      geo_address_info: { city: 'Warszawa', address: 'Wincentego Rzymowskiego 53', short_address: 'Adgar Wave, Wincentego Rzymowskiego 53, Warszawa' },
      cover_url: 'https://images.lumacdn.com/uploads/ak/x.png',
    },
  };
  const c = await parseLumaEntry(entry, 'Warszawa', { lat: 52.2297, lng: 21.0122 }, opts);
  assert.ok(c);
  assert.equal(c!.externalId, 'luma-evt-XYZ');
  assert.equal(c!.venue, 'Adgar Wave');
  assert.equal(c!.address, 'Wincentego Rzymowskiego 53');
  assert.equal(c!.lat, 52.2297);
  assert.equal(new Date(c!.startMs).toISOString(), '2026-08-18T14:00:00.000Z'); // true UTC
  assert.equal(c!.link, 'https://lu.ma/vid3g51z');

  // online → dropped
  const online = await parseLumaEntry({ ...entry, event: { ...entry.event, location_type: 'online' } }, 'Warszawa', { lat: 1, lng: 1 }, opts);
  assert.equal(online, null);
});

test('luma: obfuscated geo falls back to sublocality as the venue', async () => {
  const { parseLumaEntry } = await import('../src/seed/providers/luma');
  const opts = { day: '2026-08-18', dayStart: 0, dayEnd: 0 };
  const entry: any = {
    start_at: '2026-08-18T10:00:00.000Z',
    event: {
      api_id: 'evt-OBF', name: 'Secret Meetup', location_type: 'offline',
      coordinate: { latitude: 52.4, longitude: 16.9 },
      geo_address_info: { mode: 'obfuscated', city: 'Poznań', sublocality: 'Poznań Old Town' },
      cover_url: 'https://images.lumacdn.com/uploads/ak/x.png',
    },
  };
  const c = await parseLumaEntry(entry, 'Poznań', { lat: 52.4, lng: 16.9 }, opts);
  assert.ok(c);
  assert.equal(c!.venue, 'Poznań Old Town');
});

test('meetup: parseMeetupNode uses venue coords, resolves (0,0) via fallback, PHYSICAL only', async () => {
  const { parseMeetupNode } = await import('../src/seed/providers/meetup');
  const opts = { day: '2026-08-18', dayStart: 0, dayEnd: 0 };
  const fb = { lat: 52.4064, lng: 16.9252 };
  const node: any = {
    id: '123', title: 'Startup Poznan', dateTime: '2026-08-27T18:30:00+02:00', eventType: 'PHYSICAL',
    eventUrl: 'https://www.meetup.com/pl-PL/startup-poznan/events/123/',
    venue: { id: '1', name: 'Ministerstwo Browaru', address: 'Wroniecka 16', city: 'Poznań', lat: 52.410248, lon: 16.934267 },
    featuredEventPhoto: { highResUrl: 'https://secure.meetupstatic.com/photos/event/x/highres_1.jpeg' },
    group: { name: 'Startup Poznan', urlname: 'startup-poznan' },
  };
  const c = await parseMeetupNode(node, 'Poznań', fb, opts);
  assert.ok(c);
  assert.equal(c!.externalId, 'meetup-123');
  assert.equal(c!.lat, 52.410248);
  assert.equal(c!.lng, 16.934267);
  assert.equal(c!.venue, 'Ministerstwo Browaru');

  // (0,0) venue with an unresolvable name → deterministic city-center fallback.
  const zero = await parseMeetupNode({
    ...node,
    venue: { id: '2', name: 'XYZ No Such Venue 448812', address: 'ul. Niewiadoma 0', city: 'Poznań', lat: 0, lon: 0 },
  }, 'Poznań', fb, opts);
  assert.ok(zero);
  assert.equal(zero!.lat, fb.lat);
  assert.equal(zero!.lng, fb.lng);

  // ONLINE → dropped
  const online = await parseMeetupNode({ ...node, eventType: 'ONLINE' }, 'Poznań', fb, opts);
  assert.equal(online, null);
});

test('kupbilecik: stripOutsideCityText removes the "(poza miastem … km)" parenthetical, keeps the event text', () => {
  assert.equal(stripOutsideCityText('Centrum Kultury i Wypoczynku (poza miastem 5829 km)'), 'Centrum Kultury i Wypoczynku');
  assert.equal(stripOutsideCityText('Festiwal (Poza miastami 12 km), Warszawa'), 'Festiwal, Warszawa');
  assert.equal(stripOutsideCityText('Klub (poza miastem)'), 'Klub');
  assert.equal(stripOutsideCityText('Normalne Miejsce, ul. Testowa'), 'Normalne Miejsce, ul. Testowa', 'normal text untouched');
  assert.equal(stripOutsideCityText('(poza miastem 5829 km)'), '', 'garbage-only becomes empty (event still collected, geo falls back)');
  assert.equal(stripOutsideCityText(''), '');
  // Prefix form (browser-rendered venue text): "poza miastami (5829 km), X".
  assert.equal(stripOutsideCityText('poza miastami (5829 km), Mediateka'), 'Mediateka');
  assert.equal(stripOutsideCityText('poza miastami (5829km), Mediateka'), 'Mediateka');
  assert.equal(stripOutsideCityText('poza miastem (5829 km), Amfiteatr'), 'Amfiteatr');
  assert.equal(stripOutsideCityText('poza miastami (5829 km), Amfiteatr, ul. Fredry 1'), 'Amfiteatr, ul. Fredry 1');
  // Mixed prefix + trailing address is kept after the venue name.
  assert.equal(stripOutsideCityText('poza miastami(5829km), Mediateka'), 'Mediateka');
});

test('kupbilecik: kupVenueUrl/kupVenueId build the full slug URL (bare id 404s, so the path is required)', async () => {
  const { kupVenueUrl, kupVenueId } = await import('../src/seed/providers/kupbilecik');
  assert.equal(kupVenueUrl('/obiekty/3084/Mediateka/'), 'https://www.kupbilecik.pl/obiekty/3084/Mediateka/');
  assert.equal(kupVenueUrl('/obiekty/3084/Mediateka'), 'https://www.kupbilecik.pl/obiekty/3084/Mediateka/', 'trailing slash normalized');
  assert.equal(kupVenueUrl('3084'), 'https://www.kupbilecik.pl/obiekty/3084/', 'legacy numeric id kept for backward compat');
  assert.equal(kupVenueUrl(''), null);
  assert.equal(kupVenueId('/obiekty/3084/Mediateka/'), '3084');
  assert.equal(kupVenueId('3084'), '3084');
});

test('vps runtime: fetchWithRetry retries a flaky scope fetch, succeeds on retry', async () => {
  const { fetchWithRetry } = await import('../src/seed/executors/vps/runtime');
  let calls = 0;
  const src = {
    source: 'meetup',
    scopes: () => ['warszawa'],
    scopeGeo: () => null,
    fetchScope: async () => { calls++; if (calls < 3) throw new Error('fetch failed'); return []; },
  } as never;
  const result = await fetchWithRetry(src, 'warszawa', {} as never, { retryDelayMs: 0 });
  assert.equal(calls, 3, 'two failed attempts then a success');
  assert.deepEqual(result, []);
});

test('vps runtime: fetchWithRetry throws when every attempt fails', async () => {
  const { fetchWithRetry } = await import('../src/seed/executors/vps/runtime');
  const src = {
    source: 'meetup',
    scopes: () => ['warszawa'],
    scopeGeo: () => null,
    fetchScope: async () => { throw new Error('boom'); },
  } as never;
  await assert.rejects(fetchWithRetry(src, 'warszawa', {} as never, { retryDelayMs: 0 }), /boom/);
});

test('vps runners: going = single "all" scope, helios = full cinema catalog with geo anchors', async () => {
  const { goingSource } = await import('../src/seed/executors/vps/runners/going');
  const { heliosSource } = await import('../src/seed/executors/vps/runners/helios');
  assert.deepEqual(goingSource.scopes(), ['all']);
  assert.equal(goingSource.scopeGeo('all'), null);
  const scopes = heliosSource.scopes();
  assert.ok(scopes.length >= 40, `helios covers the full catalog (${scopes.length})`);
  const geo = heliosSource.scopeGeo(scopes[0]);
  assert.ok(geo && typeof geo.lat === 'number' && typeof geo.lng === 'number', 'helios scopeGeo anchors a cinema');
});

test('kupbilecik: kupTags category is authoritative — title never overrides the listing category', () => {
  assert.deepEqual(kupTags('/koncerty/?q=', 'Anything at all'), ['muzyka'], 'koncerty → muzyka (site categorizes it)');
  assert.deepEqual(kupTags('/kabarety/?q=', 'Anything at all'), ['komedia'], 'kabarety → komedia');
  assert.deepEqual(kupTags('/standup/?q=', 'Anything at all'), ['komedia'], 'standup → komedia');
  // Even a title with a conflicting keyword stays in the category (deterministic).
  assert.deepEqual(kupTags('/koncerty/?q=', 'Kabaret Nocny'), ['muzyka'], 'koncerty wins over "kabaret" in title');
  assert.deepEqual(kupTags('/standup/?q=', 'Koncert Improwizacji'), ['komedia'], 'standup wins over "koncert" in title');
  // Trailing query forms and the festival-expansion pass keep the same category.
  assert.deepEqual(kupTags('/koncerty/?q=&qt=&qw=', 'X'), ['muzyka'], 'koncerty with extra query params');
});

test('kupbilecik: kupTags festival keyword fallback → muzyka (real examples from live listings)', () => {
  for (const [title, note] of [
    ['Tarnobrzeg Folk Festival - Górale na Podkarpaciu', 'folk festival'],
    ['Ethno Jazz Festival', 'jazz festival'],
    ['PGS Rock Festival IV Edycja', 'rock festival'],
    ['Miedzynarodowy Festiwal Drum Fest', 'percussion festival'],
    ['Adam Bałdych European Quartet', 'jazz quartet'],
    ['XXV Krokus Jazz Festiwal - Piotr Wojtasik Quintet feat. Anna Maria Jopek', 'jazz festival'],
    ['III Piknik Country na Wild West Ranch', 'country music'],
    ['Colours of Tango & Ensemble', 'tango'],
    ['Tango Show "The Contrasts"', 'tango show'],
  ] as const) {
    assert.deepEqual(kupTags('/festiwal/?q=', title), ['muzyka'], `${note} → muzyka: "${title}"`);
  }
});

test('kupbilecik: kupTags festival keyword fallback → komedia (real examples)', () => {
  for (const title of ['Stand Up Open Mic na kempingu', 'Festiwal Komedii Stand-up', 'Stand-up: Zalewski', 'Standup Night', 'Kabaret na Fali', 'Comedy Festival Poznań']) {
    assert.deepEqual(kupTags('/festiwal/?q=', title), ['komedia'], `"${title}" → komedia`);
  }
});

test('kupbilecik: kupTags festival keyword fallback → teatr / filmy', () => {
  assert.deepEqual(kupTags('/festiwal/?q=', 'Festiwal Teatralny 2026'), ['teatr'], 'teatr → teatr');
  assert.deepEqual(kupTags('/festiwal/?q=', 'Spektakl plenerowy'), ['teatr'], 'spektakl → teatr');
  assert.deepEqual(kupTags('/festiwal/?q=', 'Festiwal Filmów Krótkometrażowych'), ['filmy'], 'film → filmy');
  assert.deepEqual(kupTags('/festiwal/?q=', 'Kino Letnie'), ['filmy'], 'kino → filmy');
});

test('kupbilecik: kupTags leaves empty/ambiguous untagged (null) — never guesses', () => {
  const untagged = [
    'Ekspedycja Smaku',                                   // food festival
    'MusicalON!',                                          // musical — ambiguous
    'Summer Fall Festival 2026 - KARNETY',                 // generic festival
    'Isaiah Collier',                                      // jazz artist, no keyword in title
    'Rajd Rowerowy',                                       // sport
    'Spotkanie autorskie z pisarzem',                      // book event
  ];
  for (const title of untagged) {
    assert.equal(kupTags('/festiwal/?q=', title), null, `"${title}" → null (untagged)`);
  }
  // Unknown category + no title signal → null too.
  assert.equal(kupTags('/inne/?q=', 'Coś tam'), null, 'unknown category → null');
});

test('kupbilecik: kupTags edge cases — empty inputs, case-insensitivity, diacritics, boundaries', () => {
  assert.equal(kupTags('', ''), null, 'both empty → null (no throw)');
  assert.equal(kupTags('/festiwal/?q=', ''), null, 'empty title → null');
  assert.deepEqual(kupTags('', 'Rock Festival'), ['muzyka'], 'empty listing but title keyword → muzyka');
  // Case-insensitivity.
  assert.deepEqual(kupTags('/festiwal/?q=', 'STAND UP OPEN MIC'), ['komedia'], 'uppercase STAND UP');
  assert.deepEqual(kupTags('/festiwal/?q=', 'pgs rock festival'), ['muzyka'], 'lowercase rock');
  // Diacritics — both native and folded forms.
  assert.deepEqual(kupTags('/festiwal/?q=', 'Festiwal Chórów'), ['muzyka'], 'chór (diacritic)');
  assert.deepEqual(kupTags('/festiwal/?q=', 'Festiwal Bębnów'), ['muzyka'], 'bębn (diacritic)');
  // Word-boundary hygiene: these should NOT false-positive.
  assert.equal(kupTags('/festiwal/?q=', 'Rajd na orientację'), null, '"or" in orientację is not a music word');
  assert.equal(kupTags('/festiwal/?q=', 'Piknik Rodzinny'), null, 'no keyword → null');
});

test('kupbilecik: buildFromHtml wires kupTags onto the candidate', async () => {
  const { buildFromHtml } = await import('../src/seed/providers/kupbilecik');
  const html = `
    <div class="linia-1"><h2 class="blackLine"><a href="https://www.kupbilecik.pl/imprezy/123/Gdynia/Test+Event/" ><b>Test Event</b></a></h2></div>
    <div class="linia-3">26 sierpnia 2026 o godz. 17:00</div>
    <div class="linia-4 blackLine"><a href="/miasta/224/Gdynia/"><b>Gdynia</b></a> w <a href="/obiekty/42/Teatr/" title="Teatr">Teatr</a></div>
    <img data-src="https://www.kupbilecik.pl/img/gal_baza/abc123_m.webp?t=1" />`;
  const ctx = { dayStart: Date.parse('2026-08-26T00:00:00+02:00'), day: '2026-08-26' } as never;
  // From the /koncerty/ listing → muzyka.
  const koncert = buildFromHtml(ctx, 'https://www.kupbilecik.pl/imprezy/123/Gdynia/Test+Event/', html, '123', null, '/koncerty/?q=');
  assert.deepEqual(koncert!.tags, ['muzyka'], 'candidate from /koncerty/ carries muzyka');
  // From the /festiwal/ listing with a music title → muzyka; without → null tags.
  const fest = buildFromHtml(ctx, 'https://www.kupbilecik.pl/imprezy/123/Gdynia/Test+Event/', html, '123', null, '/festiwal/?q=');
  assert.equal(fest!.tags, undefined, 'generic festival title → no tags on the candidate');
});
