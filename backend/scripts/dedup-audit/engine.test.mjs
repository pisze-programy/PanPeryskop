// engine.test.mjs — 100%-coverage tests for the independent dedup engine.
// Run:  node --test --experimental-test-coverage backend/scripts/dedup-audit/
// (use --test-coverage on Node >= 22)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIORITY, CINEMA_SOURCES, providerOf, priorityOf,
  foldDiacritics, flatNorm, tokensOfTitle, containment, seqRatio,
  haversineKm, geoDist, hhmmToMin, minToHhmm, parseTimes, timeGapMin,
  descParts, toEvent, hasCoords, isZeroGeo, geoWithin, venueRatio, venueMatch,
  venueTokenOverlap, titleContainment, titleMatch, classifyPair, unionFind, findSuspiciousGroups,
  compareEvents, unionTimes, analyzeGroup, summarize,
} from './engine.mjs';

// --- fixture helper ---------------------------------------------------------
const ev = (o) => ({
  id: o.id ?? 'ev',
  external_id: o.external_id ?? 'going-1',
  provider: 'provider' in o ? o.provider : providerOf(o.external_id ?? 'going-1'),
  title: o.title ?? 'T',
  venue: o.venue ?? 'V',
  loc: o.loc ?? 'V, ul. X',
  day: o.day ?? '2026-09-07',
  lat: 'lat' in o ? o.lat : 52.24,
  lng: 'lng' in o ? o.lng : 21.01,
  status: o.status ?? 'approved',
  times: o.times ?? [1140], // 19:00
});

const post = (o) => ({
  id: o.id ?? 'p',
  external_id: o.external_id ?? 'going-1',
  description: o.description ?? 'Title: 19:00, Venue',
  lat: 'lat' in o ? o.lat : 52.24,
  lng: 'lng' in o ? o.lng : 21.01,
  event_date: o.event_date ?? '2026-09-07',
  showtimes: o.showtimes ?? null,
  status: o.status ?? 'approved',
});

// --- provider / priority ----------------------------------------------------
test('providerOf splits external_id on the first dash', () => {
  assert.equal(providerOf('kupbilecik-123-20260907'), 'kupbilecik');
  assert.equal(providerOf('going-2413504'), 'going');
  assert.equal(providerOf(''), '');
  assert.equal(providerOf(undefined), '');
  assert.equal(providerOf('no-dash'), 'no');
});

test('priorityOf reads PRIORITY, unknown ranks 99', () => {
  assert.equal(priorityOf('going'), 2);
  assert.equal(priorityOf('ebilet'), 7);
  assert.equal(priorityOf('facebook'), 3.5);
  assert.equal(priorityOf('nonsense'), 99);
  assert.equal(PRIORITY.helios, 0);
  assert.ok(CINEMA_SOURCES.has('multikino'));
  assert.ok(CINEMA_SOURCES.has('helios'));
  assert.ok(CINEMA_SOURCES.has('cinemacity'));
  assert.ok(!CINEMA_SOURCES.has('going'));
});

// --- normalization ----------------------------------------------------------
test('foldDiacritics folds ł and combining diacritics', () => {
  assert.equal(foldDiacritics('Łódź'), 'lodz');
  assert.equal(foldDiacritics('André'), 'andre');
  assert.equal(foldDiacritics(''), '');
  assert.equal(foldDiacritics(undefined), '');
  assert.equal(foldDiacritics('ŻÓŁĆ'), 'zolc');
});

test('flatNorm token-joins folded text', () => {
  assert.equal(flatNorm('Teatr Capitol, ul. X'), 'teatr capitol ul x');
  assert.equal(flatNorm(''), '');
});

test('tokensOfTitle: venue tokens (exact) + stopwords + short tokens dropped', () => {
  const t = tokensOfTitle('Koncert Chopinowski w Sali Koncertowej', 'Sala Koncertowa');
  // exact-match venue subtraction: 'sala'/'koncertowa' removed, 'sali'/'koncertowej' stay
  assert.deepEqual([...t].sort(), ['chopinowski', 'koncert', 'koncertowej', 'sali'].sort());
  assert.ok(!t.has('w')); // stopword
  const cyr = tokensOfTitle('Музика фільм', '');
  assert.ok(cyr.size === 2);
  assert.equal(tokensOfTitle('!!!', '').size, 0); // no token matches -> empty set
});

