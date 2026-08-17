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
  const now = Date.now();

  // Insert with sold out.
  await doSavePost(env, user, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', false, true);
  const ins = calls.find((c) => /INSERT INTO posts/i.test(c.sql));
  assert.ok(ins, 'INSERT statement executed');
  assert.equal(ins!.binds[ins!.binds.length - 1], 1, 'is_sold_out=1 on insert');
  assert.ok(/is_sold_out/.test(ins!.sql), 'INSERT includes is_sold_out column');

  // Update without sold out resets the flag.
  calls.length = 0;
  await doSavePost(env, user, 'p1', 'photo', 52.4, 16.9, 'Koncert: 20:00', 'm1', 't1', now, true, 'https://x.pl', 'ext-1', true, false);
  const upd = calls.find((c) => /UPDATE posts/i.test(c.sql));
  assert.ok(upd, 'UPDATE statement executed');
  assert.equal(upd!.binds[upd!.binds.length - 2], 0, 'is_sold_out=0 on update');
  assert.ok(/is_sold_out/.test(upd!.sql), 'UPDATE includes is_sold_out column');
});
