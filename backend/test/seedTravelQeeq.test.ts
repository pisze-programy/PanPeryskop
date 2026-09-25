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
  assert.equal(url.searchParams.get('lang'), 'pl');
  assert.equal(url.searchParams.get('currency'), 'PLN');
});

test('carRentalUrl: no dates keep the Polish airport landing', () => {
  const url = new URL(carRentalUrl('BCN'));
  assert.equal(url.pathname, '/car/rental');
  assert.equal(url.searchParams.get('airport'), '99191');
  assert.equal(url.searchParams.get('currency'), 'PLN');
});

test('carRentalUrl: an airport QEEQ does not list falls back to the homepage', () => {
  assert.equal(carRentalUrl('ZZZ'), 'https://www.qeeq.pl');
});

test('carRentalUrl: a bad date is not used as a search date', () => {
  const url = new URL(carRentalUrl('BCN', 'not-a-date', '2026-10-26'));
  assert.equal(url.pathname, '/car/rental');
});
