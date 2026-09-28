import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekendAnchors, windowMonths, cheapestOn, routePrice, renderPage, formatRange, formatDay, WEEKEND_WINDOWS, type Offer } from '../src/travel/webpage';
import { toStayDate, parseStay22, directionsUrl, economyMaxNightlyUsd, cityForAirport, cityZoom, qualityScore, rankHotels, type HotelOffer } from '../src/travel/citybreak';
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

test('windowMonths: covers the default 90-day window', () => {
  assert.deepEqual(windowMonths('2026-09-28'), ['2026-10-01', '2026-11-01', '2026-12-01']);
});

test('windowMonths: 13 weekends reach into December', () => {
  const months = windowMonths('2026-09-28', 13);
  assert.ok(months.includes('2026-10-01'), 'October');
  assert.ok(months.includes('2026-11-01'), 'November');
  assert.ok(months.includes('2026-12-01'), 'December');
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
    city: 'Paris', cityPl: 'Paryż', iata: 'BVA', carrier: 'ryanair', window: 'pt-ndz',
    start: '2026-10-23', end: '2026-10-25', nights: 2, price: 573,
    lat: 49.45, lng: 2.35, imageUrl: null, imageLargeUrl: null, imageCredit: null,
    flightUrl: 'https://api.panperyskop.app/r/abc', stayUrl: 'https://api.panperyskop.app/r/def', carUrl: 'https://api.panperyskop.app/r/ghi', hotel: null,
  };
  const html = renderPage({
    origin: { id: 'poznan', name: 'Poznań', genitive: 'Poznania', slug: 'tanie-loty-z-poznania', iata: 'POZ' },
    sections: [{ window: WEEKEND_WINDOWS[0], groups: [{ start: '2026-10-23', end: '2026-10-25', offers: [offer] }] }],
    featured: [],
    generatedAt: '2026-09-28',
  });
  assert.match(html, /Tanie loty z Poznania/);
  assert.match(html, /https:\/\/api\.panperyskop\.app\/r\/abc/);
  assert.match(html, /573 zł/);
  assert.match(html, /bez hotelu/);
});

test('renderPage: an offer with a hotel shows the hotel name', () => {
  const offer: Offer = {
    city: 'Paris', cityPl: 'Paryż', iata: 'BVA', carrier: 'ryanair', window: 'pt-ndz',
    start: '2026-10-23', end: '2026-10-25', nights: 2, price: 200,
    lat: 49.45, lng: 2.35, imageUrl: null, imageLargeUrl: null, imageCredit: null,
    flightUrl: 'https://api.panperyskop.app/r/abc', stayUrl: 'https://api.panperyskop.app/r/def', carUrl: 'https://api.panperyskop.app/r/ghi',
    hotel: { name: 'Hotel Test', total: 240, perPerson: 120, lat: 48.8, lng: 2.3, url: 'https://www.booking.com/hotel/test', address: 'Rue de Paris', km: 2 },
  };
  const html = renderPage({
    origin: { id: 'poznan', name: 'Poznań', genitive: 'Poznania', slug: 'tanie-loty-z-poznania', iata: 'POZ' },
    sections: [{ window: WEEKEND_WINDOWS[0], groups: [{ start: '2026-10-23', end: '2026-10-25', offers: [offer] }] }],
    featured: [],
    generatedAt: '2026-09-28',
  });
  assert.match(html, /Hotel Test/);
  assert.doesNotMatch(html, /bez hotelu/);
});

test('toStayDate: converts ISO to the Stay22 M/D/YYYY form', () => {
  assert.equal(toStayDate('2026-11-13'), '11/13/2026');
  assert.equal(toStayDate('2026-10-02'), '10/2/2026');
});

test('parseStay22: reads plain JSON and JSONP', () => {
  const body = '{"results":[{"hid":"bk-1"}]}';
  assert.deepEqual(parseStay22(body), [{ hid: 'bk-1' }]);
  const jsonp = '/**/ typeof cb === \'function\' && cb({"results":[{"hid":"bk-2"}]});';
  assert.deepEqual(parseStay22(jsonp), [{ hid: 'bk-2' }]);
});

test('directionsUrl: builds a Google Maps transit link', () => {
  const url = directionsUrl({ lat: 49.45, lng: 2.35 }, { lat: 48.85, lng: 2.35 }, 'transit');
  assert.match(url, /google\.com\/maps\/dir/);
  assert.match(url, /travelmode=transit/);
  assert.match(url, /origin=49\.45%2C2\.35/);
});

test('formatRange: reads like Polish', () => {
  assert.equal(formatRange('2026-10-08', '2026-10-12', 4), 'czwartek 8 - poniedziałek 12 października, 4 noce');
  assert.equal(formatRange('2026-11-06', '2026-11-08', 2), 'piątek 6 - niedziela 8 listopada, 2 noce');
  assert.equal(formatRange('2026-10-30', '2026-11-01', 2), 'piątek 30 października - niedziela 1 listopada, 2 noce');
  assert.equal(formatRange('2026-12-31', '2027-01-03', 3), 'czwartek 31 grudnia 2026 - niedziela 3 stycznia 2027, 3 noce');
  assert.equal(formatRange('2026-11-07', '2026-11-08', 1), 'sobota 7 - niedziela 8 listopada, 1 noc');
  assert.equal(formatRange('2026-11-06', '2026-11-09', 3), 'piątek 6 - poniedziałek 9 listopada, 3 noce');
  assert.equal(formatRange('2026-11-06', '2026-11-11', 5), 'piątek 6 - środa 11 listopada, 5 nocy');
  assert.equal(formatRange('2026-11-06', '2026-11-28', 22), 'piątek 6 - sobota 28 listopada, 22 noce');
});

test('formatDay: reads like Polish', () => {
  assert.equal(formatDay('2026-11-08'), 'niedziela 8 listopada');
});

test('economyMaxNightlyUsd: divides the city cost by 15', () => {
  assert.equal(economyMaxNightlyUsd(1677), 112);
  assert.equal(economyMaxNightlyUsd(1434), 96);
});

test('cityForAirport: uses the curated airport list first', () => {
  assert.equal(cityForAirport('Bergamo', 45.67, 9.70, 'BGY')?.namePl, 'Mediolan');
  assert.equal(cityForAirport('Charleroi', 50.46, 4.45, 'CRL')?.name, 'Brussels');
  assert.equal(cityForAirport('Beauvais', 49.45, 2.11, 'BVA')?.namePl, 'Paryż');
});

test('cityZoom: matches the iOS staysZoomBase rule', () => {
  assert.equal(cityZoom(9378375), 8);
  assert.equal(cityZoom(540000), 10);
  assert.equal(cityZoom(124398), 11);
  assert.ok(cityZoom(0) >= 7 && cityZoom(0) <= 13);
});

test('qualityScore: many mid scores beat few high scores', () => {
  assert.ok(qualityScore(8.7, 1090) > qualityScore(9.7, 3));
});

function hotel(name: string, score: number, reviews: number, total: number, km: number): HotelOffer {
  return { name, address: null, stars: null, score, reviews, type: '', total, perPerson: Math.round(total / 2), url: 'u', thumb: null, lat: 0, lng: 0, km };
}

test('rankHotels: quality first, not the cheapest', () => {
  const ranked = rankHotels([
    hotel('Numa', 9.7, 3, 3847, 0.5),
    hotel('Italianway', 8.7, 1090, 3187, 0.8),
    hotel('EasyTopStay', 8.7, 127, 2642, 1.2),
  ]);
  assert.equal(ranked[0].name, 'Italianway');
});
