import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWizzairWindow, mergeWizzairMonths, monthsInWindow, parseWizzairVersion } from '../src/travel/flightsApi';

test('parseWizzairVersion: reads the versioned API path out of the site HTML', () => {
  const html = '<script>window.__CONFIG={"apiUrl":"https://be.wizzair.com/29.16.1/Api","x":1}</script>';
  assert.equal(parseWizzairVersion(html), '29.16.1');
});

test('parseWizzairVersion: no match stays null', () => {
  assert.equal(parseWizzairVersion('<html></html>'), null);
});

test('buildWizzairWindow: prices come only from `price` days, hours from the first departure', () => {
  const window = buildWizzairWindow(
    {
      outboundFlights: [
        { departureDate: '2026-10-11T00:00:00', priceType: 'price', price: { amount: 139 }, departureDates: ['2026-10-11T06:15:00', '2026-10-11T18:40:00'] },
        { departureDate: '2026-10-12T00:00:00', priceType: 'checkPrice', price: { amount: 0 } },
      ],
      returnFlights: [
        { departureDate: '2026-10-19T00:00:00', priceType: 'price', price: { amount: 179 }, departureDates: ['2026-10-19T20:05:00'] },
      ],
    },
    '2026-10-18',
  );

  assert.deepEqual(window.outbound.map((c) => c.date), [
    '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17',
  ]);
  assert.deepEqual(window.returning.map((c) => c.date), [
    '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
  ]);

  const day11 = window.outbound[0];
  assert.equal(day11.price, 139);
  assert.equal(day11.hour, '06:15');

  const day12 = window.outbound[1];
  assert.equal(day12.price, null);
  assert.equal(day12.hour, null);

  const day13 = window.outbound[2];
  assert.equal(day13.price, null);
  assert.equal(day13.hour, null);

  assert.equal(window.returning[0].price, 179);
  assert.equal(window.returning[0].hour, '20:05');
});

test('buildWizzairWindow: an empty response keeps every day priceless', () => {
  const window = buildWizzairWindow({}, '2026-10-18');
  assert.equal(window.outbound.length, 7);
  assert.equal(window.returning.length, 7);
  assert.ok([...window.outbound, ...window.returning].every((c) => c.price === null));
});

test('buildWizzairWindow: a route the carrier does not sell has no days at all', () => {
  const window = buildWizzairWindow({ noMarket: true }, '2026-10-18');
  assert.deepEqual(window.outbound, []);
  assert.deepEqual(window.returning, []);
});

test('monthsInWindow: one month when the window fits, two when it crosses', () => {
  assert.deepEqual(monthsInWindow('2026-10-18'), ['2026-10-01']);
  assert.deepEqual(monthsInWindow('2026-10-03'), ['2026-09-01', '2026-10-01']);
});

test('mergeWizzairMonths: days from both months and the noMarket flag', () => {
  const merged = mergeWizzairMonths([
    { outboundFlights: [{ departureDate: '2026-10-01T00:00:00' }] },
    { outboundFlights: [{ departureDate: '2026-11-01T00:00:00' }], returnFlights: [{ departureDate: '2026-11-05T00:00:00' }] },
  ]);
  assert.deepEqual(merged.outboundFlights?.map((f) => f.departureDate), ['2026-10-01T00:00:00', '2026-11-01T00:00:00']);
  assert.deepEqual(merged.returnFlights?.map((f) => f.departureDate), ['2026-11-05T00:00:00']);
  assert.equal(merged.noMarket, false);

  assert.equal(mergeWizzairMonths([{ noMarket: true }, { noMarket: true }]).noMarket, true);
  assert.equal(mergeWizzairMonths([{ noMarket: true }, {}]).noMarket, false);
});
