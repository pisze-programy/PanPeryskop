import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carRentalUrl } from '../src/travel/qeeq';

test('carRentalUrl: dates open the QEEQ search for the airport', () => {
  const url = new URL(carRentalUrl('BCN', '2026-10-25', '2026-10-26'));
  assert.equal(url.origin, 'https://www.qeeq.pl');
  assert.equal(url.pathname, '/car/search');
  assert.equal(url.searchParams.get('pickup_landmark'), '99191');
  assert.equal(url.searchParams.get('dropoff_landmark'), '99191');
  assert.equal(url.searchParams.get('pickup_city'), '2765');
  assert.equal(url.searchParams.get('from_date_0'), '2026-10-25');
  assert.equal(url.searchParams.get('to_date_0'), '2026-10-26');
  assert.equal(url.searchParams.get('currency'), 'PLN');
});

test('carRentalUrl: no dates keep the airport, QEEQ picks the dates', () => {
  const url = new URL(carRentalUrl('BCN'));
  assert.equal(url.pathname, '/car/search');
  assert.equal(url.searchParams.get('pickup_landmark'), '99191');
  assert.equal(url.searchParams.get('pickup_city'), '2765');
  assert.equal(url.searchParams.get('from_date_0'), null);
  assert.equal(url.searchParams.get('currency'), 'PLN');
});

test('carRentalUrl: an airport QEEQ does not list still opens the search page', () => {
  const url = new URL(carRentalUrl('ZZZ'));
  assert.equal(url.origin, 'https://www.qeeq.pl');
  assert.equal(url.pathname, '/car/search');
  assert.equal(url.searchParams.get('pickup_landmark'), null);
});

test('carRentalUrl: a bad date keeps the airport without dates', () => {
  const url = new URL(carRentalUrl('BCN', 'not-a-date', '2026-10-26'));
  assert.equal(url.pathname, '/car/search');
  assert.equal(url.searchParams.get('pickup_landmark'), '99191');
  assert.equal(url.searchParams.get('from_date_0'), null);
});
