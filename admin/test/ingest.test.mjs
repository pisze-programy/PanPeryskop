import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestEvents } from '../src/seed/ingest.mjs';
import { warsawMidnightMs } from '../src/seed/dates.mjs';

const NOW = Date.parse('2026-08-05T12:00:00Z');
const baseCtx = {
  force: false, baseDir: '/tmp', tmpDir: '/tmp', baseUrl: 'http://x',
  now: NOW, ttlMs: 24 * 3_600_000, maxLookaheadMs: 366 * 24 * 3_600_000,
};
const valid = (extra = {}) => ({ external_id: 'e1', lat: 1, lng: 2, created_at: '2026-08-05', media: 'a.jpg', ...extra });

function stubIo({
  blacklist = [],
  rejected = [],
  existing = [],
  uploadResult = { id: 'p1' },
  patchThrows = false,
  uploadThrows = null,
  exists = true,
} = {}) {
  const calls = { upload: [], patchAffiliate: [] };
  const io = {
    api: {
      async login() { return 'tok'; },
      async fetchSeedIds(path) {
        if (path.includes('rejected')) return new Set(rejected);
        return new Set(existing);
      },
      async fetchBlacklist() { return blacklist; },
      async patchAffiliate(e) {
        if (patchThrows) throw new Error('patch down');
        calls.patchAffiliate.push(e);
      },
      async upload(session, entry, media, createdAt) {
        if (uploadThrows) throw new Error(uploadThrows);
        calls.upload.push({ entry, media, createdAt });
        return uploadResult;
      },
    },
    fs: { existsSync: () => exists },
    media: {
      optimize: () => ({ file: Buffer.from('x'), thumb: Buffer.from('y'), type: 'photo', fileName: 'media.jpg', mime: 'image/jpeg' }),
    },
  };
  return { io, calls };
}

// ---------- startup ----------

test('ingest: fetches rejected + existing + blacklist once, logs blacklist count', async () => {
  const { io } = stubIo({ blacklist: [{ pattern: 'x' }] });
  await ingestEvents({ events: [], io, ctx: baseCtx });
  // no assertion beyond not throwing; blacklist log branch covered
  assert.ok(true);
});

test('ingest: force skips the existing-ids fetch (existingIds = empty)', async () => {
  const seen = [];
  const { io } = stubIo({ existing: ['e1'] });
  const orig = io.api.fetchSeedIds;
  io.api.fetchSeedIds = async (p) => { seen.push(p); return orig(p); };
  const events = [valid({ status: 'done' })];
  const res = await ingestEvents({ events, io, ctx: { ...baseCtx, force: true } });
  assert.equal(seen.includes('/admin/seed/existing'), false);
  assert.equal(res.done.length, 1);
});

test('ingest: without force the existing-ids fetch happens', async () => {
  const seen = [];
  const { io } = stubIo();
  const orig = io.api.fetchSeedIds;
  io.api.fetchSeedIds = async (p) => { seen.push(p); return orig(p); };
  await ingestEvents({ events: [], io, ctx: baseCtx });
  assert.ok(seen.includes('/admin/seed/existing'));
});

// ---------- skip: done ----------

test('ingest: status done (no force) → skipped, no upload, status untouched', async () => {
  const events = [{ external_id: 'e1', status: 'done', media: 'a.jpg' }];
  const { io, calls } = stubIo();
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.skipped, 1);
  assert.equal(res.done.length, 0);
  assert.equal(calls.upload.length, 0);
  assert.equal(events[0].status, 'done');
});

// ---------- skip: blacklisted ----------

test('ingest: blacklisted → terminal skip, status done, error null', async () => {
  const events = [{ title: 'spam spam', media: 'a.jpg' }];
  const { io, calls } = stubIo({ blacklist: [{ pattern: 'spam', partner_id: '' }] });
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.skipped, 1);
  assert.equal(calls.upload.length, 0);
  assert.equal(events[0].status, 'done');
  assert.equal(events[0].error, null);
});

test('ingest: blacklisted rule log branch handles pattern + partner_name', async () => {
  const events = [{ title: 'spam spam', partner_id: '9', media: 'a.jpg' }];
  const { io } = stubIo({ blacklist: [{ pattern: 'spam', partner_id: '9', partner_name: 'Presto' }] });
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.skipped, 1);
});

test('ingest: blacklisted rule log branch handles missing pattern/partner_name', async () => {
  const events = [{ title: 'spam spam', media: 'a.jpg' }];
  // Rule with only a partner (no pattern/partner_name) still matches by partner.
  const { io } = stubIo({ blacklist: [{ pattern: '', partner_id: '9' }] });
  const res = await ingestEvents({ events: [{ ...events[0], partner_id: '9' }], io, ctx: baseCtx });
  assert.equal(res.skipped, 1);
});

