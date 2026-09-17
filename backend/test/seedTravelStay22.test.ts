import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staysWidgetUrl } from '../src/travel/stay22';

const base = { checkin: '2026-10-17', checkout: '2026-10-19', theme: 'light' as const, view: 'mini' as const };

test('staysWidgetUrl: coordinates win, dates and affiliate id are set', () => {
  const url = new URL(staysWidgetUrl('panperyskop', { ...base, lat: 52.4, lng: 16.9 }));
  assert.equal(url.origin + url.pathname, 'https://www.stay22.com/embed/gm');
  assert.equal(url.searchParams.get('aid'), 'panperyskop');
  assert.equal(url.searchParams.get('lat'), '52.4');
  assert.equal(url.searchParams.get('lng'), '16.9');
  assert.equal(url.searchParams.get('address'), null);
  assert.equal(url.searchParams.get('checkin'), '2026-10-17');
  assert.equal(url.searchParams.get('checkout'), '2026-10-19');
  assert.equal(url.searchParams.get('currency'), 'PLN');
  assert.equal(url.searchParams.get('ljs'), 'pl');
  assert.equal(url.searchParams.get('hotelsapi'), 'booking');
});

test('staysWidgetUrl: mini map carries no interactive chrome', () => {
  const url = new URL(staysWidgetUrl('panperyskop', { ...base, lat: 52.4, lng: 16.9 }));
  assert.equal(url.searchParams.get('viewmode'), 'map');
  assert.equal(url.searchParams.get('scroll'), 'disabled');
  assert.equal(url.searchParams.get('limit'), '10');
  assert.equal(url.searchParams.get('zoom'), '11');
  assert.equal(url.searchParams.get('title'), null);
  assert.equal(url.searchParams.get('listviewexpand'), null);
  assert.equal(url.searchParams.get('hideextmaplinking'), 'true');
  assert.equal(url.searchParams.get('hidemappanels'), 'true');
  assert.equal(url.searchParams.get('hidenavimage'), 'true');
  assert.equal(url.searchParams.get('hideenlargemap'), 'true');
  assert.equal(url.searchParams.get('hidesearchbar'), 'true');
  assert.equal(url.searchParams.get('hidefilters'), 'true');
  assert.equal(url.searchParams.get('hidecheckinout'), 'true');
  assert.equal(url.searchParams.get('hideguestpicker'), 'true');
  assert.equal(url.searchParams.get('hidemodeswitcher'), 'true');
  assert.equal(url.searchParams.get('hidenavbuttons'), 'true');
  assert.equal(url.searchParams.get('hideallezbutton'), 'true');
  assert.equal(url.searchParams.get('showhotels'), 'true');
  assert.equal(url.searchParams.get('disablerentals'), 'true');
});

test('staysWidgetUrl: sort and filter options ride along', () => {
  const url = new URL(staysWidgetUrl('panperyskop', { ...base, view: 'full', lat: 52.4, lng: 16.9, priceper: 'total', minstars: 4, minguest: 8 }));
  assert.equal(url.searchParams.get('priceper'), 'total');
  assert.equal(url.searchParams.get('minstarrating'), '4');
  assert.equal(url.searchParams.get('minguestrating'), '8');
});

test('staysWidgetUrl: omitted options stay out of the URL', () => {
  const url = new URL(staysWidgetUrl('panperyskop', { ...base, lat: 52.4, lng: 16.9 }));
  assert.equal(url.searchParams.get('priceper'), null);
  assert.equal(url.searchParams.get('minstarrating'), null);
  assert.equal(url.searchParams.get('minguestrating'), null);
});
test('staysWidgetUrl: the full sheet keeps the map and drops its chrome', () => {
  const url = new URL(staysWidgetUrl('panperyskop', { ...base, view: 'full', address: 'Verona' }));
  assert.equal(url.searchParams.get('address'), 'Verona');
  assert.equal(url.searchParams.get('viewmode'), 'map');
  assert.equal(url.searchParams.get('scroll'), 'enabled');
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('zoom'), '13');
  assert.equal(url.searchParams.get('hidefilters'), 'true');
  assert.equal(url.searchParams.get('hidecheckinout'), 'true');
  assert.equal(url.searchParams.get('hideguestpicker'), 'true');
  assert.equal(url.searchParams.get('hidemodeswitcher'), 'true');
  assert.equal(url.searchParams.get('hidesearchbar'), 'true');
  assert.equal(url.searchParams.get('hideallezbutton'), 'true');
  assert.equal(url.searchParams.get('hidenavbuttons'), 'true');
  assert.equal(url.searchParams.get('hideenlargemap'), 'true');
});
