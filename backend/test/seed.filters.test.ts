import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupe, dropCancelled, rescueRealShows, isCancelled } from '../src/seed';
import { ProviderId } from '../src/seed/core/types';

function cand(over: Partial<{ source: ProviderId; externalId: string; title: string; startMs: number; venue: string; link: string }>) {
  const externalId = over.externalId ?? 'x-1';
  return {
    source: over.source ?? ProviderId.GOING,
    externalId,
    title: over.title ?? 'Event',
    startMs: over.startMs ?? Date.parse('2026-08-22T18:30:00+02:00'),
    lat: 52.2, lng: 21.0,
    city: 'Warszawa',
    venue: over.venue ?? 'Venue',
    address: '',
    link: over.link ?? `https://example.com/${externalId}`,
    mediaUrl: 'https://example.com/media.webp',
    thumbUrl: 'https://example.com/media_m.webp',
  };
}

test('isCancelled: catches cancelled markers', () => {
  assert.ok(isCancelled('*CANCELLED* Missio'));
  assert.ok(isCancelled('Odwołany koncert'));
  assert.ok(isCancelled('Anulowane wydarzenie'));
  assert.ok(!isCancelled('Koncert przy świecach'));
});

test('dropCancelled: always removes cancelled events before dedupe', () => {
  const live = cand({ externalId: 'live', title: 'MISSIO' });
  const cancelled = cand({ externalId: 'cancelled', title: '*CANCELLED* Missio' });
  const pre = dropCancelled([live, cancelled]);
  assert.deepEqual(pre.map((c) => c.externalId), ['live']);
  const out = dedupe(pre);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'live');
});

test('rescueRealShows: keeps two real kupbilecik shows of the same title+venue, >=2h apart', () => {
  const base = Date.parse('2026-08-22T17:00:00+02:00');
  const show17 = cand({ source: ProviderId.KUPBILECIK, externalId: 'k-17', title: 'SKOLIM', startMs: base, venue: 'Amfiteatr' });
  const show20 = cand({ source: ProviderId.KUPBILECIK, externalId: 'k-20', title: 'SKOLIM', startMs: base + 3 * 3_600_000, venue: 'Amfiteatr' });
  const deduped = dedupe([show17, show20]);
  assert.equal(deduped.length, 1, 'dedupe alone would merge the two shows');
  const out = rescueRealShows([show17, show20], deduped);
  assert.equal(out.length, 2, 'rescue must re-keep the 20:00 show');
});

test('rescueRealShows: does NOT rescue when hours differ by less than 2h', () => {
  const base = Date.parse('2026-08-22T20:45:00+02:00');
  const going = cand({ source: ProviderId.GOING, externalId: 'g', title: 'Koncert Przy Świecach', startMs: base, venue: 'Sala Koncertowa Fryderyk' });
  const kup = cand({ source: ProviderId.KUPBILECIK, externalId: 'k', title: 'Koncert Przy Świecach', startMs: base + 15 * 60_000, venue: 'Sala Koncertowa Fryderyk' });
  const out = rescueRealShows([going, kup], dedupe([going, kup]));
  assert.equal(out.length, 1, '15min apart is one event');
});

test('rescueRealShows: keeps two real going shows of the same title+venue, >=2h apart', () => {
  const base = Date.parse('2026-08-22T17:00:00+02:00');
  const a = cand({ source: ProviderId.GOING, externalId: 'g-17', title: 'SKOLIM', startMs: base, venue: 'Amfiteatr' });
  const b = cand({ source: ProviderId.GOING, externalId: 'g-20', title: 'SKOLIM', startMs: base + 3 * 3_600_000, venue: 'Amfiteatr' });
  const out = rescueRealShows([a, b], dedupe([a, b]));
  assert.equal(out.length, 2, 'two going shows of the same day are both real');
});

