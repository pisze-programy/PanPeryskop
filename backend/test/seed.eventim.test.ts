import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventimRow, eventimCity, eventimTags, eventimCategoryTag, eventimTitleTag, isEventimVoucher } from '../src/seed/providers/eventim';
import { aggregateDayCandidates } from '../src/seed/core/aggregate';

const DAY = '2026-09-18';
const DAY_MS = 1_700_000_000_000; // arbitrary anchor — assertions compare offsets

function row(over: Record<string, string> = {}): Record<string, string> {
  return {
    aw_product_id: '45341573090',
    aw_deep_link: 'https://www.awin1.com/pclick.php?p=45341573090&a=3071193&m=19044',
    aw_image_url: 'https://images2.productserve.com/img.jpg',
    merchant_deep_link: 'https://www.eventim.pl/tickets.html?affiliate=AWN&fun=evdetail&doc=evdetailb&key=3837836$21951447',
    'Tickets:event_name': 'K-POP PARTY: Mafia Edition',
    'Tickets:event_date': DAY,
    'Tickets:venue_name': 'HAH',
    'Tickets:venue_address': 'ul. Święty Marcin 2, 61-806 POZNAŃ, PL',
    'Tickets:latitude': '52.4075',
    'Tickets:longitude': '16.9272',
    'Tickets:genre': 'Koncert',
    'Tickets:min_price': '39.75',
    'Tickets:max_price': '49.0',
    custom_1: '22:00',
    ...over,
  };
}

test('parseEventimRow: full mapping (title, time, venue+address, geo, price, links)', () => {
  const [c] = parseEventimRow(row(), DAY, DAY_MS);
  assert.equal(c.source, 'eventim');
  assert.equal(c.externalId, 'eventim-45341573090');
  assert.equal(c.title, 'K-POP PARTY: Mafia Edition');
  assert.equal(c.startMs, DAY_MS + (22 * 60) * 60_000, 'startMs from custom_1 HH:MM');
  assert.equal(c.venue, 'HAH');
  assert.equal(c.address, 'ul. Święty Marcin 2, 61-806 POZNAŃ, PL');
  assert.equal(c.city, 'POZNAŃ');
  assert.equal(c.lat, 52.4075);
  assert.equal(c.lng, 16.9272);
  assert.equal(c.price, 39.75);
  assert.equal(c.mediaUrl, 'https://images2.productserve.com/img.jpg');
  assert.equal(c.link, row().merchant_deep_link);
  assert.equal(c.affiliateLink, row().aw_deep_link);
  assert.deepEqual(c.times, ['22:00']);
  assert.deepEqual(c.showtimeBooking, [{ time: '22:00', kind: 'link', params: { url: row().merchant_deep_link } }]);
});

test('parseEventimRow: skips non-target day, missing id, bad time', () => {
  assert.equal(parseEventimRow(row({ 'Tickets:event_date': '2026-09-19' }), DAY, DAY_MS).length, 0);
  assert.equal(parseEventimRow(row({ aw_product_id: '' }), DAY, DAY_MS).length, 0);
  assert.equal(parseEventimRow(row({ custom_1: '' }), DAY, DAY_MS).length, 0);
  assert.equal(parseEventimRow(row({ custom_1: '22:00:00' }), DAY, DAY_MS).length, 0);
});

test('parseEventimRow: 0.0 coordinates → null geo (deferred, resolved at ingest)', () => {
  const [c] = parseEventimRow(row({ 'Tickets:latitude': '0.0', 'Tickets:longitude': '0.0' }), DAY, DAY_MS);
  assert.equal(c.lat, null);
  assert.equal(c.lng, null);
});

test('eventimCity: strips postal code + PL suffix', () => {
  assert.equal(eventimCity('ul. Działowa 25, 61-747 POZNAŃ, PL'), 'POZNAŃ');
  assert.equal(eventimCity('al. Jerozolimskie 25, 00-508 Warszawa, Polska'), 'Warszawa');
  assert.equal(eventimCity('ul. X, Kraków'), 'Kraków');
  assert.equal(eventimCity(''), '');
});

test('eventimTags: genre mapping, unknown → null', () => {
  assert.equal(eventimTags('Koncert'), 'muzyka');
  assert.equal(eventimTags('Kabaret'), 'komedia');
  assert.equal(eventimTags('Sport'), 'sport');
  assert.equal(eventimTags('Teatr'), 'teatr');
  assert.equal(eventimTags('Wydarzenie rodzinne'), 'inne');
  assert.equal(eventimTags(''), null);
  assert.equal(eventimTags('Inna'), null);
});

