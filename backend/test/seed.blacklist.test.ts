import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blacklistMatch, blacklistReason, findBlacklist, ruleFromRow, type BlacklistRule,
} from '../src/seed/core/blacklist';

const rule = (r: Partial<BlacklistRule>): BlacklistRule => ({
  id: 'r', pattern: '', venue: '', partnerId: '', partnerName: '', sources: '', matchMode: 'fuzzy', active: true, ...r,
});

// Real spam families (goingapp data, 2026-07..09 window).
test('blacklist: R1 — Koncert Chopinowski + Agencja Presto (2107)', () => {
  const r1 = rule({ pattern: 'Koncert Chopinowski W Najpiękniejszej Sali Koncertowej Fryderyk', partnerId: '2107', partnerName: 'Agencja Presto' });
  // Original + the 12 "kopia" copies are all caught.
  assert.equal(blacklistMatch(r1, { title: 'Koncert Chopinowski W Najpiękniejszej Sali Koncertowej Fryderyk', venue: 'Sala Koncertowa Fryderyk', partnerId: '2107' }), true);
  assert.equal(blacklistMatch(r1, { title: 'Koncert Chopinowski W Najpiękniejszej Sali Koncertowej Fryderyk - kopia', venue: 'Sala Koncertowa Fryderyk', partnerId: '2107' }), true);
  // Different organizer ("Chopin był z UW!" is Fundacja Universitatis Varsoviensis 2090) survives.
  assert.equal(blacklistMatch(r1, { title: 'Koncert Chopinowski W Najpiękniejszej Sali Koncertowej Fryderyk', venue: 'Sala Koncertowa Fryderyk', partnerId: '2090' }), false);
  assert.equal(blacklistMatch(r1, { title: 'Chopin był z UW!', venue: 'Uniwersytet Warszawski', partnerId: '2090' }), false);
  // No organizer on the candidate -> no match (rule requires the organizer).
  assert.equal(blacklistMatch(r1, { title: 'Koncert Chopinowski W Najpiękniejszej Sali Koncertowej Fryderyk', venue: 'Sala Koncertowa Fryderyk', partnerId: null }), false);
});

test('blacklist: R2 — przy świecach, per-organizer', () => {
  // Organizer-scoped rule only catches that organizer's events.
  const rPestka = rule({ pattern: 'przy świecach', partnerId: '4725', partnerName: 'FUNDACJA PESTKA' });
  assert.equal(blacklistMatch(rPestka, { title: 'Koncert przy świecach – ¡Viva España! – hiszpańska noc przy świecach', venue: 'Sala Biała', partnerId: '4725' }), true);
  // Same title but Agencja Presto (Fryderyk) — different organizer, survives this rule.
  assert.equal(blacklistMatch(rPestka, { title: 'Koncert Przy Świecach', venue: 'Sala Koncertowa Fryderyk', partnerId: '2107' }), false);
  // The genre rule WITHOUT a partner catches the whole family (user decision: all gone).
  const rGenre = rule({ pattern: 'przy świecach' });
  assert.equal(blacklistMatch(rGenre, { title: 'Koncert Przy Świecach  - kopia', venue: 'Sala Koncertowa Fryderyk', partnerId: '2107' }), true);
  assert.equal(blacklistMatch(rGenre, { title: 'Cinema Macabre - koncert przy świecach', venue: 'Filharmonia Podkarpacka', partnerId: '4464' }), true);
  assert.equal(blacklistMatch(rGenre, { title: 'Koncert Chopinowski W Najpiękniejszej Sali Koncertowej Fryderyk', venue: 'Sala Koncertowa Fryderyk', partnerId: '2107' }), false);
  // Venue constraint keeps the rule precise.
  const rVenue = rule({ pattern: 'przy świecach', venue: 'Sala Koncertowa Fryderyk' });
  assert.equal(blacklistMatch(rVenue, { title: 'Koncert Przy Świecach', venue: 'Sala Koncertowa Fryderyk', partnerId: '2107' }), true);
  assert.equal(blacklistMatch(rVenue, { title: 'Koncert przy świecach – ¡Viva España!', venue: 'Sala Biała', partnerId: '4725' }), false);
});

