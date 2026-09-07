import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGoingLanding,
  goingSlugKey,
  goingLandingParts,
  buildGoingTdMap,
  type GoingTdProduct,
} from '../src/seed/core/goingTd';

const CLICK = (sid: string, landing: string) =>
  `https://pdt.tradedoubler.com/click?a(3495754)p(320696)product(46830-${sid})ttid(3)url(${encodeURIComponent(landing)})`;

function product(over: Partial<GoingTdProduct>): GoingTdProduct {
  return { productUrl: CLICK('1', 'https://goingapp.pl/wydarzenie/koncert/sylwester'), ...over };
}

test('extractGoingLanding: decodes the url(...) param and falls back to raw on bad encoding', () => {
  assert.equal(
    extractGoingLanding(CLICK('1', 'https://goingapp.pl/wydarzenie/koncert/sylwester')),
    'https://goingapp.pl/wydarzenie/koncert/sylwester',
  );
  assert.equal(extractGoingLanding('https://pdt.tradedoubler.com/click?url(%C4%85%C5%BC)'), 'ąż');
  assert.equal(extractGoingLanding('https://pdt.tradedoubler.com/click?url(not-encoded)'), 'not-encoded');
  assert.equal(extractGoingLanding('https://pdt.tradedoubler.com/click?a(1)'), null);
});

test('goingSlugKey: case- and trailing-slash-insensitive', () => {
  assert.equal(goingSlugKey('Koncert', 'Sylwester/'), 'koncert/sylwester');
  assert.equal(goingSlugKey('koncert', 'sylwester'), 'koncert/sylwester');
  assert.equal(goingSlugKey('/koncert', 'sylwester'), 'koncert/sylwester');
});

test('goingLandingParts: parses /wydarzenie/<ev>/<rd>, tolerates trailing slash, rejects others', () => {
  assert.deepEqual(goingLandingParts('https://goingapp.pl/wydarzenie/koncert/sylwester'), {
    eventSlug: 'koncert',
    rundateSlug: 'sylwester',
    key: 'koncert/sylwester',
  });
  assert.deepEqual(goingLandingParts('https://goingapp.pl/wydarzenie/koncert/sylwester/'), {
    eventSlug: 'koncert',
    rundateSlug: 'sylwester',
    key: 'koncert/sylwester',
  });
  assert.equal(goingLandingParts('https://goingapp.pl/wydarzenie/koncert'), null);
  assert.equal(goingLandingParts('https://goingapp.pl/nie-wydarzenie/koncert/sylwester'), null);
  assert.equal(goingLandingParts('not-a-url'), null);
});

test('buildGoingTdMap: matches slug pairs, drops ambiguous duplicates', () => {
  const { map, stats } = buildGoingTdMap([
    product({ productUrl: CLICK('10', 'https://goingapp.pl/wydarzenie/koncert/sylwester') }),
    // same slug pair — "kopia" rundate → ambiguous → dropped
    product({ productUrl: CLICK('11', 'https://goingapp.pl/wydarzenie/koncert/sylwester') }),
    product({ productUrl: CLICK('12', 'https://goingapp.pl/wydarzenie/teatr/hamlet/') }),
    // not a goingapp landing → ignored
    product({ productUrl: 'https://pdt.tradedoubler.com/click?a(1)url(https%3A%2F%2Felsewhere.pl%2Fx)' }),
  ]) as { map: Record<string, string>; stats: { matched: number; ambiguous: number; products: number } };
  assert.equal(stats.products, 4);
  assert.equal(stats.matched, 1);
  assert.equal(stats.ambiguous, 1);
  assert.equal(map['teatr/hamlet'], CLICK('12', 'https://goingapp.pl/wydarzenie/teatr/hamlet/'));
  assert.ok(!('koncert/sylwester' in map));
});

test('buildGoingTdMap: prefers offers[0].productUrl over productUrl', () => {
  const { map } = buildGoingTdMap([
    {
      productUrl: CLICK('1', 'https://goingapp.pl/wydarzenie/a/b'),
      offers: [{ productUrl: CLICK('1', 'https://goingapp.pl/wydarzenie/c/d') }],
    },
  ]);
  assert.equal(map['c/d'], CLICK('1', 'https://goingapp.pl/wydarzenie/c/d'));
});