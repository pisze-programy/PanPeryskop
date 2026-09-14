import { CONFIG } from '../src/config/index';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWmEvent } from '../src/travel/worldsmarathons';
import { runTravelProvider } from '../src/travel/run';
import { todayWarsaw, addDaysWarsaw, warsawMidnightMs } from '../src/seed/core/dates';

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

test('parseWmEvent: prefers local date/time — UTC would shift the day', () => {
  // CEST midnight: 22:00 UTC on the previous day, 00:00 local on race day.
  const e = parseWmEvent(row({
    dateNextRace: '2026-09-17T22:00:00',
    dateNextRaceLocal: '2026-09-18T00:00:00',
  }), '2026-09-18');
  assert.ok(e);
  // Day is the local one (Sep 18), not the UTC one (Sep 17).
  assert.equal(e!.startMs, warsawMidnightMs('2026-09-18'));
  // 00:00 is a date-only placeholder, not a real start time.
  assert.equal(JSON.parse(e!.meta!).time, null);
});

test('parseWmEvent: keeps a real local start time on startMs', () => {
  const e = parseWmEvent(row({ dateNextRaceLocal: '2026-12-31T09:30:00' }), '2026-12-31');
  assert.ok(e);
  assert.equal(JSON.parse(e!.meta!).time, '09:30');
  assert.equal(e!.startMs, warsawMidnightMs('2026-12-31') + (9 * 60 + 30) * 60_000);
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
  assert.equal(manifest.days.length, CONFIG.travel.replenishDays);
  assert.equal(seen.length, CONFIG.travel.replenishDays);
  assert.equal(manifest.events.length, CONFIG.travel.replenishDays);
});

test('runTravelProvider: near window always refreshed, covered far days skipped', async () => {
  const today = todayWarsaw();
  const covered = new Set<string>();
  for (let i = CONFIG.travel.replenishDays; i < CONFIG.travel.backfillDays; i++) covered.add(addDaysWarsaw(today, i));
  const seen: string[] = [];
  const source = {
    id: 'test',
    fetchDay: async (day: string) => {
      seen.push(day);
      return [];
    },
  };
  const manifest = await runTravelProvider(source, { runType: 'replenish', coveredDays: covered });
  assert.equal(manifest.days.length, CONFIG.travel.replenishDays);
  assert.equal(seen.length, CONFIG.travel.replenishDays);
});