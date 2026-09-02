import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEbiletProduct, splitSegment, parseEbiletLocation, ebiletPrice, ebiletPageUrl,
  ebiletTags, firstEbiletCategory,
} from '../src/seed/providers/ebilet';

const DAY = '2026-09-08';
const DAY_MS = 1_725_753_600_000; // arbitrary anchor — assertions compare offsets

type Field = { name: string; value: string };
interface Offer { productUrl?: string; sourceProductId?: string; priceHistory?: Array<{ price?: { value?: string } }> }
interface Product { name?: string; fields?: Field[]; offers?: Offer[]; categories?: Array<{ tdCategoryName?: string; name?: string }>; productImage?: { url?: string } | null }

function seg(name: string, value: string): Field {
  return { name, value };
}

const CLICK = (sid: string) =>
  `https://pdt.tradedoubler.com/click?a(1)p(2)product(94944-${sid})ttid(19)url(https%3A%2F%2Fwww.ebilet.pl%2Fmuzyka%2Fkameralny%3Fpartner%3Dtradedoubler)`;

function product(over: Partial<Product>): Product {
  return {
    name: 'Koncert Kameralny',
    fields: [],
    offers: [{ productUrl: CLICK('111'), sourceProductId: '111', priceHistory: [{ price: { value: '120.9', currency: 'PLN' } }] }],
    productImage: { url: 'https://www.ebilet.pl/media/cms/media/x/art.webp' },
    ...over,
  };
}

test('parseEbiletProduct: earliest in-day slot, externalId, price, distinct dedupe link', () => {
  const p = product({
    fields: [
      seg('Availability|Location|Date|Segment1', 'In Stock|Teatr Studio, Warszawa|2026-09-08 19:00:00|Segment 1'),
      seg('Availability|Location|Date|Segment2', 'In Stock|Teatr Studio, Warszawa|2026-09-08 16:30:00|Segment 2'),
      seg('Availability|Location|Date|Segment3', 'In Stock|Teatr Studio, Warszawa|2026-09-20 19:00:00|Segment 1'),
    ],
  });
  const [c] = parseEbiletProduct(p, DAY, DAY_MS);
  assert.ok(c, 'one candidate for the target day');
  assert.equal(c.externalId, 'ebilet-111-20260908');
  assert.equal(c.startMs - DAY_MS, (16 * 60 + 30) * 60_000, 'earliest in-day slot wins');
  assert.equal(c.venue, 'Teatr Studio');
  assert.equal(c.city, 'Warszawa');
  assert.equal(c.price, 120.9);
  assert.equal(c.isSoldOut, false);
  assert.equal(c.link, 'https://www.ebilet.pl/muzyka/kameralny?partner=tradedoubler');
  assert.match(c.affiliateLink || '', /^https:\/\/pdt\.tradedoubler\.com\/click/);
  // Only the target day is returned.
  assert.deepEqual(parseEbiletProduct(p, '2026-09-07', DAY_MS), []);
});

test('parseEbiletProduct: externalId is stable across feed regenerations (no segment number)', () => {
  const a = product({ fields: [seg('Availability|Location|Date|Segment380', 'In Stock|Teatr Studio, Warszawa|2026-09-08 19:00:00|Segment 1')] });
  const b = product({ fields: [seg('Availability|Location|Date|Segment1', 'In Stock|Teatr Studio, Warszawa|2026-09-08 19:00:00|Segment 2')] });
  assert.equal(parseEbiletProduct(a, DAY, DAY_MS)[0].externalId, parseEbiletProduct(b, DAY, DAY_MS)[0].externalId);
});

test('parseEbiletProduct: sold-out mapping', () => {
  // All in-day segments sold out → is_sold_out, earliest time kept.
  const soldOut = product({
    fields: [
      seg('Availability|Location|Date|Segment1', 'Out of Stock|Teatr Studio, Warszawa|2026-09-08 19:00:00|Segment 1'),
      seg('Availability|Location|Date|Segment2', 'Out of Stock|Teatr Studio, Warszawa|2026-09-08 20:30:00|Segment 2'),
    ],
  });
  const [s] = parseEbiletProduct(soldOut, DAY, DAY_MS);
  assert.equal(s.isSoldOut, true);
  assert.equal(s.startMs - DAY_MS, 19 * 60 * 60_000);

  // One segment still on sale → NOT sold out; time = earliest AVAILABLE slot.
  const mixed = product({
    fields: [
      seg('Availability|Location|Date|Segment1', 'Out of Stock|Teatr Studio, Warszawa|2026-09-08 16:30:00|Segment 1'),
      seg('Availability|Location|Date|Segment2', 'In Stock|Teatr Studio, Warszawa|2026-09-08 19:00:00|Segment 2'),
    ],
  });
  const [m] = parseEbiletProduct(mixed, DAY, DAY_MS);
  assert.equal(m.isSoldOut, false);
  assert.equal(m.startMs - DAY_MS, 19 * 60 * 60_000, 'skips the sold-out early slot');
});

