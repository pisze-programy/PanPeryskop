// Nominatim query building (core/geo.ts) — pure, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geoQueryCandidates } from '../src/seed/core/geo';

test('geoQueryCandidates: strips "ul."/"ulica" street prefixes that break Nominatim', () => {
  assert.deepEqual(
    geoQueryCandidates('', 'ul. Ratajczaka 18, 61-815 Poznan', 'Poznan'),
    ['Ratajczaka 18, 61-815 Poznan, Poznan'],
  );
  assert.deepEqual(
    geoQueryCandidates('', 'ulica Jana Baptysty Quadro, 61-772 Poznań', 'Poznań'),
    ['Jana Baptysty Quadro, 61-772 Poznań, Poznań'],
  );
});

test('geoQueryCandidates: replaces "|" separators and drops the venue when an address exists', () => {
  const c = geoQueryCandidates('Międzynarodowe Targi Poznańskie | Hala nr 1A', 'Głogowska 18', 'Poznań');
  assert.deepEqual(c, [
    'Międzynarodowe Targi Poznańskie, Hala nr 1A, Głogowska 18, Poznań',
    'Głogowska 18, Poznań',
  ]);
});

test('geoQueryCandidates: venue-only has no address retry (no city-center false positives)', () => {
  assert.deepEqual(geoQueryCandidates('Cooliozum', '', 'Poznań'), ['Cooliozum, Poznań']);
});

test('geoQueryCandidates: aleja/osiedle prefixes are kept (they resolve fine) and deduped', () => {
  assert.deepEqual(
    geoQueryCandidates('', 'aleja Pod Lipami 108A, 61-638 Poznan', ''),
    ['Pod Lipami 108A, 61-638 Poznan'],
  );
  assert.deepEqual(geoQueryCandidates('', 'Stefana Batorego 101, 60-687 Poznań', 'Poznań'), [
    'Stefana Batorego 101, 60-687 Poznań, Poznań',
  ]);
});

test('geoQueryCandidates: nothing to resolve -> empty', () => {
  assert.deepEqual(geoQueryCandidates('', '', ''), []);
});