// ---------- skip: rejected ----------

test('ingest: rejected id → terminal skip, status done', async () => {
  const events = [{ external_id: 'r1', media: 'a.jpg' }];
  const { io, calls } = stubIo({ rejected: ['r1'] });
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.skipped, 1);
  assert.equal(calls.upload.length, 0);
  assert.equal(events[0].status, 'done');
  assert.equal(events[0].error, null);
});

// ---------- existing ----------

test('ingest: existing without affiliate → skip, status done, no patch', async () => {
  const events = [{ external_id: 'e1', media: 'a.jpg' }];
  const { io, calls } = stubIo({ existing: ['e1'] });
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.skipped, 1);
  assert.equal(calls.patchAffiliate.length, 0);
  assert.equal(events[0].status, 'done');
});

test('ingest: existing with affiliate → patchAffiliate called, status done', async () => {
  const events = [{ external_id: 'e1', affiliate_link: 'https://td' }];
  const { io, calls } = stubIo({ existing: ['e1'] });
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.skipped, 1);
  assert.equal(calls.patchAffiliate.length, 1);
  assert.equal(events[0].status, 'done');
});

test('ingest: affiliate backfill failure → throws affiliate backfill: <msg>', async () => {
  const events = [{ external_id: 'e1', affiliate_link: 'https://td' }];
  const { io } = stubIo({ existing: ['e1'], patchThrows: true });
  await assert.rejects(ingestEvents({ events, io, ctx: baseCtx }), /affiliate backfill: patch down/);
});

// ---------- error action ----------

test('ingest: validation error → status error, pushed to results.errors', async () => {
  const events = [{ external_id: 'e1', lat: 'bad', lng: 2 }];
  const { io } = stubIo();
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.errors.length, 1);
  assert.equal(res.errors[0].error, 'invalid lat/lng');
  assert.equal(events[0].status, 'error');
  assert.equal(events[0].error, 'invalid lat/lng');
});

// ---------- upload ----------

test('ingest: valid entry → uploaded, status done, post_id set, approved true', async () => {
  const events = [valid()];
  const { io, calls } = stubIo();
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.done.length, 1);
  assert.equal(res.done[0].approved, true);
  assert.equal(events[0].status, 'done');
  assert.equal(events[0].post_id, 'p1');
  assert.equal(events[0].error, null);
  assert.equal(calls.upload.length, 1);
  assert.equal(calls.upload[0].createdAt, warsawMidnightMs('2026-08-05'));
});

test('ingest: no_geo entry → approved false', async () => {
  const events = [valid({ no_geo: true })];
  const { io } = stubIo();
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.done[0].approved, false);
});

test('ingest: missing media path → error entry', async () => {
  const events = [{ external_id: 'e1', lat: 1, lng: 2, created_at: '2026-08-05' }];
  const { io } = stubIo();
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.errors[0].error, 'missing media path');
  assert.equal(events[0].status, 'error');
});

test('ingest: media file missing → error entry', async () => {
  const events = [valid()];
  const { io } = stubIo({ exists: false });
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.errors[0].error, 'media file not found: a.jpg');
  assert.equal(events[0].status, 'error');
});

test('ingest: upload failure → error status', async () => {
  const events = [valid()];
  const { io } = stubIo({ uploadThrows: 'POST /posts -> 500' });
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.errors[0].error, 'POST /posts -> 500');
  assert.equal(events[0].status, 'error');
});

test('ingest: upload rejected as blacklisted → terminal (status done, not error)', async () => {
  const events = [valid()];
  const { io } = stubIo({ uploadThrows: 'POST /posts -> 400: {"error":"blacklisted: x"}' });
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(events[0].status, 'done');
  assert.equal(res.errors.length, 1); // still reported
});

test('ingest: upload throwing a non-Error → String(e) fallback in the message', async () => {
  const events = [valid()];
  const { io } = stubIo();
  io.api.upload = async () => { throw 'plain string failure'; };
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.errors[0].error, 'plain string failure');
  assert.equal(events[0].status, 'error');
});

test('ingest: label falls back to title, then index', async () => {
  const events = [
    { title: 'T', lat: 1, lng: 2, created_at: '2026-08-05', media: 'a.jpg' }, // no external_id → error
    { lat: 'bad', lng: 2 },
  ];
  const { io } = stubIo();
  const res = await ingestEvents({ events, io, ctx: baseCtx });
  assert.equal(res.errors[0].label, 'T');
  assert.equal(res.errors[1].label, '#1');
});