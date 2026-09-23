import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventDescription, buildDescription } from '../src/seed/core/eventFormat';

test('parseEventDescription: the plain "Tytuł: HH:MM, Lokalizacja" form', () => {
  const p = parseEventDescription('Koncert: 19:00, Klub Proxima, Warszawa');
  assert.deepEqual(p, { title: 'Koncert', time: '19:00', loc: 'Klub Proxima, Warszawa' });
});

test('parseEventDescription: a title with its own ": HH:MM, " keeps the whole title', () => {
  // Real case: the title itself contains the separator the formatter wrote, so a
  // first-match split swallows "włoska noc przy świecach" into the title.
  const p = parseEventDescription(
    'Koncert przy świecach – La Notte Italiana: włoska noc przy świecach: 18:00, Kino Wisła, WARSZAWA'
  );
  assert.equal(p?.title, 'Koncert przy świecach – La Notte Italiana: włoska noc przy świecach');
  assert.equal(p?.time, '18:00');
  assert.equal(p?.loc, 'Kino Wisła, WARSZAWA');
});

test('parseEventDescription: a title with a bare colon and no time keeps the text intact', () => {
  const p = parseEventDescription('Koncert: część II: 20:30, Filharmonia');
  assert.equal(p?.title, 'Koncert: część II');
  assert.equal(p?.time, '20:30');
});

test('parseEventDescription: the last separator wins when the title repeats the pattern', () => {
  const p = parseEventDescription('Warsztaty: 10:00, Sala A: 12:00, Sala B');
  assert.equal(p?.title, 'Warsztaty: 10:00, Sala A');
  assert.equal(p?.time, '12:00');
  assert.equal(p?.loc, 'Sala B');
});

test('parseEventDescription: a non-conforming description is null', () => {
  assert.equal(parseEventDescription('opis bez godziny'), null);
  assert.equal(parseEventDescription(''), null);
  assert.equal(parseEventDescription(null), null);
  assert.equal(parseEventDescription(undefined), null);
});

test('buildDescription round-trips through parseEventDescription', () => {
  const desc = buildDescription({
    title: 'Koncert przy świecach – La Notte Italiana: włoska noc',
    startMs: Date.parse('2026-09-26T16:00:00Z'),
    venue: 'Kino Wisła',
    city: 'WARSZAWA',
  } as never);
  const p = parseEventDescription(desc);
  assert.equal(p?.title, 'Koncert przy świecach – La Notte Italiana: włoska noc');
  assert.equal(p?.time, '18:00');
  assert.equal(p?.loc, 'Kino Wisła, WARSZAWA');
});