test('containment: empty -> 0, partial, full', () => {
  assert.equal(containment(new Set(), new Set(['a'])), 0);
  assert.equal(containment(new Set(['a']), new Set()), 0);
  assert.equal(containment(new Set(['a', 'b']), new Set(['a', 'c'])), 0.5);
  assert.equal(containment(new Set(['a', 'b']), new Set(['a', 'b', 'c'])), 1);
  assert.equal(containment(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
});

test('seqRatio: LCS ratio, empty cases', () => {
  assert.equal(seqRatio('', ''), 1);
  assert.equal(seqRatio('abc', ''), 0);
  assert.equal(seqRatio('', 'abc'), 0);
  assert.equal(seqRatio('abc', 'abc'), 1);
  assert.ok(Math.abs(seqRatio('abc', 'abd') - 2 / 3) < 1e-9); // LCS 'ab'
});

// --- geo --------------------------------------------------------------------
test('haversineKm: same point = 0, known distance', () => {
  assert.equal(haversineKm(52.24, 21.01, 52.24, 21.01), 0);
  // ~50m at this latitude for 0.001 deg lng
  const d = haversineKm(52.24, 21.01, 52.24, 21.011);
  assert.ok(d > 0.03 && d < 0.10, `unexpected ${d}`);
  assert.ok(geoDist({ lat: 52.24, lng: 21.01 }, { lat: 52.24, lng: 21.011 }) === d);
});

// --- time -------------------------------------------------------------------
test('hhmmToMin / minToHhmm round-trip + invalid', () => {
  assert.equal(hhmmToMin('19:00'), 1140);
  assert.equal(hhmmToMin('00:00'), 0);
  assert.equal(hhmmToMin('12:30'), 750);
  assert.equal(hhmmToMin(null), null);
  assert.equal(hhmmToMin(''), null);
  assert.equal(hhmmToMin('1900'), null);
  assert.equal(minToHhmm(1140), '19:00');
  assert.equal(minToHhmm(750), '12:30');
  assert.equal(minToHhmm(0), '00:00');
});

test('tokensOfTitle: noise words (dubbing/napisy/ukrainski) dropped', () => {
  const t = tokensOfTitle('Koncert ukraiński dubbing napisy', '');
  assert.ok(!t.has('ukrainski'));
  assert.ok(!t.has('dubbing'));
  assert.ok(!t.has('napisy'));
  assert.ok(t.has('koncert'));
});

test('tokensOfTitle: stopword (len>=3) + full venue-token subtraction', () => {
  const a = tokensOfTitle('Koncert premiera poznan', '');
  assert.ok(!a.has('premiera')); // len>=3 stopword dropped
  assert.ok(!a.has('poznan'));
  assert.ok(a.has('koncert'));
  const b = tokensOfTitle('Sala Koncertowa Gala', 'Sala Koncertowa');
  assert.deepEqual([...b], ['gala']); // exact venue tokens subtracted
  // truthy venue with no token matches -> empty subtraction set
  assert.deepEqual([...tokensOfTitle('Gala', '!!!')], ['gala']);
});

test('parseTimes: valid JSON non-array + invalid descTime fallback', () => {
  assert.deepEqual(parseTimes({ showtimes: '42' }, '19:00'), [1140]); // non-array JSON -> desc
  assert.deepEqual(parseTimes({ showtimes: '[]' }, 'bad'), []); // invalid descTime -> empty
});

test('parseTimes: JSON preferred, desc fallback, empty', () => {
  assert.deepEqual(parseTimes({ showtimes: '["16:00","21:00"]' }), [960, 1260]);
  assert.deepEqual(parseTimes({ showtimes: '["21:00","16:00"]' }), [960, 1260]); // sorted
  assert.deepEqual(parseTimes({ showtimes: 'not-json' }, '19:00'), [1140]);
  assert.deepEqual(parseTimes({ showtimes: '[]' }, '19:00'), [1140]);
  assert.deepEqual(parseTimes({ showtimes: null }, null), []);
  assert.deepEqual(parseTimes({ showtimes: '["bad"]' }, '19:00'), [1140]); // invalid entry dropped
});

test('timeGapMin: min pairwise gap, Infinity on empty', () => {
  assert.equal(timeGapMin([1140], [1200]), 60);
  assert.equal(timeGapMin([960, 1260], [1200]), 60);
  assert.equal(timeGapMin([960, 1260], [720]), 240);
  assert.equal(timeGapMin([], [1200]), Infinity);
  assert.equal(timeGapMin([1200], []), Infinity);
});

// --- description parsing ----------------------------------------------------
test('descParts parses seed description format', () => {
  assert.deepEqual(descParts('Tytuł: 19:00, Miejsce, ul. X'), { title: 'Tytuł', time: '19:00', loc: 'Miejsce, ul. X' });
  assert.deepEqual(descParts('No time here'), { title: 'No time here', time: null, loc: '' });
  assert.deepEqual(descParts(''), { title: '', time: null, loc: '' });
});

test('descParts: loose HH:MM fallback (colon in title, single-digit hour)', () => {
  assert.deepEqual(descParts('Koncert: Muzyka filmowa, 19:00, Sala X'), { title: 'Koncert: Muzyka filmowa', time: '19:00', loc: '' });
  assert.deepEqual(descParts('Wydarzenie o 9:00 rano'), { title: 'Wydarzenie o', time: '09:00', loc: '' });
});

test('toEvent normalizes a post row', () => {
  const e = toEvent(post({
    external_id: 'ebilet-25271-20260907',
    description: 'Koncert Chopinowski: 21:00, Sala Koncertowa „Fryderyk", ul. Piękna',
    showtimes: '["12:30","21:00"]',
  }));
  assert.equal(e.provider, 'ebilet');
  assert.equal(e.title, 'Koncert Chopinowski');
  assert.equal(e.venue, 'Sala Koncertowa „Fryderyk"');
  assert.equal(e.loc, 'Sala Koncertowa „Fryderyk", ul. Piękna');
  assert.deepEqual(e.times, [750, 1260]); // showtimes JSON wins over description time
  assert.equal(e.day, '2026-09-07');
  assert.equal(e.status, 'approved');
});

test('toEvent: description time fallback when no showtimes', () => {
  const e = toEvent(post({ description: 'X: 19:00, M' }));
  assert.deepEqual(e.times, [1140]);
});

test('toEvent: null lat/lng stays null', () => {
  const e = toEvent(post({ lat: null, lng: null }));
  assert.equal(e.lat, null);
  assert.equal(e.lng, null);
});

// --- pairwise predicates ----------------------------------------------------
test('hasCoords / isZeroGeo / geoWithin', () => {
  assert.ok(hasCoords(ev({})));
  assert.ok(!hasCoords(ev({ lat: null, lng: null })));
  assert.ok(!hasCoords(ev({ lat: 52.24, lng: null }))); // lng not a number
  assert.ok(isZeroGeo(ev({ lat: 0, lng: 0 })));
  assert.ok(!isZeroGeo(ev({})));
  assert.ok(geoWithin(ev({}), ev({ lat: 52.24009, lng: 21.01009 }), 1.5));
  assert.ok(!geoWithin(ev({}), ev({ lat: 52.3, lng: 21.1 }), 1.5));
  assert.ok(!geoWithin(ev({ lat: null }), ev({}), 1.5));
});

test('venueRatio: both, one-empty, both-empty', () => {
  assert.equal(venueRatio(ev({ venue: 'BARdzo bardzo' }), ev({ venue: 'BARdzo bardzo' })), 1);
  assert.ok(venueRatio(ev({ venue: 'BARdzo bardzo' }), ev({ venue: 'BARdzo bardzo, Nowogrodzka 11' })) < 0.8);
  assert.equal(venueRatio(ev({ venue: '' }), ev({ venue: 'X' })), 0);
  assert.equal(venueRatio(ev({ venue: 'X' }), ev({ venue: '' })), 0);
  assert.equal(venueRatio(ev({ venue: '' }), ev({ venue: '' })), 1);
});

test('venueMatch: ratio path vs geo fallback', () => {
  assert.ok(venueMatch(ev({ venue: 'Teatr Roma' }), ev({ venue: 'Teatr Roma' })));
  assert.ok(!venueMatch(ev({ venue: 'Teatr Roma' }), ev({ venue: 'Inne Miejsce X' })));
  // one side empty -> geo path
  assert.ok(venueMatch(ev({ venue: 'X' }), ev({ venue: '', lat: 52.24009, lng: 21.01009 }), 1.5));
  assert.ok(!venueMatch(ev({ venue: 'X' }), ev({ venue: '', lat: 52.3, lng: 21.1 }), 1.5));
});

test('venueTokenOverlap: shared token, distinct venues, empty trusts geo', () => {
  assert.ok(venueTokenOverlap(ev({ venue: 'BARdzo bardzo' }), ev({ venue: 'BARdzo bardzo, Nowogrodzka 11' })));
  assert.ok(!venueTokenOverlap(ev({ venue: 'Sala Koncertowa Fryderyk' }), ev({ venue: 'STARA GALERIA ZPAF' })));
  assert.ok(venueTokenOverlap(ev({ venue: '' }), ev({ venue: 'Sala X' })));
  assert.ok(venueTokenOverlap(ev({ venue: 'Sala X' }), ev({ venue: '' })));
  assert.ok(venueTokenOverlap(ev({ venue: '' }), ev({ venue: '' })));
});

test('titleContainment / titleMatch thresholds', () => {
  const a = ev({ title: 'Alpha Beta Gamma', venue: '' });
  const b = ev({ title: 'Alpha Beta Gamma Delta', venue: '' }); // cont 1.0
  assert.equal(titleContainment(a, b), 1);
  assert.ok(titleMatch(a, b));
  // same-provider needs 1.0: 0.75 fails (cross too, 0.75 < 0.8)
  const c = ev({ title: 'Alpha Beta Gamma Epsilon', venue: '', provider: 'kupbilecik' });
  const c2 = ev({ title: 'Alpha Beta Gamma Delta', venue: '', provider: 'kupbilecik' });
  assert.equal(titleContainment(c, c2), 0.75);
  assert.ok(!titleMatch(c, c2, 0.8, 1.0));
  assert.ok(!titleMatch(c, { ...c2, provider: 'ebilet' }, 0.8, 1.0));
  // cross-provider at exactly 0.8 passes; same-provider at 0.8 fails
  const x = ev({ title: 'Alpha Beta Gamma Delta Epsilon', venue: '', provider: 'ebilet' });
  const y = ev({ title: 'Alpha Beta Gamma Delta Foxtrot', venue: '', provider: 'going' });
  assert.equal(titleContainment(x, y), 0.8);
  assert.ok(titleMatch(x, y, 0.8, 1.0));
  assert.ok(!titleMatch({ ...x, provider: 'kupbilecik' }, { ...y, provider: 'kupbilecik' }, 0.8, 1.0));
});

// --- classification ---------------------------------------------------------
test('classifyPair: same (title+geo agree)', () => {
  const r = classifyPair(
    ev({ title: 'BAYONNE', venue: 'BARdzo bardzo' }),
    ev({ title: 'BAYONNE | Warszawa', venue: 'BARdzo bardzo', lat: 52.24009, lng: 21.01009 }),
  );
  assert.equal(r.kind, 'same');
  assert.ok(r.cont >= 1);
});

test('classifyPair: same via venue when geo too strict', () => {
  const r = classifyPair(
    ev({ title: 'Bayonne', venue: 'Teatr Roma' }),
    ev({ title: 'Bayonne', venue: 'Teatr Roma', lat: 52.3, lng: 21.1 }), // far but same venue string
    { geoKm: 0.5 },
  );
  assert.equal(r.kind, 'same');
});

test('classifyPair: ambiguous when venue/geo agree but title weak', () => {
  const r = classifyPair(
    ev({ title: 'Muzyka Filmowa: Koncert przy świecach' }),
    ev({ title: 'Bridgerton: Koncert przy świecach', lat: 52.24005, lng: 21.01005 }),
  );
  assert.equal(r.kind, 'ambiguous');
  assert.ok(r.cont < 0.8);
});

test('classifyPair: ambiguous with ZERO shared tokens but same venue (trap)', () => {
  const r = classifyPair(
    ev({ title: 'GENESIS The Creation Light Show', venue: 'Royal Chopin Hall' }),
    ev({ title: 'Chopin Friends Concert Candlelight', venue: 'Royal Chopin Hall', lat: 52.24001, lng: 21.01001 }),
  );
  assert.equal(r.cont, 0);
  assert.equal(r.kind, 'ambiguous');
});

test('classifyPair: different when neither venue nor geo nor title agree', () => {
  const r = classifyPair(
    ev({ title: 'Alpha', venue: 'Stadion X' }),
    ev({ title: 'Beta', venue: 'Muzeum Y', lat: 52.3, lng: 21.1 }),
  );
  assert.equal(r.kind, 'different');
});

test('classifyPair: same title but different venue+geo -> different', () => {
  const r = classifyPair(
    ev({ title: 'Bayonne', venue: 'Klub A', lat: 52.24, lng: 21.01 }),
    ev({ title: 'Bayonne', venue: 'Muzeum Y', lat: 53.1, lng: 18.6 }),
  );
  assert.equal(r.cont, 1);
  assert.equal(r.kind, 'different');
});

test('classifyPair: cont>=min + geoOk but NO venue overlap -> ambiguous (Fryderyk/ZPAF trap)', () => {
  const r = classifyPair(
    ev({ title: 'Koncert Chopinowski', venue: 'Sala Koncertowa Fryderyk' }),
    ev({ title: 'Koncert Chopinowski w Chopin Point Warsaw', venue: 'STARA GALERIA ZPAF', lat: 52.24003, lng: 21.01003 }),
  );
  assert.equal(r.cont, 1);
  assert.equal(r.kind, 'ambiguous');
});

test('classifyPair: same provider + generic shared token, different venues -> ambiguous (Muzeum trap)', () => {
  const r = classifyPair(
    ev({ title: 'Indywidualne zwiedzanie wystawy', venue: 'Muzeum Sztuki Nowoczesnej', provider: 'ebilet' }),
    ev({ title: 'Zwiedzanie Muzeum - Mt 5,14', venue: 'Muzeum Jana Pawla II', provider: 'ebilet', lat: 52.24009, lng: 21.01009 }),
  );
  assert.equal(r.cont, 1); // {zwiedzanie} fully contained
  assert.equal(r.kind, 'ambiguous'); // vr < 0.8: NOT same despite geo
});

test('classifyPair: empty venue trusts close geo -> same', () => {
  const r = classifyPair(
    ev({ title: 'Bayonne', venue: '' }),
    ev({ title: 'Bayonne', venue: '', lat: 52.24009, lng: 21.01009 }),
  );
  assert.equal(r.kind, 'same');
});

// --- union-find -------------------------------------------------------------
test('unionFind: find/union with path compression and cycles', () => {
  const uf = unionFind(4);
  assert.equal(uf.find(3), 3);
  uf.union(0, 1);
  uf.union(1, 2);
  uf.union(2, 0); // cycle
  assert.equal(uf.find(0), uf.find(1));
  assert.equal(uf.find(0), uf.find(2));
  assert.notEqual(uf.find(0), uf.find(3));
});

test('unionFind: deep chain compresses on find', () => {
  const uf = unionFind(5);
  uf.union(0, 1);
  uf.union(1, 2);
  uf.union(2, 3);
  uf.union(3, 4);
  assert.equal(uf.find(4), uf.find(0));
  assert.equal(uf.find(0), 0);
});

// --- grouping ---------------------------------------------------------------
test('findSuspiciousGroups: Pass A (geo + time ±1h), cross-provider', () => {
  const groups = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'going-1', title: 'Bayonne', times: [1140] }),
    ev({ id: 'b', external_id: 'ebilet-2', title: 'Bayonne', lat: 52.24009, lng: 21.01009, times: [1200] }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members.length, 2);
});

