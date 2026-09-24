import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTitle, parseCost, lineupOf, genresOf, parseRaEvent,
} from '../src/seed/providers/residentadvisor';

test('normalizeTitle: "FREE ENTRY" goes when the night is not ticketed', () => {
  assert.equal(normalizeTitle('DELUXE. x underiolo FREE ENTRY', false), 'DELUXE. x underiolo');
  assert.equal(normalizeTitle('JASNA 4 ALL OPEN DECKS - FREE ENTR', false), 'JASNA 4 ALL OPEN DECKS');
});

test('normalizeTitle: a ticketed night keeps its words', () => {
  assert.equal(normalizeTitle('Smolna: EARGASM', true), 'Smolna: EARGASM');
  assert.equal(normalizeTitle('FREE ENTRY', true), 'FREE ENTRY');
});

test('normalizeTitle: the spaces collapse and a trailing dash goes', () => {
  assert.equal(normalizeTitle('  Friday   night  ', true), 'Friday night');
  assert.equal(normalizeTitle('B-SIDE  - ', true), 'B-SIDE');
});

test('normalizeTitle: an empty result falls back to the raw title', () => {
  assert.equal(normalizeTitle('FREE ENTRY', false), 'FREE ENTRY');
});

test('normalizeTitle: the lineup leaves the title, the night name stays', () => {
  assert.equal(
    normalizeTitle('SZEPTY: SALVYAN, ANOLUXX, MONYAL', false, ['SALVYAN', 'ANOLUXX', 'MONYAL']),
    'SZEPTY'
  );
  assert.equal(
    normalizeTitle('Obsession: KØZLØV - Luciid - Vendex', false, ['KØZLØV', 'Luciid', 'Vendex']),
    'Obsession'
  );
  assert.equal(normalizeTitle('ARK: Tiga', false, ['Tiga']), 'ARK');
});

test('normalizeTitle: a title that is only the lineup is left alone', () => {
  // Nothing would remain, and a nameless night is worse than a repeated one.
  const lineup = ['larissa', 'Glassz', 'monka'];
  assert.equal(normalizeTitle('larissa, Glassz, monka', false, lineup), 'larissa, Glassz, monka');
  assert.equal(normalizeTitle('Super Flu', true, ['Super Flu']), 'Super Flu');
});

test('normalizeTitle: a custom title without the lineup is untouched', () => {
  assert.equal(normalizeTitle('GO GIRLS', false, ['Someone Else']), 'GO GIRLS');
  assert.equal(normalizeTitle('HAPPY RAVE', false, ['DJ X', 'DJ Y']), 'HAPPY RAVE');
});

test('normalizeTitle: a title that opens with the club keeps the night name', () => {
  assert.equal(normalizeTitle('Smolna: Sam Paganini', true, ['Sam Paganini'], 'Smolna'), 'Smolna: Sam Paganini');
  assert.equal(normalizeTitle('Smolna: EARGASM GOD Invites', true, [], 'Smolna'), 'Smolna: EARGASM GOD Invites');
  assert.equal(normalizeTitle('Ark: Tiga', true, ['Tiga'], 'ARK'), 'Ark: Tiga');
});

test('normalizeTitle: "FREE ENTRY TILL 23:00" goes too', () => {
  assert.equal(
    normalizeTitle('WE ARE NASTY - 2 STAGES - FREE ENTRY TILL 23:00', false, []),
    'WE ARE NASTY - 2 STAGES'
  );
});

test('normalizeTitle: the date leaves the title', () => {
  assert.equal(
    normalizeTitle('RAVE GIRLS POLAND PRES. MILKY RAVE II - 03.10 Ciało', false, []),
    'RAVE GIRLS POLAND PRES. MILKY RAVE II'
  );
});

test('parseCost: a positive number is a price', () => {
  assert.equal(parseCost('10'), 10);
  assert.equal(parseCost('30'), 30);
  assert.equal(parseCost('10-20'), 10);
  assert.equal(parseCost('12.50'), 13);
});

