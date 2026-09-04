import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBlockedBody,
  parseFeedJson,
  SourceBlockedError,
  SourceEmptyError,
  SourceShapeError,
} from '../src/seed/core/fetchOnce';

// Exact bodies seen in production on 2026-09-02/03.
const KUP_BLOCK =
  'Usługa została zablokowana na 24h, ze względu na zbyt dużą częstotliwość odpytań!';
const TD_QUOTA = '{"code":"429","message":"Request Quota exceeded. Feed has not been updated recently"}';

const isKup = (v: unknown): v is { events: unknown[] } =>
  !!v && typeof v === 'object' && Array.isArray((v as { events: unknown }).events);
const isEbilet = (v: unknown): v is { products: unknown[] } =>
  !!v && typeof v === 'object' && Array.isArray((v as { products: unknown }).products);

test('detectBlockedBody: catches the kupbilecik 24h block (HTTP 200 trap)', () => {
  assert.ok(detectBlockedBody(KUP_BLOCK), 'exact block text must match');
  assert.ok(detectBlockedBody('usługa została ZABLOKOWANA na 24h'), 'case-insensitive');
});

test('detectBlockedBody: catches the TradeDoubler quota JSON', () => {
  assert.ok(detectBlockedBody(TD_QUOTA));
});

test('detectBlockedBody: real data passes', () => {
  assert.equal(detectBlockedBody('{"events":[{"Id":1}]}'), null);
  assert.equal(detectBlockedBody(''), null, 'empty is a different error, not a block');
});

test('parseFeedJson: block body throws SourceBlockedError, never data', () => {
  assert.throws(() => parseFeedJson(KUP_BLOCK, 'kupbilecik', isKup), SourceBlockedError);
  assert.throws(() => parseFeedJson(TD_QUOTA, 'ebilet', isEbilet), SourceBlockedError);
});

test('parseFeedJson: empty body throws SourceEmptyError', () => {
  assert.throws(() => parseFeedJson('', 'kupbilecik', isKup), SourceEmptyError);
  assert.throws(() => parseFeedJson('   ', 'kupbilecik', isKup), SourceEmptyError);
});

test('parseFeedJson: garbage and wrong shape throw SourceShapeError', () => {
  assert.throws(() => parseFeedJson('<html>nope</html>', 'kupbilecik', isKup), SourceShapeError);
  assert.throws(() => parseFeedJson('{"events":[]}', 'ebilet', isEbilet), SourceShapeError);
  assert.throws(() => parseFeedJson('{"products":[]}', 'kupbilecik', isKup), SourceShapeError);
});

test('parseFeedJson: valid bodies parse', () => {
  const kup = parseFeedJson('{"events":[{"Id":185922}]}', 'kupbilecik', isKup);
  assert.equal(kup.events.length, 1);
  const eb = parseFeedJson('{"products":[{"name":"X"}]}', 'ebilet', isEbilet);
  assert.equal(eb.products.length, 1);
});