test('blacklist: R3 — PIJ, JEDZ, MALUJ + B3 Marek Kotiuszko (4535)', () => {
  const r3 = rule({ pattern: 'pij jedz maluj', partnerId: '4535', partnerName: 'B3 MAREK KOTIUSZKO' });
  assert.equal(blacklistMatch(r3, { title: 'PIJ, JEDZ, MALUJ W TORUNIU!', venue: 'Centrum Kulturalno-Kongresowe Jordanki', partnerId: '4535' }), true);
  assert.equal(blacklistMatch(r3, { title: 'PIJ, JEDZ, MALUJ W LUBLINIE!', venue: 'Lubelski Park Naukowo - Technologiczny S.A.', partnerId: '4535' }), true);
  assert.equal(blacklistMatch(r3, { title: 'PIJ, JEDZ, MALUJ W TORUNIU!', venue: 'Centrum Kulturalno-Kongresowe Jordanki', partnerId: '4536' }), false);
});

test('blacklist: empty rule matches nothing; inactive rules are skipped', () => {
  const empty = rule({});
  assert.equal(blacklistMatch(empty, { title: 'cokolwiek', venue: 'gdziekolwiek', partnerId: null }), false);

  const active = rule({ pattern: 'chopinowski', partnerId: '2107' });
  const off = rule({ id: 'off', pattern: 'chopinowski', partnerId: '2107', active: false });
  const hit = { title: 'Koncert Chopinowski W Najpiękniejszej Sali Koncertowej Fryderyk', venue: 'Sala Koncertowa Fryderyk', partnerId: '2107' };
  const found = findBlacklist([off, active], hit);
  assert.equal(found?.id, 'r');
  assert.equal(findBlacklist([off], hit), null);
});

test('blacklist: reason string reflects pattern/organizer', () => {
  assert.equal(blacklistReason({ pattern: 'Koncert Chopinowski', partnerName: 'Agencja Presto' }), 'blacklist: Koncert Chopinowski / Agencja Presto');
  assert.equal(blacklistReason({ pattern: 'przy świecach', partnerName: '' }), 'blacklist: przy świecach');
  assert.equal(blacklistReason({ pattern: '', partnerName: 'Agencja Presto' }), 'blacklist: Agencja Presto');
  assert.equal(blacklistReason({ pattern: '', partnerName: '' }), 'blacklist');
});

test('blacklist: ruleFromRow normalizes null D1 columns to empty strings', () => {
  const r = ruleFromRow({ pattern: 'x', venue: null, partner_id: null, partner_name: 'Presto', sources: null, match_mode: null });
  assert.deepEqual(r, { pattern: 'x', venue: '', partnerId: '', partnerName: 'Presto', sources: '', matchMode: 'fuzzy' });
});

// ---- exact mode -------------------------------------------------------------
// Explicit bans. The fuzzy containment is greedy — a six-token pattern also
// matches a one-token title like "koncert" — so the recurring junk gets a
// concrete entry instead: one exact title, nothing else.

const EXACT_SOURCES = 'kupbilecik,ebilet,eventim,going,ticketmaster';

test('exact: the same title on a listed provider is caught', () => {
  const r = rule({ pattern: 'Koncert Chopinowski', matchMode: 'exact', sources: EXACT_SOURCES });
  assert.equal(blacklistMatch(r, { title: 'Koncert Chopinowski', venue: 'Sala', source: 'ebilet' }), true);
});

test('exact: case and diacritics do not matter', () => {
  const r = rule({ pattern: 'Koncert Przy Świecach', matchMode: 'exact', sources: EXACT_SOURCES });
  assert.equal(blacklistMatch(r, { title: 'KONCERT PRZY SWIECACH', venue: 'Sala', source: 'kupbilecik' }), true);
  assert.equal(blacklistMatch(r, { title: 'koncert przy świecach', venue: 'Sala', source: 'kupbilecik' }), true);
});

test('exact: a longer or shorter title never matches', () => {
  const r = rule({ pattern: 'Koncert Chopinowski', matchMode: 'exact', sources: EXACT_SOURCES });
  assert.equal(blacklistMatch(r, { title: 'Koncert Chopinowski w Sali Koncertowej Fryderyk', venue: 'Sala', source: 'ebilet' }), false);
  assert.equal(blacklistMatch(r, { title: 'Koncert', venue: 'Sala', source: 'ebilet' }), false);
  assert.equal(blacklistMatch(r, { title: 'Recital Chopinowski Jana Widlarza', venue: 'Sala', source: 'ebilet' }), false);
});

