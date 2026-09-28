import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekendAnchors, windowMonths, cheapestOn, routePrice, renderPage, WEEKEND_WINDOWS, type Offer } from '../src/travel/webpage';
import type { FlightCell } from '../src/travel/flightsApi';

function cell(date: string, price: number | null): FlightCell {
  return { date, hour: '09:00', price };
}

test('weekendAnchors: from Monday returns the next four Fridays', () => {
  assert.deepEqual(
    weekendAnchors('2026-09-28', 4),
    ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23'],
  );
});

test('weekendAnchors: from a Friday includes that day', () => {
  assert.deepEqual(
    weekendAnchors('2026-10-02', 4),
    ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23'],
  );
});

test('windowMonths: covers every weekend month once', () => {
  assert.deepEqual(windowMonths('2026-09-28'), ['2026-10-01']);
});

test('cheapestOn: takes the lowest fare for the exact day', () => {
  const cells = [cell('2026-10-23', 227.76), cell('2026-10-23', 310), cell('2026-10-24', 99)];
  assert.equal(cheapestOn(cells, '2026-10-23'), 227.76);
  assert.equal(cheapestOn(cells, '2026-12-01'), null);
});

test('routePrice: sums the outbound and the return leg', () => {
  const out = [cell('2026-10-23', 227.76)];
  const back = [cell('2026-10-25', 345.27)];
  assert.equal(routePrice(out, back, '2026-10-23', '2026-10-25'), 573.03);
});

test('routePrice: null when one leg has no fare', () => {
  const out = [cell('2026-10-23', 227.76)];
  const back = [cell('2026-10-25', null)];
  assert.equal(routePrice(out, back, '2026-10-23', '2026-10-25'), null);
});

test('renderPage: writes the origin title and the offer links', () => {
  const offer: Offer = {
    city: 'Paryż', iata: 'BVA', carrier: 'ryanair', window: 'pt-ndz',
    start: '2026-10-23', end: '2026-10-25', nights: 2, price: 573,
    flightUrl: 'https://api.panperyskop.app/r/abc', stayUrl: 'https://api.panperyskop.app/r/def',
  };
  const html = renderPage(
    { id: 'poznan', name: 'Poznań', iata: 'POZ' },
    [{ window: WEEKEND_WINDOWS[0], groups: [{ start: '2026-10-23', end: '2026-10-25', offers: [offer] }] }],
    '2026-09-28',
  );
  assert.match(html, /Tanie loty na weekendy z Poznań/);
  assert.match(html, /https:\/\/api\.panperyskop\.app\/r\/abc/);
  assert.match(html, /573 zł/);
});