test('rescueRealShows: cross-source (kupbilecik + going) with different hours is a duplicate, NOT rescued', () => {
  const kup17 = cand({ source: ProviderId.KUPBILECIK, externalId: 'kup-17', title: 'SKOLIM', startMs: Date.parse('2026-08-22T17:00:00+02:00'), venue: 'Amfiteatr' });
  const going20 = cand({ source: ProviderId.GOING, externalId: 'going-20', title: 'SKOLIM', startMs: Date.parse('2026-08-22T20:00:00+02:00'), venue: 'Amfiteatr' });
  const out = rescueRealShows([kup17, going20], dedupe([kup17, going20]));
  assert.equal(out.length, 1, 'two companies with different hours = one event we cannot split');
  assert.equal(out[0].externalId, 'going-20', 'going (higher priority) stays canonical');
});

test('rescueRealShows: gap of exactly 2h is rescued, 1h59m is not', () => {
  const base = Date.parse('2026-08-22T17:00:00+02:00');
  const exactly2h = [
    cand({ source: ProviderId.KUPBILECIK, externalId: 'k-a', title: 'SKOLIM', startMs: base, venue: 'Amfiteatr' }),
    cand({ source: ProviderId.KUPBILECIK, externalId: 'k-b', title: 'SKOLIM', startMs: base + 2 * 3_600_000, venue: 'Amfiteatr' }),
  ];
  assert.equal(rescueRealShows(exactly2h, dedupe(exactly2h)).length, 2, 'exactly 2h apart = two shows');

  const justUnder = [
    cand({ source: ProviderId.KUPBILECIK, externalId: 'k-a', title: 'SKOLIM', startMs: base, venue: 'Amfiteatr' }),
    cand({ source: ProviderId.KUPBILECIK, externalId: 'k-b', title: 'SKOLIM', startMs: base + 2 * 3_600_000 - 60_000, venue: 'Amfiteatr' }),
  ];
  assert.equal(rescueRealShows(justUnder, dedupe(justUnder)).length, 1, 'under 2h = one event');
});

test('isCancelled: drops PL/EN variants, keeps normal titles', () => {
  assert.ok(isCancelled('*CANCELLED* Missio'));
  assert.ok(isCancelled('Koncert odwołany'));
  assert.ok(isCancelled('Odwołane wydarzenie'));
  assert.ok(isCancelled('Anulowany pokaz'));
  assert.ok(isCancelled('cancelled: XXX'));
  assert.ok(!isCancelled('Koncert przy świecach'));
  assert.ok(!isCancelled('Przeniesiony na inny termin'));
});

test('rescueRealShows: does NOT rescue aggregator sources (dzisapp)', () => {
  const a = cand({ source: ProviderId.DZISAPP, externalId: 'd-1', title: 'SKOLIM', startMs: Date.parse('2026-08-22T17:00:00+02:00'), venue: 'Amfiteatr' });
  const b = cand({ source: ProviderId.DZISAPP, externalId: 'd-2', title: 'SKOLIM', startMs: Date.parse('2026-08-22T20:00:00+02:00'), venue: 'Amfiteatr' });
  const out = rescueRealShows([a, b], dedupe([a, b]));
  assert.equal(out.length, 1, 'only kupbilecik/going get rescued');
});

test('rescueRealShows: does NOT rescue the same event page (identical link)', () => {
  const a = cand({ source: ProviderId.KUPBILECIK, externalId: 'k-1', title: 'SKOLIM', startMs: Date.parse('2026-08-22T17:00:00+02:00'), venue: 'Amfiteatr', link: 'https://kupbilecik.pl/x' });
  const b = cand({ source: ProviderId.KUPBILECIK, externalId: 'k-2', title: 'SKOLIM', startMs: Date.parse('2026-08-22T20:00:00+02:00'), venue: 'Amfiteatr', link: 'https://kupbilecik.pl/x' });
  const out = rescueRealShows([a, b], dedupe([a, b]));
  assert.equal(out.length, 1, 'same link means one event');
});
