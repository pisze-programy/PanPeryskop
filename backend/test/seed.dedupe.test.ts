import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupe, buildDescription, todayWarsaw, tomorrowWarsaw, warsawMidnightMs, toWarsawIso } from '../src/seed';
import { ProviderId } from '../src/seed/core/types';

function cand(over: Partial<{ source: ProviderId; externalId: string; title: string; startMs: number; venue: string; address: string; city: string; link: string }>) {
  const externalId = over.externalId ?? 'x-1';
  return {
    source: over.source ?? ProviderId.GOING,
    externalId,
    title: over.title ?? 'Event',
    startMs: over.startMs ?? 1_782_765_000_000, // 2026-08-14T18:30:00Z
    lat: 52.2, lng: 21.0,
    city: over.city ?? 'Warszawa',
    venue: over.venue ?? 'Venue',
    address: over.address ?? 'ul. Testowa 1, 00-001',
    link: over.link ?? `https://example.com/${externalId}`,
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
  // Priority: going > kupbilecik > dzisapp > eventylive.
  const out1 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.DZISAPP, 'd'), mk(ProviderId.GOING, 'g')]);
  assert.equal(out1.length, 1);
  assert.equal(out1[0].externalId, 'g');
  // Same result when going comes last in input.
  const out2 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.GOING, 'g'), mk(ProviderId.DZISAPP, 'd')]);
  assert.equal(out2[0].externalId, 'g');
  // kupbilecik beats dzisapp when going is absent.
  const out3 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.DZISAPP, 'd')]);
  assert.equal(out3[0].externalId, 'k');
  // kupbilecik beats eventylive.
  const out4 = dedupe([mk(ProviderId.KUPBILECIK, 'k'), mk(ProviderId.EVENTYLIVE, 'e')]);
  assert.equal(out4[0].externalId, 'k');
});

