import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/seed/api.mjs';

const realFetch = globalThis.fetch;
async function withFetch(fn, impl) {
  const calls = [];
  globalThis.fetch = (url, opts = {}) => {
    calls.push({ url, opts });
    return impl(url, opts);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = realFetch;
  }
}

const res = (body, { ok = true, status = 200, jsonThrows = false } = {}) => ({
  ok, status,
  json: async () => { if (jsonThrows) throw new Error('bad json'); return body; },
});

const api = (over = {}) => createApi({ baseUrl: 'https://api.test', adminSecret: 'secret', deviceId: 'dev', ...over });

// ---------- login ----------

test('login: POSTs /auth/device and returns the session token', async () => {
  await withFetch(async (calls) => {
    const out = await api().login();
    assert.equal(out, 'tok');
    assert.equal(calls[0].url, 'https://api.test/auth/device');
    assert.equal(calls[0].opts.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].opts.body), { device_id: 'dev' });
  }, () => res({ session_token: 'tok' }));
});

test('login: non-ok throws auth/device -> <status>', async () => {
  await withFetch(async () => {
    await assert.rejects(api().login(), /auth\/device -> 500/);
  }, () => res({}, { ok: false, status: 500 }));
});

// ---------- fetchSeedIds ----------

test('fetchSeedIds: no adminSecret → empty Set without any fetch', async () => {
  await withFetch(async (calls) => {
    const s = await api({ adminSecret: undefined }).fetchSeedIds('/admin/seed/existing');
    assert.equal(s.size, 0);
    assert.equal(calls.length, 0);
  }, () => res({ ids: ['x'] }));
});

test('fetchSeedIds: ok with ids array → Set', async () => {
  await withFetch(async () => {
    const s = await api().fetchSeedIds('/admin/seed/rejected');
    assert.deepEqual([...s], ['a', 'b']);
  }, () => res({ ids: ['a', 'b'] }));
});

test('fetchSeedIds: ok with non-array → empty Set', async () => {
  await withFetch(async () => {
    const s = await api().fetchSeedIds('/admin/seed/existing');
    assert.equal(s.size, 0);
  }, () => res({ ids: null }));
});

test('fetchSeedIds: non-ok → empty Set (fail-open)', async () => {
  await withFetch(async () => {
    const s = await api().fetchSeedIds('/admin/seed/existing');
    assert.equal(s.size, 0);
  }, () => res({}, { ok: false, status: 404 }));
});

test('fetchSeedIds: network throw → empty Set (fail-open)', async () => {
  await withFetch(async () => {
    const s = await api().fetchSeedIds('/admin/seed/existing');
    assert.equal(s.size, 0);
  }, () => { throw new Error('offline'); });
});

// ---------- fetchBlacklist ----------

test('fetchBlacklist: no adminSecret → [] without any fetch', async () => {
  await withFetch(async (calls) => {
    const rules = await api({ adminSecret: undefined }).fetchBlacklist();
    assert.deepEqual(rules, []);
    assert.equal(calls.length, 0);
  }, () => res({ rules: [{ pattern: 'x' }] }));
});

test('fetchBlacklist: ok with rules array → rules', async () => {
  await withFetch(async (calls) => {
    const rules = await api().fetchBlacklist();
    assert.deepEqual(rules, [{ pattern: 'x' }]);
    assert.equal(calls[0].url, 'https://api.test/admin/seed/blacklist');
  }, () => res({ rules: [{ pattern: 'x' }] }));
});

test('fetchBlacklist: ok with non-array → []', async () => {
  await withFetch(async () => {
    assert.deepEqual(await api().fetchBlacklist(), []);
  }, () => res({ rules: {} }));
});

test('fetchBlacklist: non-ok → [] (fail-open)', async () => {
  await withFetch(async () => {
    assert.deepEqual(await api().fetchBlacklist(), []);
  }, () => res({}, { ok: false, status: 500 }));
});

test('fetchBlacklist: network throw → [] (fail-open)', async () => {
  await withFetch(async () => {
    assert.deepEqual(await api().fetchBlacklist(), []);
  }, () => { throw new Error('offline'); });
});

// ---------- patchAffiliate ----------

test('patchAffiliate: POSTs external_id/link_url/source_url', async () => {
  await withFetch(async (calls) => {
    await api().patchAffiliate({ external_id: 'g1', affiliate_link: 'https://td', link: 'https://plain' });
    assert.equal(calls[0].url, 'https://api.test/admin/seed/affiliate');
    assert.deepEqual(JSON.parse(calls[0].opts.body), { external_id: 'g1', link_url: 'https://td', source_url: 'https://plain' });
  }, () => res({}));
});

