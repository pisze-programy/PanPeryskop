import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, validateEntry } from '../src/seed/decide.mjs';
import { warsawMidnightMs } from '../src/seed/dates.mjs';

const NOW = Date.parse('2026-08-05T12:00:00Z');
const TTL = 24 * 3_600_000;
const LOOKAHEAD = 366 * 24 * 3_600_000;
const baseCtx = { force: false, now: NOW, ttlMs: TTL, maxLookaheadMs: LOOKAHEAD };
const valid = (extra = {}) => ({ external_id: 'e1', lat: 1, lng: 2, created_at: '2026-08-05', ...extra });

// ---------- decide: status gate ----------

test('decide: status done + no force → skip done', () => {
  assert.deepEqual(decide({ status: 'done', external_id: 'e1' }, baseCtx), { action: 'skip', reason: 'done' });
});

test('decide: status done + force → falls through to upload', () => {
  const d = decide(valid({ status: 'done' }), { ...baseCtx, force: true });
  assert.equal(d.action, 'upload');
});

// ---------- decide: terminal skips ----------

test('decide: blacklist wins and returns the matching rule', () => {
  const ctx = { ...baseCtx, blacklist: [{ pattern: 'Chopinowski', partner_id: '' }] };
  const d = decide({ title: 'Koncert Chopinowski' }, ctx);
  assert.equal(d.action, 'skip');
  assert.equal(d.reason, 'blacklisted');
  assert.equal(d.rule.pattern, 'Chopinowski');
});

test('decide: rejected id → skip rejected (checked before existing)', () => {
  const entry = { external_id: 'going-1' };
  const ctx = { ...baseCtx, rejectedIds: new Set(['going-1']), existingIds: new Set(['going-1']) };
  assert.deepEqual(decide(entry, ctx), { action: 'skip', reason: 'rejected' });
});

// ---------- decide: existing ----------

test('decide: existing without affiliate → existing, no backfill', () => {
  const ctx = { ...baseCtx, existingIds: new Set(['going-1']) };
  assert.deepEqual(decide({ external_id: 'going-1' }, ctx), { action: 'existing', affiliateLink: false });
});

test('decide: existing with affiliate → existing, backfill', () => {
  const ctx = { ...baseCtx, existingIds: new Set(['going-1']) };
  const d = decide({ external_id: 'going-1', affiliate_link: 'https://td.com' }, ctx);
  assert.deepEqual(d, { action: 'existing', affiliateLink: true });
});

test('decide: no-affiliate existing with no external_id uses empty-string key', () => {
  const ctx = { ...baseCtx, existingIds: new Set(['']) };
  assert.equal(decide({}, ctx).action, 'existing');
});

// ---------- decide: ctx defaults ----------

test('decide: missing rejectedIds/existingIds/blacklist defaults to empty (no throw)', () => {
  const d = decide(valid(), baseCtx);
  assert.equal(d.action, 'upload');
});

// ---------- decide: validation errors ----------

test('decide: missing external_id → error', () => {
  assert.equal(decide({ lat: 1, lng: 2 }, baseCtx).error, 'missing external_id');
});

test('decide: non-numeric lat or lng → error', () => {
  assert.equal(decide(valid({ lat: '1' }), baseCtx).error, 'invalid lat/lng');
  assert.equal(decide(valid({ lng: null }), baseCtx).error, 'invalid lat/lng');
});

test('decide: created_at too old / too far future → error', () => {
  assert.equal(decide(valid({ created_at: new Date(NOW - TTL - 1).toISOString() }), baseCtx).error, 'created_at too far in the past');
  assert.equal(decide(valid({ created_at: new Date(NOW + LOOKAHEAD + 1).toISOString() }), baseCtx).error, 'created_at too far in the future');
});

test('decide: unparseable created_at → error message from parse', () => {
  assert.equal(decide(valid({ created_at: 'garbage' }), baseCtx).error, 'Invalid created_at: garbage');
});

test('decide: valid → upload with parsed createdAt', () => {
  const d = decide(valid(), baseCtx);
  assert.equal(d.action, 'upload');
  assert.equal(d.createdAt, warsawMidnightMs('2026-08-05'));
});

// ---------- validateEntry ----------

test('validateEntry: returns null for a valid entry', () => {
  assert.equal(validateEntry(valid(), baseCtx), null);
});

test('validateEntry: exact TTL boundary is allowed (strict <)', () => {
  assert.equal(validateEntry(valid({ created_at: new Date(NOW - TTL).toISOString() }), baseCtx), null);
});

test('validateEntry: exact lookahead boundary is allowed (strict >)', () => {
  assert.equal(validateEntry(valid({ created_at: new Date(NOW + LOOKAHEAD).toISOString() }), baseCtx), null);
});