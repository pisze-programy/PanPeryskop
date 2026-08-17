import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupe, buildDescription, todayWarsaw, tomorrowWarsaw, warsawMidnightMs, toWarsawIso } from '../src/seed';
import { ProviderId } from '../src/seed/core/types';

function cand(over: Partial<{ source: ProviderId; externalId: string; title: string; startMs: number; venue: string; address: string; city: string }>) {
  return {
    source: over.source ?? ProviderId.GOING,
    externalId: over.externalId ?? 'x-1',
    title: over.title ?? 'Event',
    startMs: over.startMs ?? 1_782_765_000_000, // 2026-08-14T18:30:00Z
    lat: 52.2, lng: 21.0,
    city: over.city ?? 'Warszawa',
    venue: over.venue ?? 'Venue',
    address: over.address ?? 'ul. Testowa 1, 00-001',
    link: 'https://example.com',
    mediaUrl: 'https://example.com/media.webp',
    thumbUrl: 'https://example.com/media_m.webp',
  };
}

test('dedupe: same hour+venue -> going wins over kupbilecik', () => {
  const kup = cand({ source: ProviderId.KUPBILECIK, externalId: 'kup-1', title: 'Koncert' });
  const going = cand({ source: ProviderId.GOING, externalId: 'going-1', title: 'Koncert' });
  const out = dedupe([kup, going]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'going-1');
});

test('dedupe: canonical source wins regardless of input order', () => {
  const mk = (source: ProviderId, ext: string) => cand({ source, externalId: ext, title: 'Koncert', startMs: 1_782_765_000_000, venue: 'Venue' });
  // going (rank 0) beats dzisapp (rank 1) and kupbilecik (rank 3).
  const out1 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.DZISAPP, 'd'), mk(ProviderId.GOING, 'g')]);
  assert.equal(out1.length, 1);
  assert.equal(out1[0].externalId, 'g');
  // Same result when going comes last in input.
  const out2 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.GOING, 'g'), mk(ProviderId.DZISAPP, 'd')]);
  assert.equal(out2[0].externalId, 'g');
  // dzisapp beats kupbilecik when going is absent.
  const out3 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.DZISAPP, 'd')]);
  assert.equal(out3[0].externalId, 'd');
  // eventylive beats kupbilecik.
  const out4 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.EVENTYLIVE, 'e')]);
  assert.equal(out4[0].externalId, 'e');
});

