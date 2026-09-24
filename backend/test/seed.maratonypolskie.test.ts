import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMpDate, parseList, parseDetail, searchLink, maratonypolskieProvider } from '../src/seed/providers/maratonypolskie';

test('parseMpDate: the three formats the portal uses', () => {
  assert.deepEqual(parseMpDate('2026.9.5'), ['2026-09-05']);
  assert.deepEqual(parseMpDate('29.9.2026 (wt)'), ['2026-09-29']);
  assert.deepEqual(parseMpDate('19-20.09.2026'), ['2026-09-19', '2026-09-20']);
  assert.deepEqual(parseMpDate('18-20.09.2026'), ['2026-09-18', '2026-09-19', '2026-09-20']);
  assert.deepEqual(parseMpDate('brak daty'), []);
});

test('parseList: one row per event, distance stripped from the place', () => {
  const html = `
    <tr><td><img src="/pikto/ik_01.gif"></td><td>5.9.2026 (so)</td>
      <td>Gdańsk 5 km.</td><td><a href="?dzial=3&action=5&code=87054&bieganie">Bieg Obrońców Poczty Polskiej</a></td></tr>
    <tr><td><a href="?dzial=3&action=1&grp=13">Nawigacja</a></td></tr>
  `;
  const events = parseList(html);
  assert.equal(events.length, 1, 'the nav row is dropped');
  assert.equal(events[0].code, '87054');
  assert.deepEqual(events[0].dates, ['2026-09-05']);
  assert.equal(events[0].city, 'Gdańsk');
  assert.equal(events[0].distance, '5 km');
  assert.equal(events[0].name, 'Bieg Obrońców Poczty Polskiej');
});

test('searchLink: a web search for the race, never a banner link', () => {
  const url = searchLink('Bieg Motyli', 'Poznań', '2026');
  assert.ok(url.startsWith('https://www.google.com/search?q='));
  assert.equal(decodeURIComponent(url.split('q=')[1]), 'Bieg Motyli Poznań 2026');
});

test('parseDetail: the logged-in page gives the distance and the official link', () => {
  const html = `
    <img src='pikto/dyst2.png'><FONT SIZE=5>5 km<BR><FONT SIZE=2>Dostępne dystanse
    <img src='pikto/inter2.png'><a class='mp2' href=http://5.biegnijmy.pl target='inn1'>5.biegnijmy.pl</a>
    WYLOGUJ
  `;
  const d = parseDetail(html);
  assert.equal(d.distance, '5 km');
  assert.equal(d.officialLink, 'http://5.biegnijmy.pl');
  assert.equal(d.loggedIn, true);
});

test('parseDetail: a logged-out page hides the distance and the link', () => {
  const d = parseDetail('<FONT SIZE=2>Zaloguj się aby zobaczyć informacje');
  assert.equal(d.distance, null);
  assert.equal(d.officialLink, null);
  assert.equal(d.loggedIn, false);
});

test('the source carries our shared poster and goes live without review', () => {
  assert.equal(maratonypolskieProvider.id, 'maratonypolskie');
  assert.equal(maratonypolskieProvider.pendingByDefault, undefined);
});
