import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKupEvent, kupTagsFor, decodeHtmlEntities } from '../src/seed/providers/kupbilecik';
import { aggregateDayCandidates } from '../src/seed/core/aggregate';

const DAY = '2026-09-08';
// Warsaw midnight for 2026-09-08 (UTC+2): 2026-09-07 22:00 UTC.
const DAY_MS = Date.UTC(2026, 8, 7, 22, 0, 0);

function ev(over: Record<string, unknown>): Record<string, unknown> {
  return {
    Id: 185922,
    Name: 'Spektakl komediowy "Miłość i polityka"',
    Date: '2026-09-08 16:00:00',
    City: 'Koszalin',
    Category: { Type: 'teatr', SubCategory: { Type: 'teatr_komedia' } },
    Images: { Image: 'https://www.kupbilecik.pl/img/gal_baza/x.webp?t=1', Mini: 'https://www.kupbilecik.pl/img/gal_baza/x_m.webp?t=1' },
    TicketsInfo: { Price: 140 },
    Object: { Name: 'Bałtycki Teatr Dramatyczny', Address: 'Plac Teatralny 1', Code: '75-729', Location: { Lat: '54.186285', Long: '16.184757' } },
    Link: 'https://www.kupbilecik.pl/imprezy/185922/Koszalin/x/?utm_source=pp&utm_medium=631',
    ...over,
  };
}

test('parseKupEvent: maps the direct-API row onto a candidate (price, coords, affiliate link)', () => {
  const [c] = parseKupEvent(ev({}), DAY, DAY_MS);
  assert.ok(c);
  assert.equal(c.externalId, 'kupbilecik-185922-20260908');
  assert.equal(c.startMs - DAY_MS, 16 * 60 * 60_000);
  assert.equal(c.title, 'Spektakl komediowy "Miłość i polityka"');
  assert.equal(c.lat, 54.186285);
  assert.equal(c.lng, 16.184757);
  assert.equal(c.price, 140);
  assert.equal(c.venue, 'Bałtycki Teatr Dramatyczny');
  assert.equal(c.city, 'Koszalin');
  assert.equal(c.mediaUrl, 'https://www.kupbilecik.pl/img/gal_baza/x.webp?t=1');
  assert.equal(c.thumbUrl, 'https://www.kupbilecik.pl/img/gal_baza/x_m.webp?t=1');
  assert.match(c.link, /^https:\/\/www\.kupbilecik\.pl\/imprezy\/185922\//);
  assert.match(c.link, /utm_source=pp&utm_medium=631/, 'affiliate params stamped into the link');
  assert.deepEqual(c.tags, ['teatr']);
  assert.equal(c.isSoldOut, false, 'API exposes no availability');
  assert.deepEqual(parseKupEvent(ev({ Date: '2026-09-20 19:00:00' }), DAY, DAY_MS), [], 'other-day rows are dropped');
});

test('parseKupEvent: null price and missing image handled', () => {
  const [c] = parseKupEvent(ev({ TicketsInfo: { Price: null }, Images: { Image: undefined, Mini: undefined } }), DAY, DAY_MS);
  assert.ok(c);
  assert.equal(c.price, null);
  assert.equal(c.mediaUrl, '');
  assert.equal(c.thumbUrl, null);
});

test('kupTagsFor: safe types + reviewed ambiguous map', () => {
  const tag = (t: string, s?: string) => kupTagsFor({ Type: t, SubCategory: { Type: s } });
  assert.deepEqual(tag('muzyka'), ['muzyka']);
  assert.deepEqual(tag('teatr', 'teatr_komedia'), ['teatr']);
  assert.deepEqual(tag('standup'), ['komedia']);
  assert.deepEqual(tag('kabaret'), ['komedia']);
  assert.deepEqual(tag('impro'), ['komedia'], 'impro → komedia (comedy improv shows)');
  assert.deepEqual(tag('film'), ['filmy']);
  assert.deepEqual(tag('sport'), ['sport']);
  assert.deepEqual(tag('inne'), ['inne'], 'catch-all bag');
  // Reviewed ambiguous:
  assert.deepEqual(tag('teatr', 'teatr_widowisko'), ['inne'], 'rewia/widowisko → inne');
  assert.deepEqual(tag('dzieci'), ['inne']);
  assert.deepEqual(tag('festiwal'), ['inne']);
  assert.equal(kupTagsFor(null), null);
  assert.equal(kupTagsFor({ Type: 'coś_nowego' }), null, 'unknown type stays untagged');
});

test('aggregateDayCandidates: two performances of the same event-day-venue → one post with showtimes[]', () => {
  const a = parseKupEvent(ev({ Id: 185922, Date: '2026-09-08 16:00:00' }), DAY, DAY_MS);
  const b = parseKupEvent(ev({ Id: 185927, Date: '2026-09-08 19:00:00', TicketsInfo: { Price: 120 } }), DAY, DAY_MS);
  const merged = aggregateDayCandidates([...a, ...b]);
  assert.equal(merged.length, 1, 'no duplicate posts for one event-day-venue');
  assert.equal(merged[0].externalId, 'kupbilecik-185922-20260908', 'earliest performance stays canonical');
  assert.deepEqual(merged[0].times, ['16:00', '19:00'], 'showtimes are the union');
  assert.equal(merged[0].price, 120, 'cheapest known price survives');
});

test('decodeHtmlEntities: API leaves &quot; in some names', () => {
  assert.equal(decodeHtmlEntities('Kabaret Ani Mru-Mru &quot;Mniej&quot;'), 'Kabaret Ani Mru-Mru "Mniej"');
  assert.equal(decodeHtmlEntities('normal &amp; ok &#039;x&#039; &lt;y&gt;'), "normal & ok 'x' <y>");
});