test('eventimCategoryTag: merchant_category code → canonical tag, unknown → null', () => {
  assert.equal(eventimCategoryTag('1B'), 'muzyka');
  assert.equal(eventimCategoryTag('1G'), 'muzyka');
  assert.equal(eventimCategoryTag('2B'), 'teatr');
  assert.equal(eventimCategoryTag('3G'), 'sport');
  assert.equal(eventimCategoryTag('3I'), 'sport');
  assert.equal(eventimCategoryTag('4B'), 'komedia');
  assert.equal(eventimCategoryTag('2E'), 'inne');
  assert.equal(eventimCategoryTag('2H'), 'inne');
  assert.equal(eventimCategoryTag('4A'), 'inne');
  assert.equal(eventimCategoryTag('4F'), 'inne');
  assert.equal(eventimCategoryTag('4d'), 'inne', 'code normalized case-insensitively');
  assert.equal(eventimCategoryTag('9Z'), null);
  assert.equal(eventimCategoryTag(''), null);
  assert.equal(eventimCategoryTag(null), null);
});

test('isEventimVoucher: 5* codes are vouchers/merch, not events', () => {
  assert.ok(isEventimVoucher('5D'));
  assert.ok(isEventimVoucher('5A'));
  assert.ok(!isEventimVoucher('4B'));
  assert.ok(!isEventimVoucher('1B'));
  assert.ok(!isEventimVoucher(''));
  assert.ok(!isEventimVoucher(null));
});

test('eventimTitleTag: title fallback, unknown → null', () => {
  assert.equal(eventimTitleTag('Koncert Chopinowski'), 'muzyka');
  assert.equal(eventimTitleTag('Kabaret Hrabi'), 'komedia');
  assert.equal(eventimTitleTag('Spektakl: Genialny pomysł'), 'teatr');
  assert.equal(eventimTitleTag('Mecz piłki ręcznej'), 'sport');
  assert.equal(eventimTitleTag('Teatr dla dzieci'), 'inne');
  assert.equal(eventimTitleTag('MUZEUM BANKSY'), null);
  assert.equal(eventimTitleTag(''), null);
});

test('parseEventimRow: tag priority merchant_category → genre → title', () => {
  // code wins over genre
  const [c] = parseEventimRow(row({ merchant_category: '4B', 'Tickets:genre': 'Koncert' }), DAY, DAY_MS);
  assert.deepEqual(c.tags, ['komedia']);
  // no code → genre fallback
  const [g] = parseEventimRow(row({ 'Tickets:genre': 'Teatr' }), DAY, DAY_MS);
  assert.deepEqual(g.tags, ['teatr']);
  // no code, empty genre → title fallback
  const [t] = parseEventimRow(row({ 'Tickets:genre': '', 'Tickets:event_name': 'Koncert przy świecach' }), DAY, DAY_MS);
  assert.deepEqual(t.tags, ['muzyka']);
  // nothing usable → untagged
  const [u] = parseEventimRow(row({ merchant_category: '9Z', 'Tickets:genre': '', 'Tickets:event_name': 'MUZEUM BANKSY KRAKÓW' }), DAY, DAY_MS);
  assert.equal(u.tags, undefined);
});

test('parseEventimRow: voucher codes are skipped (not events)', () => {
  assert.equal(parseEventimRow(row({ merchant_category: '5D', 'Tickets:event_name': 'Voucher do Multikina' }), DAY, DAY_MS).length, 0);
  assert.equal(parseEventimRow(row({ merchant_category: '5A' }), DAY, DAY_MS).length, 0);
});

test('aggregate: same event-day-venue at different times → one post with showtimes[]', () => {
  const a = parseEventimRow(row({ aw_product_id: '1', custom_1: '16:00' }), DAY, DAY_MS);
  const b = parseEventimRow(row({ aw_product_id: '2', custom_1: '19:00' }), DAY, DAY_MS);
  const [post] = aggregateDayCandidates([...a, ...b]);
  assert.deepEqual(post.times, ['16:00', '19:00']);
  assert.equal(post.externalId, 'eventim-1', 'earliest-start member stays canonical');
  assert.equal(post.price, 39.75, 'cheapest known price');
  assert.equal(post.showtimeBooking?.length, 2);
});