test('dedupe: unknown source keeps the already-seen candidate', () => {
  const mk = (source: ProviderId, ext: string) => cand({ source, externalId: ext, title: 'Koncert', startMs: 1_782_765_000_000, venue: 'Venue' });
  const out = dedupe([mk('future-provider', 'f'), mk(ProviderId.GOING, 'g')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'g', 'known source must win over unknown');
});

test('dedupe: different hours stay separate', () => {
  const a = cand({ externalId: 'a', startMs: 1_782_765_000_000 });
  const b = cand({ externalId: 'b', startMs: 1_782_765_000_000 + 3_600_000 });
  assert.equal(dedupe([a, b]).length, 2);
});

test('dedupe: all-day eventylive collapses into timed going/dzis duplicate', () => {
  const mk = (source: ProviderId, ext: string, title: string, startMs: number, venue: string) => ({
    source, externalId: ext, title, startMs, lat: 52.4, lng: 16.9, city: 'Poznań',
    venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  });
  const midnight = Date.parse('2026-08-22T00:00:00+02:00');
  const evening = Date.parse('2026-08-22T18:30:00+02:00');
  const evl = mk(ProviderId.EVENTYLIVE, 'evl-1', 'Muzyka z serialu Bridgerton: Koncert przy świecach', midnight, 'Ogród Dendrologiczny Uniwersytetu Przyrodniczego');
  const going = mk(ProviderId.GOING, 'going-1', 'Bridgerton: Koncert przy świecach w plenerze', evening, 'Ogród Dendrologiczny Uniwersytetu Przyrodniczego');
  const out = dedupe([evl, going]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'going-1');
});

test('dedupe: distinct all-day events stay separate', () => {
  const mk = (source: string, ext: string, title: string, startMs: number, venue: string) => ({
    source, externalId: ext, title, startMs, lat: 52.4, lng: 16.9, city: 'Poznań',
    venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  });
  const midnight = Date.parse('2026-08-22T00:00:00+02:00');
  const a = mk(ProviderId.EVENTYLIVE, 'evl-a', 'Wystawa Beksiński', midnight, 'MTP Hala nr 1');
  const b = mk(ProviderId.EVENTYLIVE, 'evl-b', 'K-Pop Party', midnight, 'Klub HAH');
  const out = dedupe([a, b]);
  assert.equal(out.length, 2);
});

test('dedupe: multikino (primary) wins over going for the same film×cinema×hour', () => {
  const mk = (source: ProviderId, ext: string, title: string, startMs: number, venue: string) => ({
    source, externalId: ext, title, startMs, lat: 52.4, lng: 16.9, city: 'Warszawa',
    venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  });
  const t = Date.parse('2026-08-22T18:30:00+02:00');
  const mk2 = mk(ProviderId.MULTIKINO, 'mk-1', 'Spider-Man: Całkiem nowy dzień', t, 'Multikino Warszawa Złote Tarasy');
  const going = mk(ProviderId.GOING, 'going-1', 'Spider-Man: Całkiem nowy dzień', t, 'Multikino Warszawa Złote Tarasy');
  const out = dedupe([going, mk2]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'mk-1');
});

test('dedupe: two distinct films at the same hour in the same cinema stay separate', () => {
  const mk = (source: ProviderId, ext: string, title: string, startMs: number, venue: string) => ({
    source, externalId: ext, title, startMs, lat: 52.4, lng: 16.9, city: 'Warszawa',
    venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  });
  const t = Date.parse('2026-08-22T18:30:00+02:00');
  const a = mk(ProviderId.MULTIKINO, 'mk-a', 'Spider-Man: Całkiem nowy dzień', t, 'Multikino Warszawa Złote Tarasy');
  const b = mk(ProviderId.MULTIKINO, 'mk-b', 'Superman: Dziedzictwo', t, 'Multikino Warszawa Złote Tarasy');
  const out = dedupe([a, b]);
  assert.equal(out.length, 2);
});

test('buildDescription: strips postal code, keeps venue + street', () => {
  const c = cand({ title: 'SKOLIM', startMs: 1_782_765_000_000, venue: 'Klub', address: 'ul. Towarowa 39, 00-123' });
  const d = buildDescription(c);
  assert.ok(d.startsWith('SKOLIM: '));
  assert.ok(d.includes('Klub'));
  assert.ok(d.includes('ul. Towarowa 39'));
  assert.ok(!d.includes('00-123'), 'postal code must be stripped');
  assert.ok(d.length <= 130);
});

test('buildDescription: going address format (city, street) keeps street only', () => {
  const c = cand({ venue: 'Klub Schron', address: 'Poznań, Tadeusza Kościuszki 68' });
  const d = buildDescription(c);
  assert.ok(d.includes('Tadeusza Kościuszki 68'));
});

test('warsawMidnightMs: returns 00:00 Europe/Warsaw', () => {
  const ms = warsawMidnightMs('2026-08-15');
  const iso = toWarsawIso(ms);
  assert.ok(iso.startsWith('2026-08-15T00:00:00'), iso);
});

test('tomorrowWarsaw: rolls over month end', () => {
  assert.equal(tomorrowWarsaw('2026-08-31'), '2026-09-01');
  assert.equal(tomorrowWarsaw('2026-12-31'), '2027-01-01');
});

test('todayWarsaw: matches a strict YYYY-MM-DD shape', () => {
  assert.match(todayWarsaw(), /^\d{4}-\d{2}-\d{2}$/);
});
