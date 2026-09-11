import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blFold, blTokens, blContain, blSeqRatio, blMatch, findBlacklistRule } from '../src/seed/blacklist.mjs';

// ---------- blFold ----------

test('blFold: lowercases, folds ł→l and strips diacritics (keeps spaces)', () => {
  assert.equal(blFold('ĄĆĘ ŁÓŻ'), 'ace loz');
  assert.equal(blFold('André'), 'andre');
});

test('blFold: null/undefined/empty/falsy → empty string', () => {
  assert.equal(blFold(null), '');
  assert.equal(blFold(undefined), '');
  assert.equal(blFold(''), '');
  assert.equal(blFold(0), ''); // falsy → ''
});

// ---------- blTokens ----------

test('blTokens: drops short tokens and stop words, keeps the rest', () => {
  assert.deepEqual(blTokens('Koncert przy świecach'), ['koncert', 'przy', 'swiecach']);
  // 'w', 'i', 'na', 'z' are stop words / too short.
  assert.deepEqual(blTokens('w i na z dom'), ['dom']);
});

test('blTokens: deduplicates', () => {
  assert.deepEqual(blTokens('dom dom dom'), ['dom']);
});

test('blTokens: empty/null → []', () => {
  assert.deepEqual(blTokens(''), []);
  assert.deepEqual(blTokens(null), []);
});

// ---------- blContain ----------

test('blContain: false when either side is empty', () => {
  assert.equal(blContain([], ['a']), false);
  assert.equal(blContain(['a'], []), false);
});

test('blContain: requires ≥1 shared AND ≥80% of the shorter set', () => {
  assert.equal(blContain(['a', 'b', 'c', 'd'], ['a', 'b', 'c']), true); // 3/3 = 1.0
  assert.equal(blContain(['a', 'b', 'c', 'd'], ['a', 'b', 'x', 'y']), false); // 2/4 = 0.5
  assert.equal(blContain(['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'x', 'y', 'z']), false); // 2/5
});

test('blContain: zero shared → false', () => {
  assert.equal(blContain(['x', 'y'], ['a', 'b', 'c']), false);
});

// ---------- blSeqRatio ----------

test('blSeqRatio: identical → 1; empty-empty → 1; one empty → 0', () => {
  assert.equal(blSeqRatio('Sala Fryderyk', 'Sala Fryderyk'), 1);
  assert.equal(blSeqRatio('', ''), 1);
  assert.equal(blSeqRatio('', 'Sala Fryderyk'), 0);
  assert.equal(blSeqRatio('Sala Fryderyk', ''), 0);
});

test('blSeqRatio: near-identical venue ≥ 0.8, unrelated < 0.8', () => {
  assert.ok(blSeqRatio('Sala Koncertowa Fryderyk', 'Sala Koncertowa Fryderyk') >= 0.8);
  assert.ok(blSeqRatio('Filharmonia Podkarpacka', 'Hala Stulecia') < 0.8);
});

// ---------- blMatch ----------

test('blMatch: empty rule (no pattern, no partner) matches nothing', () => {
  assert.equal(blMatch({ pattern: '', venue: '', partner_id: '' }, { title: 'cokolwiek' }), false);
});

test('blMatch: partner-only rule matches by exact organizer id', () => {
  const rule = { partner_id: '2107' };
  assert.equal(blMatch(rule, { partner_id: '2107' }), true);
  assert.equal(blMatch(rule, { partner_id: '2090' }), false);
  assert.equal(blMatch(rule, { partner_id: null }), false); // '' !== '2107'
});

test('blMatch: pattern-only rule matches by title containment (description fallback)', () => {
  const rule = { pattern: 'przy świecach' };
  assert.equal(blMatch(rule, { title: 'Koncert Przy Świecach - kopia' }), true);
  assert.equal(blMatch(rule, { title: '', description: 'Koncert przy świecach' }), true);
  assert.equal(blMatch(rule, { title: 'Koncert Chopinowski' }), false);
});

test('blMatch: pattern rule also requires venue when a venue is set; false when candidate has none', () => {
  const rule = { pattern: 'przy świecach', venue: 'Sala Koncertowa Fryderyk' };
  assert.equal(blMatch(rule, { title: 'Koncert Przy Świecach', venue: 'Sala Koncertowa Fryderyk' }), true);
  assert.equal(blMatch(rule, { title: 'Koncert Przy Świecach', venue: 'Sala Biała' }), false);
  assert.equal(blMatch(rule, { title: 'Koncert Przy Świecach' }), false); // no venue on candidate
});

test('blMatch: all parts must match (AND semantics)', () => {
  const rule = { pattern: 'Chopinowski', venue: 'Sala Koncertowa Fryderyk', partner_id: '2107' };
  assert.equal(blMatch(rule, { title: 'Koncert Chopinowski', venue: 'Sala Koncertowa Fryderyk', partner_id: '2107' }), true);
  assert.equal(blMatch(rule, { title: 'Koncert Chopinowski', venue: 'Sala Koncertowa Fryderyk', partner_id: '2090' }), false);
});

test('blMatch: pattern rule handles candidate with no title and no description', () => {
  assert.equal(blMatch({ pattern: 'spam' }, { venue: 'Sala' }), false);
});

// ---------- findBlacklistRule ----------

test('findBlacklistRule: returns the first matching rule, null when none', () => {
  const rules = [
    { pattern: 'inny', partner_id: '' },
    { pattern: 'chopinowski', partner_id: '' },
  ];
  const hit = findBlacklistRule(rules, { title: 'Koncert Chopinowski' });
  assert.equal(hit.pattern, 'chopinowski');
  assert.equal(findBlacklistRule(rules, { title: 'Kino' }), null);
});

test('findBlacklistRule: skips null/undefined entries and returns null on empty list', () => {
  assert.equal(findBlacklistRule([null, undefined], { title: 'x' }), null);
  assert.equal(findBlacklistRule([], { title: 'x' }), null);
});