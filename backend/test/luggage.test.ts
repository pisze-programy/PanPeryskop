import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cityForAirport, cityIdFor, luggagePrice, luggageSlug, luggageUrl } from '../src/travel/radical';

function target(url: string): URL {
  const wrapped = new URL(url);
  assert.equal(wrapped.host, 'tp.media');
  assert.equal(wrapped.searchParams.get('campaign_id'), '209');
  assert.equal(wrapped.searchParams.get('marker'), '778460');
  const inner = wrapped.searchParams.get('u');
  assert.ok(inner, 'the affiliate link carries the target');
  return new URL(inner);
}

test('luggageUrl: the city page carries the slug, the place and the dates', () => {
  const inner = target(luggageUrl('krakow-poland', '2026-10-05', '2026-10-07'));
  assert.equal(inner.pathname, '/pl/storage-list/krakow');
  assert.equal(inner.searchParams.get('s'), 'Kraków, Poland');
  assert.equal(inner.searchParams.get('dropOff'), '2026-10-05T11:00:00+02:00');
  assert.equal(inner.searchParams.get('pickUp'), '2026-10-07T16:00:00+02:00');
});

test('luggageUrl: the winter offset is an hour behind', () => {
  const inner = target(luggageUrl('krakow-poland', '2027-01-08', '2027-01-10'));
  assert.equal(inner.searchParams.get('dropOff'), '2027-01-08T11:00:00+01:00');
});

test('luggageUrl: without a city the home page keeps the dates', () => {
  const inner = target(luggageUrl(null, '2026-10-05', '2026-10-07'));
  assert.equal(inner.pathname, '/pl');
  assert.equal(inner.searchParams.get('s'), null);
  assert.equal(inner.searchParams.get('dropOff'), '2026-10-05T11:00:00+02:00');
});

test('luggageUrl: without a date the link still resolves', () => {
  const inner = target(luggageUrl('krakow-poland', undefined, undefined));
  assert.equal(inner.searchParams.get('dropOff'), null);
  assert.equal(inner.searchParams.get('pickUp'), null);
});

test('the city arrives by name or by id', () => {
  assert.equal(cityIdFor('Kraków'), 'krakow-poland');
  assert.equal(cityIdFor('krakow-poland'), 'krakow-poland');
  assert.equal(cityIdFor('KRAKOW-POLAND'), 'krakow-poland');
  assert.equal(cityIdFor('no-such-city'), null);
});

test('the airport points at its city', () => {
  assert.equal(cityForAirport('KRK'), 'krakow-poland');
  assert.equal(cityForAirport('krk'), 'krakow-poland');
  assert.equal(cityForAirport('ZZZ'), null);
});

test('the slug map holds only cities we ship', () => {
  assert.equal(luggageSlug('krakow-poland'), 'krakow');
  assert.equal(luggageSlug('szczecin-poland'), null, 'Szczecin has no storage page');
});

test('the price falls back to the configured default', () => {
  assert.equal(luggagePrice('krakow-poland'), 20);
  assert.equal(luggagePrice('no-such-city'), 20);
});
