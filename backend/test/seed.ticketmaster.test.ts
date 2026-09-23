import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTmEvent, tmTag, tmImage, tmStartMs } from '../src/seed/providers/ticketmaster';
import { aggregateDayCandidates } from '../src/seed/core/aggregate';

// 2026-09-23T12:30:00Z is 14:30 in Warsaw — the instant the API reports for PL.
const DAY_MS = Date.parse('2026-09-23T12:30:00Z');

function event(over: Record<string, unknown> = {}) {
  return {
    id: 'Z698xZQpZ16v-YO7fK',
    name: 'Koncert Chopinowski',
    url: 'https://www.ticketmaster.pl/event/koncert-chopinowski-bilety/1870804513',
    images: [
      { ratio: '3_2', url: 'https://img/3_2.jpg', width: 305, height: 203 },
      { ratio: '16_9', url: 'https://img/16_9_small.jpg', width: 640, height: 360 },
      { ratio: '16_9', url: 'https://img/16_9_big.jpg', width: 2048, height: 1152 },
    ],
    dates: {
      start: { dateTime: '2026-09-23T12:30:00Z', localDate: '2026-09-23', localTime: '14:30:00', timeTBA: false, dateTBA: false },
      status: { code: 'onsale' },
    },
    classifications: [{ segment: { name: 'Music' }, genre: { name: 'Classical' }, subGenre: { name: 'Classical/Vocal' } }],
    _embedded: {
      venues: [{
        name: 'Sala koncertowa Fryderyk',
        city: { name: 'Warsaw' },
        address: { line1: 'ul. Podwale 15' },
        postalCode: '00-252',
        location: { latitude: '52.24847', longitude: '21.00998' },
      }],
    },
    ...over,
  } as never;
}

test('parseTmEvent: full mapping (title, time, venue, address, geo, image, link)', () => {
  const [c] = parseTmEvent(event());
  assert.equal(c.source, 'ticketmaster');
  assert.equal(c.externalId, 'ticketmaster-Z698xZQpZ16v-YO7fK');
  assert.equal(c.title, 'Koncert Chopinowski');
  assert.equal(c.startMs, DAY_MS);
  assert.equal(c.venue, 'Sala koncertowa Fryderyk');
  assert.equal(c.city, 'Warsaw');
  assert.equal(c.address, 'ul. Podwale 15, 00-252');
  assert.equal(c.lat, 52.24847);
  assert.equal(c.lng, 21.00998);
  assert.equal(c.mediaUrl, 'https://img/16_9_big.jpg', 'largest 16:9 wins');
  assert.equal(c.link, 'https://www.ticketmaster.pl/event/koncert-chopinowski-bilety/1870804513');
  assert.deepEqual(c.tags, ['muzyka']);
  assert.deepEqual(c.times, ['14:30']);
});

test('parseTmEvent: the provider keeps every day — the window filter is the sink job', () => {
  // A window unit carries candidates for every day of the window; anything
  // outside is dropped later by unitWindowDays, not here.
  const nextWeek = event({ dates: { start: { dateTime: '2026-09-30T12:30:00Z' } } });
  assert.equal(parseTmEvent(nextWeek).length, 1);
});

test('parseTmEvent: no price field exists — the candidate never carries one', () => {
  const [c] = parseTmEvent(event());
  assert.equal(c.price, undefined);
});

test('parseTmEvent: a TBA date produces no candidate', () => {
  assert.equal(parseTmEvent(event({ dates: { start: { dateTBA: true } } })).length, 0);
});

test('parseTmEvent: a missing id or title produces no candidate', () => {
  assert.equal(parseTmEvent(event({ id: '' })).length, 0);
  assert.equal(parseTmEvent(event({ name: '' })).length, 0);
});

test('parseTmEvent: a venue without coordinates yields null geo, not zero', () => {
  const noGeo = event({ _embedded: { venues: [{ name: 'Klub', city: { name: 'Poznan' } }] } });
  const [c] = parseTmEvent(noGeo);
  assert.equal(c.lat, null);
  assert.equal(c.lng, null);
});

test('parseTmEvent: offsale and cancelled map to isSoldOut', () => {
  const off = event({ dates: { start: { dateTime: '2026-09-23T12:30:00Z' }, status: { code: 'offsale' } } });
  const can = event({ dates: { start: { dateTime: '2026-09-23T12:30:00Z' }, status: { code: 'cancelled' } } });
  assert.equal(parseTmEvent(off)[0].isSoldOut, true);
  assert.equal(parseTmEvent(can)[0].isSoldOut, true);
});

test('tmTag: segment first, genre refines arts', () => {
  assert.equal(tmTag('Music', 'Rock', null), 'muzyka');
  assert.equal(tmTag('Film', null, null), 'filmy');
  assert.equal(tmTag('Sports', null, null), 'inne');
  assert.equal(tmTag('Family', null, null), 'inne');
  assert.equal(tmTag('Arts & Theatre', 'Theatre', null), 'teatr');
  assert.equal(tmTag('Arts & Theatre', 'Comedy', null), 'komedia');
  assert.equal(tmTag(null, null, null), null, 'unknown segment → no tag, never a guess');
});

test('tmImage: 16:9 preferred, else the largest, else null', () => {
  assert.equal(tmImage([{ ratio: '3_2', url: 'a', width: 999 }]), 'a');
  assert.equal(tmImage([{ ratio: '3_2', url: 'a', width: 999 }, { ratio: '16_9', url: 'b', width: 10 }]), 'b');
  assert.equal(tmImage([]), null);
  assert.equal(tmImage(undefined), null);
});

test('tmStartMs: dateTime wins over localDate, TBA yields null', () => {
  assert.equal(tmStartMs({ dates: { start: { dateTime: '2026-09-23T12:30:00Z' } } }), DAY_MS);
  assert.equal(tmStartMs({ dates: { start: { localDate: '2026-09-23', localTime: '14:30:00' } } }), DAY_MS);
  assert.equal(tmStartMs({ dates: { start: { dateTBA: true } } }), null);
  assert.equal(tmStartMs({}), null);
});

test('aggregate: two performances of one event-day-venue collapse into showtimes[]', () => {
  const a = parseTmEvent(event())[0];
  const b = parseTmEvent(event({
    id: 'Z698xZQpZ1kFV-Y--',
    url: 'https://www.ticketmaster.pl/event/koncert-chopinowski-bilety/234870861',
    dates: { start: { dateTime: '2026-09-23T14:00:00Z', localDate: '2026-09-23', localTime: '16:00:00' }, status: { code: 'onsale' } },
  }))[0];
  const out = aggregateDayCandidates([a, b]);
  assert.equal(out.length, 1, 'one post, not two');
  assert.deepEqual(out[0].times, ['14:30', '16:00']);
  assert.equal(out[0].startMs, DAY_MS, 'earliest start stays canonical');
  assert.equal(out[0].externalId, 'ticketmaster-Z698xZQpZ16v-YO7fK');
});
