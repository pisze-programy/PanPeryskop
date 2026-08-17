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
  // createdAt, cellId, sponsored, category, linkUrl, externalId, is_sold_out, event_date).
  await doSavePost(env, user, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', false, true);
  const ins = calls.find((c) => /INSERT INTO posts/i.test(c.sql));
  assert.ok(ins, 'INSERT statement executed');
  assert.equal(ins!.binds[ins!.binds.length - 2], 1, 'is_sold_out=1 on insert');
  assert.equal(ins!.binds[ins!.binds.length - 1], '2026-08-17', 'event_date set from created_at (events only)');
  assert.ok(/is_sold_out/.test(ins!.sql), 'INSERT includes is_sold_out column');
  assert.ok(/event_date/.test(ins!.sql), 'INSERT includes event_date column');

  // Update without sold out resets the flag. Binds: (type, lat, lng, desc, media,
  // thumb, sponsored, category, linkUrl, createdAt, externalId, is_sold_out, event_date, id).
  calls.length = 0;
  await doSavePost(env, user, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', true, false);
  const upd = calls.find((c) => /UPDATE posts/i.test(c.sql));
  assert.ok(upd, 'UPDATE statement executed');
  assert.equal(upd!.binds[upd!.binds.length - 3], 0, 'is_sold_out=0 on update');
  assert.equal(upd!.binds[upd!.binds.length - 2], '2026-08-17', 'event_date updated');
  assert.ok(/is_sold_out/.test(upd!.sql), 'UPDATE includes is_sold_out column');
  assert.ok(/event_date/.test(upd!.sql), 'UPDATE includes event_date column');
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
  assert.equal(ins!.binds[ins!.binds.length - 1], null, 'live post event_date is NULL');
});