test('patchAffiliate: non-ok throws affiliate update -> <status>', async () => {
  await withFetch(async () => {
    await assert.rejects(api().patchAffiliate({ external_id: 'g1' }), /affiliate update -> 403/);
  }, () => res({}, { ok: false, status: 403 }));
});

// ---------- upload ----------

const media = { type: 'photo', mime: 'image/jpeg', fileName: 'media.jpg', file: Buffer.from('f'), thumb: Buffer.from('t') };

test('upload: success returns response data and posts to /posts', async () => {
  await withFetch(async (calls) => {
    const out = await api().upload({ token: 'tok' }, { external_id: 'e1', lat: 1, lng: 2, title: 'T' }, media, 123);
    assert.deepEqual(out, { id: 'p1' });
    assert.equal(calls[0].url, 'https://api.test/posts');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
    assert.equal(calls[0].opts.body.get('external_id'), 'e1');
  }, () => res({ id: 'p1' }));
});

test('upload: sensitive form fields are set (affiliate swap, source_url, booking, tags, partner, pending no_geo)', async () => {
  await withFetch(async (calls) => {
    const entry = {
      external_id: 'g1', lat: 1, lng: 2, title: 'T', description: 'D',
      affiliate_link: 'https://td', link: 'https://plain',
      showtimes: ['18:00'], showtime_booking: [{ time: '18:00', kind: 'x' }],
      tags: ['kino'], partner_id: 42, partner_name: 'P', no_geo: true,
    };
    await api().upload({ token: 't' }, entry, media, 123);
    const form = calls[0].opts.body;
    assert.equal(form.get('link_url'), 'https://td');
    assert.equal(form.get('source_url'), 'https://plain');
    assert.equal(form.get('showtimes'), JSON.stringify(['18:00']));
    assert.equal(form.get('showtime_booking'), JSON.stringify([{ time: '18:00', kind: 'x' }]));
    assert.equal(form.get('tags'), JSON.stringify(['kino']));
    assert.equal(form.get('partner_id'), '42');
    assert.equal(form.get('partner_name'), 'P');
    assert.equal(form.get('status'), 'pending'); // no_geo
    assert.equal(form.get('is_sponsored'), '1');
  }, () => res({ id: 'p1' }));
});

test('upload: plain link used when no affiliate; no status field for normal entries', async () => {
  await withFetch(async (calls) => {
    await api().upload({ token: 't' }, { external_id: 'e1', lat: 1, lng: 2, link: 'https://plain' }, media, 1);
    const form = calls[0].opts.body;
    assert.equal(form.get('link_url'), 'https://plain');
    assert.equal(form.get('source_url'), null);
    assert.equal(form.get('status'), null);
  }, () => res({ id: 'p1' }));
});

test('upload: no link at all → link_url absent', async () => {
  await withFetch(async (calls) => {
    await api().upload({ token: 't' }, { external_id: 'e1', lat: 1, lng: 2 }, media, 1);
    assert.equal(calls[0].opts.body.get('link_url'), null);
  }, () => res({ id: 'p1' }));
});

test('upload: 401 re-logins once and retries with the new token', async () => {
  let posts = 0;
  await withFetch(async (calls) => {
    const session = { token: 'old' };
    const out = await api().upload(session, { external_id: 'e1', lat: 1, lng: 2 }, media, 1);
    assert.deepEqual(out, { id: 'p2' });
    assert.equal(session.token, 'newtok'); // session updated
    // auth/device then two /posts
    assert.equal(calls.filter((c) => c.url.endsWith('/auth/device')).length, 1);
    assert.equal(calls.filter((c) => c.url.endsWith('/posts')).length, 2);
  }, (url) => {
    if (url.endsWith('/auth/device')) return res({ session_token: 'newtok' });
    return posts++ === 0 ? res({}, { ok: false, status: 401 }) : res({ id: 'p2' });
  });
});

test('upload: non-ok (non-401) throws with status and body', async () => {
  await withFetch(async () => {
    await assert.rejects(
      api().upload({ token: 't' }, { external_id: 'e1', lat: 1, lng: 2 }, media, 1),
      /POST \/posts -> 400: \{"error":"blacklisted"\}/
    );
  }, () => res({ error: 'blacklisted' }, { ok: false, status: 400 }));
});

test('upload: error response with unparseable JSON → {} in the throw (json catch branch)', async () => {
  await withFetch(async () => {
    await assert.rejects(
      api().upload({ token: 't' }, { external_id: 'e1', lat: 1, lng: 2 }, media, 1),
      /POST \/posts -> 500: \{\}/
    );
  }, () => res(null, { ok: false, status: 500, jsonThrows: true }));
});