test('parseEbiletProduct: duplicated-city venue name is normalized', () => {
  const p = product({
    fields: [seg('Availability|Location|Date|Segment1', 'In Stock|Restauracja MAX, Katowice, Katowice|2026-09-08 20:00:00|Segment 1')],
  });
  const [c] = parseEbiletProduct(p, DAY, DAY_MS);
  assert.equal(c.venue, 'Restauracja MAX');
  assert.equal(c.city, 'Katowice');
});

test('parseEbiletProduct: empty/placeholder segments and blank media are handled', () => {
  const p = product({
    fields: [
      seg('Availability|Location|Date|Segment1', '|||'),
      seg('Availability|Location|Date|Segment2', 'In Stock|Teatr Studio, Warszawa||'),
      seg('Availability|Location|Date|Segment3', 'In Stock|Teatr Studio, Warszawa|2026-09-08 19:00:00|Segment 1'),
      seg('Availability|Location|Date|Segment4', 'In Stock|Teatr Studio, Warszawa|2026-09-08 20:00:00|Segment 2'),
    ],
    productImage: { url: 'https://www.ebilet.pl/blank.gif' },
  });
  const [c] = parseEbiletProduct(p, DAY, DAY_MS);
  assert.ok(c, 'real segment still yields a candidate');
  assert.equal(c.mediaUrl, '', 'blank placeholder image is dropped');
  assert.equal(c.startMs - DAY_MS, 19 * 60 * 60_000);
});

test('ebiletPageUrl / splitSegment / parseEbiletLocation / ebiletPrice edge cases', () => {
  // Decoded eBilet page is the dedupe link — never the shared click-tracker host.
  assert.equal(ebiletPageUrl(product({})), 'https://www.ebilet.pl/muzyka/kameralny?partner=tradedoubler');
  // Missing click URL → synthetic but UNIQUE fallback per product.
  const c = product({ offers: [{ productUrl: undefined, sourceProductId: '1' }] });
  const d = product({ offers: [{ productUrl: undefined, sourceProductId: '2' }] });
  assert.ok(ebiletPageUrl(c) !== ebiletPageUrl(d), 'fallback link stays unique per product');
  assert.ok(!ebiletPageUrl(c).includes('pdt.tradedoubler'));

  // splitSegment: placeholders / no date → null; missing time → 00:00:00.
  assert.equal(splitSegment(''), null);
  assert.equal(splitSegment('|||'), null);
  assert.equal(splitSegment('In Stock|X, Y|2100-01-01 10:00:00|Segment 1')?.date, '2100-01-01');
  assert.equal(splitSegment('In Stock|Teatr Studio, Warszawa|2026-09-08|Segment 1')?.time, '00:00:00');
  assert.equal(splitSegment('In Stock|Teatr Studio, Warszawa|2026-09-08 19:00:00|Segment 1')?.availability, 'in stock');

  // parseEbiletLocation
  assert.deepEqual(parseEbiletLocation('Krupówki 50, Zakopane'), { venue: 'Krupówki 50', city: 'Zakopane' });
  assert.deepEqual(parseEbiletLocation('Strefa 57'), { venue: 'Strefa 57', city: '' });
  assert.deepEqual(parseEbiletLocation(''), { venue: '', city: '' });

  // price
  assert.equal(ebiletPrice(product({})), 120.9);
  assert.equal(ebiletPrice(product({ offers: [{ priceHistory: [] }] })), null, 'no history → null');
  assert.equal(ebiletPrice(product({ offers: [{ priceHistory: [{ price: { value: '0.0', currency: 'PLN' } }] }] })), 0, '0.0 parses as 0 (free)');
  assert.equal(ebiletPrice(product({ offers: [{ priceHistory: [{ price: { value: 'not-a-number' } }] }] })), null);
});