test('parseCost: several tiers keep the first price, never concatenate', () => {
  assert.equal(parseCost('30,40,50'), 30);
  assert.equal(parseCost('30, 40, 50, 30'), 30);
  assert.equal(parseCost('60,80,100'), 60);
});

test('parseCost: zero, free text and empty all give null', () => {
  assert.equal(parseCost('0'), null, 'a free night shows no price');
  assert.equal(parseCost('Free'), null);
  assert.equal(parseCost(''), null);
  assert.equal(parseCost(null), null);
  assert.equal(parseCost(undefined), null);
});

test('lineupOf: the names in order, no duplicates, empty entries dropped', () => {
  assert.deepEqual(lineupOf([{ name: 'Andy Soul' }, { name: 'margas' }, { name: 'BROTHER TIM' }]),
    ['Andy Soul', 'margas', 'BROTHER TIM']);
  assert.deepEqual(lineupOf([{ name: 'A' }, { name: 'A' }, { name: '' }]), ['A']);
  assert.deepEqual(lineupOf(undefined), []);
});

test('genresOf: capped at two', () => {
  assert.deepEqual(genresOf([{ name: 'House' }, { name: 'Garage' }, { name: 'Techno' }]),
    ['House', 'Garage']);
  assert.deepEqual(genresOf([{ name: 'Techno' }]), ['Techno']);
  assert.deepEqual(genresOf(undefined), []);
});

function event(over: Record<string, unknown> = {}) {
  return {
    id: '2530327',
    title: 'DELUXE. x underiolo FREE ENTRY',
    date: '2026-09-24T00:00:00.000',
    startTime: '2026-09-24T21:00:00.000',
    isTicketed: false,
    cost: '0',
    minimumAge: 18,
    contentUrl: '/events/2530327',
    venue: {
      name: 'underiolo',
      capacity: '0',
      area: { name: 'Warsaw' },
      location: { latitude: 52.2331, longitude: 21.0111 },
    },
    artists: [{ name: 'Andy Soul' }, { name: 'margas' }],
    genres: [{ name: 'House' }, { name: 'Garage' }],
    ...over,
  } as never;
}

test('parseRaEvent: the full mapping the card needs', () => {
  const [c] = parseRaEvent(event());
  assert.equal(c.source, 'residentadvisor');
  assert.equal(c.externalId, 'ra-2530327');
  assert.equal(c.title, 'DELUXE. x underiolo', 'FREE ENTRY dropped');
  assert.equal(c.venue, 'underiolo');
  assert.equal(c.city, 'Warsaw');
  assert.equal(c.lat, 52.2331);
  assert.equal(c.link, 'https://ra.co/events/2530327');
  assert.deepEqual(c.tags, ['muzyka']);
  assert.deepEqual(c.times, ['21:00']);
  assert.equal(c.mediaUrl, 'https://api.panperyskop.app/media/posts/defaults/techno-party-club.jpg');
  assert.equal(c.thumbUrl, 'https://api.panperyskop.app/media/posts/defaults/techno-party-club-thumb.jpg');

  const meta = JSON.parse(c.meta ?? '{}');
  assert.deepEqual(meta.lineup, ['Andy Soul', 'margas']);
  assert.deepEqual(meta.genres, ['House', 'Garage']);
  assert.equal(meta.venue, 'underiolo');
  assert.equal(meta.minimumAge, 18);
  assert.equal(meta.price, null, 'a free night carries no price');
  assert.equal(meta.isTicketed, false);
});

test('parseRaEvent: a night with no lineup keeps the empty list', () => {
  const [c] = parseRaEvent(event({ artists: [] }));
  assert.deepEqual(JSON.parse(c.meta ?? '{}').lineup, []);
});

test('parseRaEvent: a row with no position produces nothing', () => {
  const noGeo = event({ venue: { name: 'Klub', area: { name: 'Warsaw' } } });
  assert.equal(parseRaEvent(noGeo).length, 0);
});

test('parseRaEvent: a row with no start produces nothing', () => {
  assert.equal(parseRaEvent(event({ startTime: null })).length, 0);
  assert.equal(parseRaEvent(event({ id: '' })).length, 0);
  assert.equal(parseRaEvent(event({ title: '' })).length, 0);
});
