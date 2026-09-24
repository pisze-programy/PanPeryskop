import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMpDate, parseList, fetchDetail, maratonypolskieProvider } from '../src/seed/providers/maratonypolskie';

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

test('fetchDetail: the event logo is never read', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    '<a href="https://bieg.example/regulamin">Regulamin</a>',
    { status: 200 }
  )) as typeof fetch;
  try {
    const detail = await fetchDetail('87054');
    assert.deepEqual(Object.keys(detail), ['officialLink'], 'only the official link comes back');
    assert.equal(detail.officialLink, 'https://bieg.example/regulamin');
  } finally {
    globalThis.fetch = original;
  }
});

test('the source carries our shared poster and goes live without review', () => {
  assert.equal(maratonypolskieProvider.id, 'maratonypolskie');
  assert.equal(maratonypolskieProvider.pendingByDefault, undefined);
});