test('findSuspiciousGroups: Pass B (geo + title containment) even when time far', () => {
  const groups = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'kupbilecik-1', title: 'Polyphonics & Paweł Głowiński', venue: 'Teatr Muzyczny ROMA', times: [1080] }),
    ev({ id: 'b', external_id: 'ebilet-2', title: 'Wodecki - Welcome To Polyphonics & Paweł Głowiński', venue: 'Teatr Muzyczny Roma', lat: 52.24009, lng: 21.01009, times: [720] }),
  ]);
  assert.equal(groups.length, 1);
});

test('findSuspiciousGroups: same-provider 0.8 title + far time NOT grouped', () => {
  const groups = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'kupbilecik-1', title: 'A B C D E', venue: 'V', times: [720] }),
    ev({ id: 'b', external_id: 'kupbilecik-2', title: 'A B C D F', venue: 'V', lat: 52.24009, lng: 21.01009, times: [1260] }),
  ]);
  assert.equal(groups.length, 0);
});

test('findSuspiciousGroups: same-provider identical tokens grouped', () => {
  const groups = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'kupbilecik-1', title: 'Alpha Beta Gamma', venue: 'V', times: [1080] }),
    ev({ id: 'b', external_id: 'kupbilecik-2', title: 'Alpha Beta Gamma', venue: 'V', lat: 52.24009, lng: 21.01009, times: [1260] }),
  ]);
  assert.equal(groups.length, 1);
});