test('dedupe: unknown source keeps the already-seen candidate', () => {
  const mk = (source: ProviderId, ext: string) => cand({ source, externalId: ext, title: 'Koncert', startMs: 1_782_765_000_000, venue: 'Venue' });
  const out = dedupe([mk('future-provider', 'f'), mk(ProviderId.GOING, 'g')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'g', 'known source must win over unknown');
});

test('dedupe: same day, same title+venue, different hours -> merged (earliest wins)', () => {
  const a = cand({ externalId: 'a', startMs: 1_782_765_000_000 });
  const b = cand({ externalId: 'b', startMs: 1_782_765_000_000 + 3_600_000 });
  const out = dedupe([a, b]);
  assert.equal(out.length, 1, 'same event at a different hour in the same day must merge');
  assert.equal(out[0].externalId, 'a', 'earlier hour must become canonical');
});

test('dedupe: identical link is a duplicate even with different venue/geo (TBA venue)', () => {
  const going = cand({
    source: ProviderId.GOING, externalId: 'going-1', title: 'INTERNET IRL: KEJTER',
    venue: 'Poznań - różne lokalizacje', link: 'https://goingapp.pl/wydarzenie/internet-irl/poznan',
  });
  const dzis = cand({
    source: ProviderId.DZISAPP, externalId: 'dzis-1', title: 'Internet Irl: Kejter',
    venue: '3ecia Strona Baru', link: 'https://goingapp.pl/wydarzenie/internet-irl/poznan',
  });
  const out = dedupe([going, dzis]);
  assert.equal(out.length, 1);
  assert.equal(out[0].externalId, 'going-1');
});

test('dedupe: identical link but distinct known venues -> NOT merged (cinema-city per-film link)', () => {
  const a = cand({
    source: ProviderId.CINEMACITY, externalId: 'a', title: 'Psi patrol i dinozaury',
    venue: 'Cinema City Bytom, pl. T. Kościuszki 1', link: 'https://www.cinema-city.pl/filmy/psi-patrol-i-dinozaury/8093d2r',
  });
  const b = cand({
    source: ProviderId.CINEMACITY, externalId: 'b', title: 'Psi patrol i dinozaury',
    venue: 'Cinema City Elbląg, ul. Teatralna 5', link: 'https://www.cinema-city.pl/filmy/psi-patrol-i-dinozaury/8093d2r',
  });
  const out = dedupe([a, b]);
  assert.equal(out.length, 2, 'same film at different cinemas stays separate');
});

test('dedupe: PL/UA versions of the same film are BOTH kept (cinema shows everything)', () => {
  const t = Date.parse('2026-08-22T18:30:00+02:00');
  const pl = cand({
    source: ProviderId.MULTIKINO, externalId: 'pl', title: 'Spider-Man: Całkiem nowy dzień',
    startMs: t, venue: 'Multikino Katowice, ul. 3 Maja 30',
    link: 'https://www.multikino.pl/repertuar/katowice/filmy/spider-man-calkiem-nowy-dzien',
  });
  const ua = cand({
    source: ProviderId.MULTIKINO, externalId: 'ua', title: 'ЛЮДИНА-ПАВУК: АБСОЛЮТНО НОВИЙ ДЕНЬ',
    startMs: t - 3_600_000, venue: 'Multikino Katowice, ul. 3 Maja 30',
    link: 'https://www.multikino.pl/repertuar/katowice/filmy/spider-man-calkiem-nowy-dzien-ukrainian-dubbing',
  });
  assert.equal(dedupe([pl, ua]).length, 2, 'language versions of a cinema film both stay');
});

test('dedupe: same film slug at different cinemas -> NOT merged', () => {
  const a = cand({
    source: ProviderId.MULTIKINO, externalId: 'a', title: 'Odyseja',
    venue: 'Multikino Katowice, ul. 3 Maja 30',
    link: 'https://www.multikino.pl/repertuar/katowice/filmy/odyseja',
  });
  const b = cand({
    source: ProviderId.MULTIKINO, externalId: 'b', title: 'Odyseja',
    venue: 'Multikino Wrocław Pasaż Grunwaldzki, pl. Grunwaldzki 22',
    link: 'https://www.multikino.pl/repertuar/wroclaw-pasaz-grunwaldzki/filmy/odyseja',
  });
  assert.equal(dedupe([a, b]).length, 2);
});

test('dedupe: Ukrainian-dubbing variant stays separate (cinema shows everything)', () => {
  const a = cand({ source: ProviderId.CINEMACITY, externalId: 'a', title: 'Koniec ulicy Dębowej', venue: 'Cinema City Kraków - Bonarka' });
  const b = cand({ source: ProviderId.CINEMACITY, externalId: 'b', title: 'Koniec ulicy Dębowej ukraiński dubbing', venue: 'Cinema City Kraków - Bonarka' });
  assert.equal(dedupe([a, b]).length, 2);
});

test('dedupe: two cinemas with similar short venue names never merge (Kielce vs Katowice)', () => {
  const a = cand({
    source: ProviderId.MULTIKINO, externalId: 'a', title: 'Odyseja',
    venue: 'Multikino Kielce', link: 'https://www.multikino.pl/repertuar/kielce/filmy/odyseja',
  });
  const b = cand({
    source: ProviderId.MULTIKINO, externalId: 'b', title: 'Odyseja',
    venue: 'Multikino Katowice', link: 'https://www.multikino.pl/repertuar/katowice/filmy/odyseja',
  });
  assert.equal(dedupe([a, b]).length, 2, '0.82 venue ratio must not collapse two cinemas');
});

test('dedupe: Obsesja and Odyseja are different films -> stay separate', () => {
  const a = cand({ source: ProviderId.MULTIKINO, externalId: 'a', title: 'Obsesja', venue: 'Multikino Katowice' });
  const b = cand({ source: ProviderId.MULTIKINO, externalId: 'b', title: 'Odyseja', venue: 'Multikino Katowice' });
  assert.equal(dedupe([a, b]).length, 2);
});

test('dedupe: same special event at different cinemas -> NOT merged (per-cinema)', () => {
  const mk = (ext: string, venue: string) => cand({
    source: ProviderId.DZISAPP, externalId: ext,
    title: 'André Rieu. Niech żyje Maastricht! – Retransmisja letniego koncertu z Maastricht',
    venue,
  });
  const apollo = mk('a', 'Kinoteatr Apollo, ul. Głogowska 14');
  const multikino = mk('b', 'Multikino Poznań Stary Browar, ul. Półwiejska 42');
  assert.equal(dedupe([apollo, multikino]).length, 2);
});

test('dedupe: same title+venue on a DIFFERENT day -> NOT merged', () => {
  const a = cand({ externalId: 'a', title: 'Koncert X', startMs: Date.parse('2026-08-21T18:30:00+02:00'), venue: 'Sala A' });
  const b = cand({ externalId: 'b', title: 'Koncert X', startMs: Date.parse('2026-08-22T18:30:00+02:00'), venue: 'Sala A' });
  assert.equal(dedupe([a, b]).length, 2, 'each day is its own event');
});

test('dedupe: festival prefix + different film slug -> NOT merged (NMF guard)', () => {
  const a = cand({
    source: ProviderId.MULTIKINO, externalId: 'a', title: 'NMF: Noc Władcy Pierścieni (wersje rozszerzone)',
    venue: 'Multikino Katowice', link: 'https://www.multikino.pl/repertuar/katowice/filmy/noc-wladcy-pierscieni-wersje-rozszerzone',
  });
  const b = cand({
    source: ProviderId.MULTIKINO, externalId: 'b', title: 'Noc Władcy Pierścieni',
    venue: 'Multikino Katowice', link: 'https://www.multikino.pl/repertuar/katowice/filmy/noc-wladcy-pierscieni',
  });
  assert.equal(dedupe([a, b]).length, 2, 'containment alone must not merge two different films');
});

test('dedupe: fuzzy venue (>=0.8) merges cross-provider theater spellings', () => {
  const going = cand({
    source: ProviderId.GOING, externalId: 'g', title: 'Boeing Boeing',
    venue: 'Teatr Capitol, ul. Marszałkowska 115', lat: 52.230, lng: 21.012,
  });
  const evl = cand({
    source: ProviderId.EVENTYLIVE, externalId: 'e', title: 'Boeing Boeing - Teatr Capitol',
    venue: 'Teatr Capitol w Warszawie, Marszałkowska 115', lat: 52.230, lng: 21.012,
  });
  const out = dedupe([going, evl]);
  assert.equal(out.length, 1, 'same theater under two spellings is one event');
  assert.equal(out[0].externalId, 'g');
});

test('dedupe: geo fallback merges when one venue is TBA and geo is close', () => {
  const a = cand({ externalId: 'a', title: 'Event', venue: 'Poznań - różne lokalizacje', lat: 52.408, lng: 16.938 });
  const b = cand({ externalId: 'b', title: 'Event', venue: '3ecia Strona Baru', lat: 52.4081, lng: 16.9378 });
  assert.equal(dedupe([a, b]).length, 1, 'TBA venue + <1.5km geo = same event');
});

test('dedupe: two known venues stay separate even when geo is close (no geo fallback)', () => {
  const a = cand({ externalId: 'a', title: 'Event', venue: 'Kino Rialto', lat: 52.406, lng: 16.925 });
  const b = cand({ externalId: 'b', title: 'Event', venue: 'Multikino Stary Browar', lat: 52.403, lng: 16.931 });
  assert.equal(dedupe([a, b]).length, 2, 'known venues never fall back to geo');
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

test('dedupe: cinema providers are never deduped — a going listing of the same film stays too', () => {
  const mk = (source: ProviderId, ext: string, title: string, startMs: number, venue: string) => ({
    source, externalId: ext, title, startMs, lat: 52.4, lng: 16.9, city: 'Warszawa',
    venue, address: '', link: '', mediaUrl: '', thumbUrl: null,
  });
  const t = Date.parse('2026-08-22T18:30:00+02:00');
  const mk2 = mk(ProviderId.MULTIKINO, 'mk-1', 'Spider-Man: Całkiem nowy dzień', t, 'Multikino Warszawa Złote Tarasy');
  const going = mk(ProviderId.GOING, 'going-1', 'Spider-Man: Całkiem nowy dzień', t, 'Multikino Warszawa Złote Tarasy');
  const out = dedupe([going, mk2]);
  assert.equal(out.length, 2, 'cinema is exempt from dedupe — both the cinema and the going copy stay');
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
