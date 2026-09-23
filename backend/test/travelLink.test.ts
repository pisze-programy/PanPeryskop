import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLink, sanitizeManifest } from '../src/travel/store';
import type { TravelEvent, TravelManifest } from '../src/travel/store';

test('normalizeLink: a doubly-prefixed website collapses to one scheme', () => {
  assert.equal(normalizeLink('http://Http://www.trailribeirasacra.es'), 'https://www.trailribeirasacra.es');
});

test('normalizeLink: a plain address gets https', () => {
  assert.equal(normalizeLink('www.example.com/race'), 'https://www.example.com/race');
  assert.equal(normalizeLink('example.com'), 'https://example.com');
});

test('normalizeLink: an existing scheme is kept, case-insensitively', () => {
  assert.equal(normalizeLink('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(normalizeLink('HTTPS://example.com'), 'https://example.com');
});

test('normalizeLink: a missing or unusable value is null', () => {
  assert.equal(normalizeLink(null), null);
  assert.equal(normalizeLink(undefined), null);
  assert.equal(normalizeLink(''), null);
  assert.equal(normalizeLink('   '), null);
  assert.equal(normalizeLink('not a url'), null);
  assert.equal(normalizeLink('http://'), null);
});

function event(link: string | null): TravelEvent {
  return {
    provider: 'worldsmarathons',
    externalId: 'trail-ribeira-sacra',
    title: 'Trail Ribeira Sacra',
    lat: 42.5,
    lng: -7.5,
    city: 'Santiago',
    country: 'Spain',
    startMs: 1_800_000_000_000,
    tag: 'biegi',
    link,
    meta: null,
  };
}

test('sanitizeManifest: a malformed provider link is repaired on the way in', () => {
  const manifest: TravelManifest = {
    provider: 'worldsmarathons',
    runType: 'backfill',
    days: ['2026-09-23'],
    events: [event('http://Http://www.trailribeirasacra.es')],
  };
  const [clean] = sanitizeManifest(manifest);
  assert.equal(clean.link, 'https://www.trailribeirasacra.es');
});