test('findSuspiciousGroups: transitivity chains A-B, B-C', () => {
  const groups = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'going-1', title: 'Bayonne', times: [1140] }),
    ev({ id: 'b', external_id: 'ebilet-2', title: 'Bayonne', lat: 52.24009, lng: 21.01009, times: [1200] }),
    ev({ id: 'c', external_id: 'eventim-3', title: 'Bayonne', lat: 52.24019, lng: 21.01019, times: [1260] }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members.length, 3);
});

test('findSuspiciousGroups: cinema sources excluded by default', () => {
  const groups = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'multikino-1', title: 'Film', venue: 'Multikino X', times: [1080] }),
    ev({ id: 'b', external_id: 'multikino-2', title: 'Film', venue: 'Multikino X', lat: 52.24009, lng: 21.01009, times: [1080] }),
  ]);
  assert.equal(groups.length, 0);
  const withCin = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'multikino-1', title: 'Film', venue: 'Multikino X', times: [1080] }),
    ev({ id: 'b', external_id: 'multikino-2', title: 'Film', venue: 'Multikino X', lat: 52.24009, lng: 21.01009, times: [1080] }),
  ], { includeCinemas: true });
  assert.equal(withCin.length, 1);
});

test('findSuspiciousGroups: 0,0 geo excluded', () => {
  const groups = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'going-1', title: 'X', lat: 0, lng: 0, times: [1140] }),
    ev({ id: 'b', external_id: 'ebilet-2', title: 'X', lat: 0, lng: 0, times: [1140] }),
  ]);
  assert.equal(groups.length, 0);
});

