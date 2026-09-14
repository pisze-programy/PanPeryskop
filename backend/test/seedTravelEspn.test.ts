import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEspnEvent } from '../src/travel/espn';
import { resolveZone, localParts } from '../src/travel/localTime';

const row = (over: Record<string, unknown> = {}) => ({
  id: '401',
  date: '2026-09-20T18:30:00Z',
  links: [],
  competitions: [
    {
      venue: { fullName: 'Emirates Stadium', address: { city: 'London', country: 'England' } },
      competitors: [{ team: { displayName: 'Arsenal' } }, { team: { displayName: 'Chelsea' } }],
    },
  ],
  ...over,
});

test('parseEspnEvent: stores the venue local date and hour', () => {
  const e = parseEspnEvent(row());
  assert.ok(e);
  const meta = JSON.parse(e!.meta!);
  // 18:30 UTC in London (BST, UTC+1) is 19:30 local.
  assert.equal(meta.time, '19:30');
  assert.equal(meta.date, '2026-09-20');
});

test('resolveZone: country zone, city override, unknown', () => {
  assert.equal(resolveZone('Germany', 'Berlin'), 'Europe/Berlin');
  assert.equal(resolveZone('England', 'London'), 'Europe/London');
  assert.equal(resolveZone('Spain', 'Las Palmas'), 'Atlantic/Canary');
  assert.equal(resolveZone('Portugal', 'Funchal'), 'Atlantic/Madeira');
  assert.equal(resolveZone('Nowhere', 'X'), null);
});

test('localParts: converts an instant to the venue wall clock', () => {
  const ms = Date.parse('2026-09-20T18:30:00Z');
  assert.deepEqual(localParts(ms, 'Europe/Lisbon'), { date: '2026-09-20', time: '19:30' });
  assert.deepEqual(localParts(ms, 'Europe/Athens'), { date: '2026-09-20', time: '21:30' });
});
