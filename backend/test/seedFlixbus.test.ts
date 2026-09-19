import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBusOffers, busBookingUrl } from '../src/travel/flixbus';

test('parseBusOffers: keeps only available priced offers, sorted cheapest first', () => {
  const offers = parseBusOffers({
    'direct:a': {
      status: 'available',
      transfer_type_key: 'direct',
      departure: { date: '2026-10-15T04:15:00+02:00' },
      duration: { hours: 9, minutes: 10 },
      price: { total: 92.99 },
    },
    'direct:b': {
      status: 'available',
      transfer_type_key: 'transfer',
      departure: { date: '2026-10-15T06:00:00+02:00' },
      duration: { hours: 11, minutes: 30 },
      price: { total: 60.5 },
    },
    'sold:out': {
      status: 'sold_out',
      departure: { date: '2026-10-15T08:00:00+02:00' },
      price: { total: 10 },
    },
    'no:price': {
      status: 'available',
      departure: { date: '2026-10-15T09:00:00+02:00' },
    },
  });
  assert.equal(offers.length, 2);
  assert.equal(offers[0].price, 61);
  assert.equal(offers[0].hour, '06:00');
  assert.equal(offers[0].durationMinutes, 11 * 60 + 30);
  assert.equal(offers[0].transfers, 1);
  assert.equal(offers[1].price, 93);
  assert.equal(offers[1].hour, '04:15');
  assert.equal(offers[1].transfers, 0);
});

test('parseBusOffers: an empty results object (no route) gives no offers', () => {
  assert.deepEqual(parseBusOffers({}), []);
  assert.deepEqual(parseBusOffers(null), []);
  assert.deepEqual(parseBusOffers(undefined), []);
});

test('busBookingUrl: shop link carries the cities and a DD.MM.YYYY date', () => {
  const url = busBookingUrl('from-uuid', 'to-uuid', '2026-10-15');
  assert.match(url, /^https:\/\/shop\.flixbus\.pl\/search\?/);
  assert.match(url, /departureCity=from-uuid/);
  assert.match(url, /arrivalCity=to-uuid/);
  assert.match(url, /rideDate=15\.10\.2026/);
  assert.match(url, /adult=1/);
  assert.match(url, /currency=PLN/);
});