test('findSuspiciousGroups: different days never grouped', () => {
  const groups = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'going-1', title: 'X', day: '2026-09-07', times: [1140] }),
    ev({ id: 'b', external_id: 'ebilet-2', title: 'X', day: '2026-09-08', lat: 52.24009, lng: 21.01009, times: [1140] }),
  ]);
  assert.equal(groups.length, 0);
});

test('findSuspiciousGroups: missing geo never groups (no coords)', () => {
  const groups = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'going-1', title: 'X', lat: null, lng: null, times: [1140] }),
    ev({ id: 'b', external_id: 'ebilet-2', title: 'X', lat: null, lng: null, times: [1140] }),
  ]);
  assert.equal(groups.length, 0);
});

test('findSuspiciousGroups: Pass A requires venue agreement (no blob chaining)', () => {
  const events = [
    ev({ id: 'a', external_id: 'going-1', title: 'Amy Gadiaga', venue: 'Klub Jassmine', times: [1140] }),
    ev({ id: 'b', external_id: 'ebilet-2', title: 'BAYONNE', venue: 'BARdzo bardzo', lat: 52.24009, lng: 21.01009, times: [1140] }),
  ];
  assert.equal(findSuspiciousGroups(events).length, 0); // venues differ, no title match
  assert.equal(findSuspiciousGroups(events, { requireVenueForTime: false }).length, 1); // raw geo+time
});

