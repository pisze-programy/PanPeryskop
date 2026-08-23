import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doSavePost } from '../src/api/posts';

test('doSavePost: persists is_sold_out flag on insert and update', async () => {
  // Fake DB recording bind values per statement.
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...binds: unknown[]) => ({ run: async () => { calls.push({ sql, binds }); } }),
    }),
  } as unknown as D1Database;
  const env = { DB: db } as unknown as Env;
  const user = { id: 'u1' };
  const now = Date.parse('2026-08-17T04:00:00Z'); // 06:00 Warsaw CEST — event day 2026-08-17

  // Insert with sold out. Binds: (postId, user, type, lat, lng, desc, media, thumb,
  // createdAt, cellId, sponsored, category, linkUrl, externalId, is_sold_out, event_date, showtimes, showtime_booking, tags).
  await doSavePost(env, user, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', false, true);
  const ins = calls.find((c) => /INSERT INTO posts/i.test(c.sql));
  assert.ok(ins, 'INSERT statement executed');
  assert.equal(ins!.binds[ins!.binds.length - 5], 1, 'is_sold_out=1 on insert');
  assert.equal(ins!.binds[ins!.binds.length - 4], '2026-08-17', 'event_date set from created_at (events only)');
  assert.equal(ins!.binds[ins!.binds.length - 3], null, 'showtimes NULL by default');
  assert.equal(ins!.binds[ins!.binds.length - 2], null, 'showtime_booking NULL by default');
  assert.equal(ins!.binds[ins!.binds.length - 1], null, 'tags NULL by default');
  assert.ok(/is_sold_out/.test(ins!.sql), 'INSERT includes is_sold_out column');
  assert.ok(/event_date/.test(ins!.sql), 'INSERT includes event_date column');
  assert.ok(/showtimes/.test(ins!.sql), 'INSERT includes showtimes column');
  assert.ok(/showtime_booking/.test(ins!.sql), 'INSERT includes showtime_booking column');
  assert.ok(/tags/.test(ins!.sql), 'INSERT includes tags column');

  // Update without sold out resets the flag. Binds: (type, lat, lng, desc, media,
  // thumb, sponsored, category, linkUrl, createdAt, externalId, is_sold_out, event_date, showtimes, showtime_booking, tags, id).
  calls.length = 0;
  await doSavePost(env, user, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', true, false);
  const upd = calls.find((c) => /UPDATE posts/i.test(c.sql));
  assert.ok(upd, 'UPDATE statement executed');
  assert.equal(upd!.binds[upd!.binds.length - 6], 0, 'is_sold_out=0 on update');
  assert.equal(upd!.binds[upd!.binds.length - 5], '2026-08-17', 'event_date updated');
  assert.equal(upd!.binds[upd!.binds.length - 4], null, 'showtimes NULL on update');
  assert.equal(upd!.binds[upd!.binds.length - 3], null, 'showtime_booking NULL on update');
  assert.equal(upd!.binds[upd!.binds.length - 2], null, 'tags NULL on update');
  assert.ok(/is_sold_out/.test(upd!.sql), 'UPDATE includes is_sold_out column');
  assert.ok(/event_date/.test(upd!.sql), 'UPDATE includes event_date column');
  assert.ok(/showtimes/.test(upd!.sql), 'UPDATE includes showtimes column');
  assert.ok(/showtime_booking/.test(upd!.sql), 'UPDATE includes showtime_booking column');
  assert.ok(/tags/.test(upd!.sql), 'UPDATE includes tags column');
});

test('doSavePost: live posts (no external_id) get event_date NULL', async () => {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...binds: unknown[]) => ({ run: async () => { calls.push({ sql, binds }); } }),
    }),
  } as unknown as D1Database;
  const env = { DB: db } as unknown as Env;
  const user = { id: 'u1' };
  const now = Date.parse('2026-08-17T04:00:00Z');

  await doSavePost(env, user, 'p2', 'photo', 52.4, 16.9, 'Live!', 'm2', 't2', now, false, null, null, false, false);
  const ins = calls.find((c) => /INSERT INTO posts/i.test(c.sql));
  assert.ok(ins, 'INSERT executed');
  assert.equal(ins!.binds[ins!.binds.length - 4], null, 'live post event_date is NULL');
});

test('doSavePost: update promotes pending→approved (status bound) but preserves admin rejections', async () => {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...binds: unknown[]) => ({ run: async () => { calls.push({ sql, binds }); } }),
    }),
  } as unknown as D1Database;
  const env = { DB: db } as unknown as Env;
  const user = { id: 'u1' };
  const now = Date.parse('2026-08-17T04:00:00Z');

  await doSavePost(env, user, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', true, false, null, null, null, 'approved');
  const upd = calls.find((c) => /UPDATE posts/i.test(c.sql));
  assert.ok(upd, 'UPDATE executed');
  assert.equal(upd!.binds[11], 'approved', 'status column bound to the new status (pending→approved promotion)');
  assert.ok(/status = CASE WHEN status = 'rejected' THEN status ELSE \?/i.test(upd!.sql), 'UPDATE keeps status but preserves admin rejection');
});

test('doSavePost: update preserves tags when tags_locked=1, applies the new tag when unlocked', async () => {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = { prepare: (sql: string) => ({ bind: (...binds: unknown[]) => ({ run: async () => { calls.push({ sql, binds }); } }) }) } as unknown as D1Database;
  const env = { DB: db } as unknown as Env;
  const user = { id: 'u1' };
  const now = Date.parse('2026-08-17T04:00:00Z');

  await doSavePost(env, user, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', true, false, null, null, '["sport"]', 'approved');
  const upd = calls.find((c) => /UPDATE posts/i.test(c.sql));
  assert.ok(upd, 'UPDATE executed');
  // The lock decision lives in SQL: keep current tags when tags_locked=1, else take the bound value.
  assert.ok(/tags = CASE WHEN tags_locked = 1 THEN tags ELSE \?/i.test(upd!.sql), 'UPDATE preserves locked tags');
  assert.equal(upd!.binds[16], '["sport"]', 'tags JSON bound for the unlocked path');
});