test('exact: the source scope still applies', () => {
  const r = rule({ pattern: 'Koncert Chopinowski', matchMode: 'exact', sources: EXACT_SOURCES });
  assert.equal(blacklistMatch(r, { title: 'Koncert Chopinowski', venue: 'Sala', source: 'meetup' }), false);
});

test('fuzzy stays the default when no mode is given', () => {
  const r = rule({ pattern: 'Koncert Chopinowski', sources: EXACT_SOURCES });
  // Containment still fires on a superset title.
  assert.equal(blacklistMatch(r, { title: 'Koncert Chopinowski w Sali Koncertowej Fryderyk', venue: 'Sala', source: 'ebilet' }), true);
});

test('exact: the reason marks the exact mode', () => {
  assert.equal(
    blacklistReason({ pattern: 'Koncert Chopinowski', partnerName: '', sources: 'ebilet', matchMode: 'exact' }),
    'blacklist: Koncert Chopinowski = [ebilet]'
  );
});

// ---- source scope -----------------------------------------------------------
// A partner-scoped rule only ever fired for `going` (the one provider carrying an
// organizer id), so the same recurring junk from ebilet/eventim/kupbilecik was
// unstoppable. A source scope blocks it there and leaves other providers alone.

const CHOPIN = 'Koncert Chopinowski w Sali Koncertowej Fryderyk';
const JUNK_SOURCES = 'kupbilecik,ebilet,eventim,going,ticketmaster';

test('blacklist: a source-scoped rule catches the pattern on the listed providers', () => {
  const r = rule({ pattern: 'Chopinowski', sources: JUNK_SOURCES });
  for (const source of JUNK_SOURCES.split(',')) {
    assert.equal(blacklistMatch(r, { title: CHOPIN, venue: 'Sala Koncertowa Fryderyk', source }), true, source);
  }
});

test('blacklist: a source-scoped rule leaves every other provider alone', () => {
  const r = rule({ pattern: 'Chopinowski', sources: JUNK_SOURCES });
  // The Meetup case: a one-off "Halloween przy świecach" on an unlisted provider survives.
  assert.equal(blacklistMatch(r, { title: 'Halloween przy świecach', venue: 'Klub', source: 'meetup' }), false);
  assert.equal(blacklistMatch(r, { title: CHOPIN, venue: 'Sala Koncertowa Fryderyk', source: 'meetup' }), false);
  assert.equal(blacklistMatch(r, { title: CHOPIN, venue: 'Sala Koncertowa Fryderyk', source: 'luma' }), false);
});

test('blacklist: an empty source scope keeps the old every-provider behaviour', () => {
  const r = rule({ pattern: 'Chopinowski', sources: '' });
  assert.equal(blacklistMatch(r, { title: CHOPIN, venue: 'Sala Koncertowa Fryderyk', source: 'meetup' }), true);
  assert.equal(blacklistMatch(r, { title: CHOPIN, venue: 'Sala Koncertowa Fryderyk', source: null }), true);
});

test('blacklist: source matching is trimmed and case-insensitive', () => {
  const r = rule({ pattern: 'Chopinowski', sources: ' Kupbilecik , eBilet ' });
  assert.equal(blacklistMatch(r, { title: CHOPIN, venue: 'Sala Koncertowa Fryderyk', source: 'kupbilecik' }), true);
  assert.equal(blacklistMatch(r, { title: CHOPIN, venue: 'Sala Koncertowa Fryderyk', source: 'eventim' }), false);
});

test('blacklist: a source-scoped rule still needs the title to match', () => {
  const r = rule({ pattern: 'Chopinowski', sources: JUNK_SOURCES });
  assert.equal(blacklistMatch(r, { title: 'Tenorzy przy świecach', venue: 'Sala', source: 'kupbilecik' }), false);
});

test('blacklist: the reason names the source scope', () => {
  assert.equal(
    blacklistReason({ pattern: 'Chopinowski', partnerName: '', sources: 'kupbilecik,ebilet' }),
    'blacklist: Chopinowski [kupbilecik,ebilet]'
  );
});
