import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leagueName } from '../src/travel/espn';
import { isAirportGeo } from '../src/api/travel';

test('leagueName: reads the league id out of the ESPN event uid', () => {
  assert.equal(leagueName('s:600~l:775~e:401915444'), 'UEFA Champions League');
  assert.equal(leagueName('s:600~l:700~e:1'), 'English Premier League');
});

test('leagueName: missing or unknown ids stay null', () => {
  assert.equal(leagueName(undefined), null);
  assert.equal(leagueName('s:600~e:1'), null);
  assert.equal(leagueName('s:600~l:999999~e:1'), null);
});

test('isAirportGeo: exact airport coordinates mark the venue as guessed', () => {
  // STR sits 11 km from MHPArena; a fallback row copies the airport coordinates.
  assert.equal(isAirportGeo('pilka-nozna', 'Stuttgart', 48.69, 9.2219444), true);
  assert.equal(isAirportGeo('pilka-nozna', 'Stuttgart', 48.7922, 9.2321), false);
});

test('isAirportGeo: only the soccer tag can be airport-geocoded', () => {
  assert.equal(isAirportGeo('biegi', 'Stuttgart', 48.69, 9.2219444), false);
});