test('findSuspiciousGroups: empty input', () => {
  assert.deepEqual(findSuspiciousGroups([]), []);
});

test('findSuspiciousGroups: end-to-end with toEvent(post rows)', () => {
  const posts = [
    post({ id: 'a', external_id: 'going-2413504', description: 'BAYONNE | Warszawa: 19:00, BARdzo bardzo, Nowogrodzka 11' }),
    post({ id: 'b', external_id: 'ebilet-205773-20260912', description: 'BAYONNE: 20:00, BARdzo bardzo', lat: 52.229723, lng: 21.017775, event_date: '2026-09-12' }),
  ];
  posts[0].lat = 52.2291039; posts[0].lng = 21.0177749; posts[0].event_date = '2026-09-12';
  const events = posts.map(toEvent);
  const groups = findSuspiciousGroups(events);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].pairs[0].kind, 'same');
});

// --- merge simulation / damage ----------------------------------------------
test('compareEvents: priority first, then title, then time', () => {
  const high = ev({ provider: 'going', title: 'Bayonne', times: [1200] });
  const low = ev({ provider: 'ebilet', title: 'Bayonne', times: [1140] });
  assert.ok(compareEvents(high, low) < 0); // going wins despite later time
  const same = ev({ provider: 'ebilet', title: 'B', times: [1140] });
  assert.ok(compareEvents({ ...same, title: 'A' }, same) < 0);
  assert.ok(compareEvents({ ...same, times: [1260] }, { ...same, times: [1140] }) > 0);
  // empty times -> treated as 1440 (last tiebreak, not first)
  assert.ok(compareEvents({ ...same, times: [] }, { ...same, times: [1140] }) > 0);
  assert.ok(compareEvents({ ...same, times: [1140] }, { ...same, times: [] }) < 0);
});

