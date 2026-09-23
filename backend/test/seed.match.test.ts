import { test } from 'node:test';
import assert from 'node:assert/strict';
import { venueBase, venuesMatch, venuesClose } from '../src/seed/core/match';
import { aggregateDayCandidates } from '../src/seed/core/aggregate';

const v = (venue: string) => ({ venue, lat: null, lng: null });

test('venueBase: strips the bracketed hall or stage', () => {
  assert.equal(venueBase('Sinfonia Varsovia (Namiot)'), 'Sinfonia Varsovia');
  assert.equal(venueBase('Sinfonia Varsovia (Aula)'), 'Sinfonia Varsovia');
  assert.equal(venueBase('Sinfonia Varsovia (Pawilon Muzyczny)'), 'Sinfonia Varsovia');
  assert.equal(venueBase('Hala Arena (Sala A)'), 'Hala Arena');
});

test('venueBase: brackets in every style and position', () => {
  assert.equal(venueBase('Klub [Sala Główna]'), 'Klub');
  assert.equal(venueBase('Teatr {Scena Kameralna}'), 'Teatr');
  assert.equal(venueBase('Filharmonia (Sala) im. X'), 'Filharmonia im. X');
});

test('venueBase: a name without brackets is unchanged', () => {
  assert.equal(venueBase('Klub Proxima'), 'Klub Proxima');
  assert.equal(venueBase('  Sala Koncertowa Fryderyk  '), 'Sala Koncertowa Fryderyk');
});

test('venueBase: a name that is only a bracket is left whole', () => {
  assert.equal(venueBase('(Namiot)'), '(Namiot)');
  assert.equal(venueBase('[]'), '[]');
});

test('venuesMatch: the stages of one building match', () => {
  // Real case: Eventim lists one Sinfonia Varsovia festival day per room, so the
  // raw venue differed and dedupe kept six posts where one belongs.
  assert.equal(venuesMatch(v('Sinfonia Varsovia (Namiot)'), v('Sinfonia Varsovia (Aula)')), true);
  assert.equal(venuesMatch(v('Sinfonia Varsovia (Namiot)'), v('Sinfonia Varsovia (Do!)')), true);
  assert.equal(venuesMatch(v('Sinfonia Varsovia (Aula)'), v('Sinfonia Varsovia (Pawilon Muzyczny)')), true);
  assert.equal(venuesMatch(v('Sinfonia Varsovia'), v('Sinfonia Varsovia (Namiot)')), true);
});

test('venuesMatch: different buildings still do not match', () => {
  assert.equal(venuesMatch(v('Klub Proxima'), v('Sala Koncertowa Fryderyk')), false);
  assert.equal(venuesMatch(v('Klub Proxima'), v('Klub Hybrydy')), false);
  assert.equal(venuesMatch(v('Hala Arena (Sala A)'), v('Hala Expo (Sala A)')), false);
});

test('venuesClose: the same rule applies to the rescue filter', () => {
  assert.equal(venuesClose('Sinfonia Varsovia (Namiot)', 'Sinfonia Varsovia (Aula)'), true);
  assert.equal(venuesClose('Klub Proxima', 'Klub Hybrydy'), false);
});

// ---- aggregation follows the same venue rule --------------------------------

const festivalDay = (rooms: string[]) => rooms.map((room, i) => ({
  source: 'eventim',
  externalId: `eventim-${i}`,
  title: 'Nowe Otwarcie',
  startMs: Date.parse('2026-09-26T08:00:00Z') + i * 3_600_000,
  lat: 52.2467, lng: 21.0708,
  city: 'WARSZAWA',
  venue: `Sinfonia Varsovia (${room})`,
  link: 'https://example.com/e',
  mediaUrl: '',
  thumbUrl: null,
  times: [`${10 + i}:00`],
}));

test('aggregate: one festival day split by stage merges into ONE post', () => {
  // The real case: Eventim listed a Sinfonia Varsovia day once per room, so six
  // posts stood where the app wants one post with showtimes[].
  const out = aggregateDayCandidates(festivalDay(['Namiot', 'Aula', 'Do!', 'Pawilon Muzyczny', 'Sala L', 'X']) as never);
  assert.equal(out.length, 1, 'six rooms, one post');
  assert.deepEqual(out[0].times, ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00']);
});

test('aggregate: distinct buildings stay separate posts', () => {
  const a = festivalDay(['Namiot'])[0];
  const b = { ...a, externalId: 'eventim-x', venue: 'Klub Proxima', link: 'https://example.com/x' };
  const out = aggregateDayCandidates([a, b] as never);
  assert.equal(out.length, 2, 'two venues, two posts');
});
