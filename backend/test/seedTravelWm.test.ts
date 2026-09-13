import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWmEvent } from '../src/travel/worldsmarathons';
import { runTravelProvider } from '../src/travel/run';
import { TRAVEL_REPLENISH_DAYS, TRAVEL_BACKFILL_DAYS } from '../src/travel/constants';
import { todayWarsaw, addDaysWarsaw } from '../src/seed/core/dates';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'cursa-dels-nassos-10-km',
  title: 'Cursa dels Nassos 10 km',
  city: 'Barcelona',
  country: 'Spain',
  countryCode: 'ES',
  dateNextRace: '2026-12-31T09:30:00',
  distance: '10 km',
  uniqueDistances: ['10km'],
  surface: 'Road',
  courseDifficulty: 'flat',
  minPriceFormatted: '38 EUR',
  website: 'https://cursadenassos.barcelona/en',
  geoStartPoint: { type: 'Point', coordinates: [2.2059181, 41.4112211] },
  ...over,
});

test('parseWmEvent: maps a European race to a TravelEvent (tag biegi)', () => {
  const e = parseWmEvent(row(), '2026-12-31');
  assert.ok(e);
  assert.equal(e!.provider, 'worldsmarathons');
  assert.equal(e!.externalId, 'cursa-dels-nassos-10-km');
  assert.equal(e!.title, 'Cursa dels Nassos 10 km');
  assert.equal(e!.tag, 'biegi');
  // GeoJSON order is [lng, lat].
  assert.equal(e!.lat, 41.4112211);
  assert.equal(e!.lng, 2.2059181);
  assert.equal(e!.city, 'Barcelona');
  assert.equal(e!.link, 'https://cursadenassos.barcelona/en');
  const meta = JSON.parse(e!.meta!);
  assert.equal(meta.time, '09:30');
  assert.deepEqual(meta.distances, ['10km']);
  assert.equal(meta.surface, 'Road');
});

test('parseWmEvent: skips non-European and un-geocoded rows', () => {
  assert.equal(parseWmEvent(row({ countryCode: 'US', country: 'United States' }), '2026-12-31'), null);
  assert.equal(parseWmEvent(row({ geoStartPoint: undefined }), '2026-12-31'), null);
  assert.equal(parseWmEvent(row({ id: '  ' }), '2026-12-31'), null);
});

test('runTravelProvider: collects a source over the window and dedupes', async () => {
  const seen: string[] = [];
  const source = {
    id: 'test',
    fetchDay: async (day: string) => {
      seen.push(day);
      return [{
        provider: 'test', externalId: `e-${day}`, title: 'Race', lat: 50, lng: 20,
        city: 'X', country: 'Poland', startMs: 0, tag: 'biegi' as const, link: null,
      }];
    },
  };
  const manifest = await runTravelProvider(source, { runType: 'replenish' });
  assert.equal(manifest.provider, 'test');
  assert.equal(manifest.days.length, TRAVEL_REPLENISH_DAYS);
  assert.equal(seen.length, TRAVEL_REPLENISH_DAYS);
  assert.equal(manifest.events.length, TRAVEL_REPLENISH_DAYS);
});

test('runTravelProvider: near window always refreshed, covered far days skipped', async () => {
  const today = todayWarsaw();
  const covered = new Set<string>();
  for (let i = TRAVEL_REPLENISH_DAYS; i < TRAVEL_BACKFILL_DAYS; i++) covered.add(addDaysWarsaw(today, i));
  const seen: string[] = [];
  const source = {
    id: 'test',
    fetchDay: async (day: string) => {
      seen.push(day);
      return [];
    },
  };
  const manifest = await runTravelProvider(source, { runType: 'replenish', coveredDays: covered });
  assert.equal(manifest.days.length, TRAVEL_REPLENISH_DAYS);
  assert.equal(seen.length, TRAVEL_REPLENISH_DAYS);
});