test('unionTimes: sorted unique union; empty members contribute nothing', () => {
  assert.deepEqual(unionTimes([
    ev({ times: [1200, 960] }),
    ev({ times: [1200, 1080] }),
    ev({ times: [] }),
  ]), [960, 1080, 1200]);
  assert.deepEqual(unionTimes([ev({ times: [] }), ev({ times: [] })]), []);
});

test('analyzeGroup: winner, losers, merged times, pairs + gapMin', () => {
  const g = analyzeGroup([
    ev({ id: 'b', external_id: 'ebilet-2', title: 'GENESIS The Creation Light Show', venue: 'Royal Chopin Hall', times: [960, 1260] }),
    ev({ id: 'a', external_id: 'kupbilecik-1', title: 'Chopin Friends Concert Candlelight', venue: 'Royal Chopin Hall', lat: 52.24009, lng: 21.01009, times: [1200] }),
  ]);
  assert.equal(g.winner.external_id, 'kupbilecik-1'); // priority 3 < 7
  assert.equal(g.losers.length, 1);
  assert.deepEqual(g.mergedTimes, [960, 1200, 1260]);
  assert.deepEqual(g.mergedTimesRaw, ['16:00', '20:00', '21:00']);
  assert.equal(g.pairs.length, 1);
  assert.equal(g.pairs[0].kind, 'ambiguous'); // zero shared tokens, same venue
  assert.equal(g.pairs[0].gapMin, 60);
});

test('summarize: counts groups, posts, pairs, kinds, provider mixes', () => {
  const groups = findSuspiciousGroups([
    ev({ id: 'a', external_id: 'going-1', title: 'Bayonne', times: [1140] }),
    ev({ id: 'b', external_id: 'ebilet-2', title: 'Bayonne', lat: 52.24009, lng: 21.01009, times: [1200] }),
    ev({ id: 'c', external_id: 'kupbilecik-3', title: 'Candlelight', lat: 52.28, lng: 21.06, times: [1080] }),
    ev({ id: 'd', external_id: 'kupbilecik-4', title: 'Candlelight', lat: 52.28009, lng: 21.06009, times: [1140] }),
  ]);
  assert.equal(groups.length, 2);
  const s = summarize(groups);
  assert.equal(s.groups, 2);
  assert.equal(s.involvedPosts, 4);
  assert.equal(s.pairs, 2);
  assert.equal(s.same, 2);
  assert.equal(s.ambiguous, 0);
  assert.equal(s.different, 0);
  assert.equal(s.crossProvider, 1);
  assert.equal(s.sameProvider, 1);
});

test('summarize: empty groups', () => {
  const s = summarize([]);
  assert.deepEqual(s, { groups: 0, involvedPosts: 0, pairs: 0, same: 0, ambiguous: 0, different: 0, sameProvider: 0, crossProvider: 0 });
});