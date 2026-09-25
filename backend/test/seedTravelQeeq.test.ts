import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carRentalUrl } from '../src/travel/qeeq';

function target(url: string): string {
  return new URL(url).searchParams.get('u') ?? '';
}

test('carRentalUrl: dates open the QEEQ offer list for the airport', () => {
  const url = carRentalUrl('BCN', '2026-10-25', '2026-10-26');
  assert.match(url, /^https:\/\/tp\.media\/r\?/);
  const params = new URL(url).searchParams;
  assert.equal(params.get('marker'), '778460');
  assert.equal(params.get('p'), '4845');
  assert.equal(params.get('trs'), '574753');
  assert.equal(params.get('campaign_id'), '172');
  const t = new URL(target(url));
  assert.equal(t.pathname, '/car/search');
  assert.equal(t.searchParams.get('pickup_landmark'), '99191');
  assert.equal(t.searchParams.get('dropoff_landmark'), '99191');
  assert.equal(t.searchParams.get('pickup_city'), '2765');
  assert.equal(t.searchParams.get('from_date_0'), '2026-10-25');
  assert.equal(t.searchParams.get('to_date_0'), '2026-10-26');
});

test('carRentalUrl: no dates keep the airport landing', () => {
  const t = new URL(target(carRentalUrl('BCN')));
  assert.equal(t.pathname, '/car-rental-deals/');
  assert.equal(t.searchParams.get('airport'), '99191');
});

test('carRentalUrl: an airport QEEQ does not list falls back to the homepage', () => {
  const t = new URL(target(carRentalUrl('ZZZ')));
  assert.equal(t.origin + t.pathname, 'https://www.qeeq.com/');
});

test('carRentalUrl: a bad date is not used as a search date', () => {
  const t = new URL(target(carRentalUrl('BCN', 'not-a-date', '2026-10-26')));
  assert.equal(t.pathname, '/car-rental-deals/');
});