test('ebiletTags: safe prefixes map to their obvious tag', () => {
  assert.equal(ebiletTags('Muzyka/Rock'), 'muzyka');
  assert.equal(ebiletTags('Muzyka/Disco Polo'), 'muzyka');
  assert.equal(ebiletTags('Teatr/Komedia'), 'teatr');
  assert.equal(ebiletTags('Teatr/Tragedia | Dramat'), 'teatr', 'pipe spacing normalized');
  assert.equal(ebiletTags('Rodzina/Teatr dla dzieci'), 'teatr');
  assert.equal(ebiletTags('Widowiska/Stand-up'), 'komedia');
  assert.equal(ebiletTags('Widowiska/Kabarety'), 'komedia');
  assert.equal(ebiletTags('Sport/Sporty walki'), 'sport');
  assert.equal(ebiletTags('Zwiedzanie/ZOO'), 'atrakcje');
  assert.equal(ebiletTags('Zwiedzanie/Wycieczki'), 'atrakcje');
  assert.equal(ebiletTags('Rodzina/Atrakcje dla rodziny'), 'atrakcje');
  assert.equal(ebiletTags('Rodzina/Rekreacja'), 'atrakcje');
});

test('ebiletTags: reviewed ambiguous taxonomy (classical → muzyka, business meetings → meetup, rest → inne)', () => {
  // Classical performances count as music.
  assert.equal(ebiletTags('Klasyka/Koncerty muzyki poważnej'), 'muzyka');
  assert.equal(ebiletTags('Klasyka/Muzyka filmowa'), 'muzyka');
  assert.equal(ebiletTags('Klasyka/Opera i Operetka'), 'muzyka');
  // Business conferences/trainings are community-meeting events.
  assert.equal(ebiletTags('Biznes/Konferencje'), 'meetup');
  assert.equal(ebiletTags('Biznes/Szkolenia'), 'meetup');
  assert.equal(ebiletTags('Biznes/Inne'), 'meetup');
  // Everything else the feed emits lands in the 'inne' bag.
  for (const c of ['Klasyka/Balet i taniec klasyczny', 'Biznes/Wystawy', 'Biznes/Targi', 'Rodzina/Widowiska dla dzieci', 'Rodzina/Warsztaty | Edukacja', 'Widowiska/Rewie | Show', 'Widowiska/Inne']) {
    assert.equal(ebiletTags(c), 'inne', c);
  }
});

test('ebiletTags / firstEbiletCategory: unknown or missing category → no tag', () => {
  assert.equal(ebiletTags(null), null);
  assert.equal(ebiletTags('Kategoria/Której/NieMa'), null, 'unknown path must not be guessed');
  assert.equal(firstEbiletCategory(product({ categories: [] })), null);
  // Paginated export uses key `name`, unlimited uses `tdCategoryName`.
  assert.equal(firstEbiletCategory(product({ categories: [{ name: 'Muzyka/Rock' }] })), 'Muzyka/Rock');
  assert.equal(firstEbiletCategory(product({ categories: [{ tdCategoryName: 'Teatr/Komedia' }] })), 'Teatr/Komedia');
  assert.equal(ebiletTags(firstEbiletCategory(product({ categories: [{ name: 'Widowiska/Stand-up' }] }))), 'komedia');
});

test('parseEbiletProduct: candidate carries the mapped canonical tag', () => {
  const p = product({
    fields: [seg('Availability|Location|Date|Segment1', 'In Stock|Teatr Studio, Warszawa|2026-09-08 19:00:00|Segment 1')],
    categories: [{ tdCategoryName: 'Biznes/Wystawy' }],
  });
  const [c] = parseEbiletProduct(p, DAY, DAY_MS);
  assert.deepEqual(c.tags, ['inne']);
  const rock = product({
    fields: [seg('Availability|Location|Date|Segment1', 'In Stock|Teatr Studio, Warszawa|2026-09-08 19:00:00|Segment 1')],
    categories: [{ name: 'Muzyka/Rock' }],
  });
  assert.deepEqual(parseEbiletProduct(rock, DAY, DAY_MS)[0].tags, ['muzyka']);
});
