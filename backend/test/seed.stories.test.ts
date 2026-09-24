import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyJson } from '../src/api/stories';

// The list feed is the only one the story viewer reads. If `meta` is dropped
// here the app can never build the club/run mask, so this pins it.
const row = {
  id: 'p1', user_id: 'u1', type: 'photo', lat: 52, lng: 21,
  description: 'Tytuł: 20:00, Klub', status: 'approved',
  media_key: null, thumb_key: null, external_media_url: '', external_thumb_url: null,
  duration_ms: null, created_at: 1, likes_count: 0, views_count: 0, shares_count: 0,
  dislikes_count: 0, grid_cell_id: null, is_sponsored: 0, category: 'events',
  link_url: null, external_id: 'ra-1', is_sold_out: 0, event_date: '2026-09-25',
  showtimes: null, showtime_booking: null, tags: '["muzyka"]', price_pln: null,
  distinction: null, meta: '{"lineup":["A"]}', watched: 0, disliked: 0,
  author_name: 'seed', author_avatar_key: null,
};

test('storyJson: meta reaches the wire so the app can build the mask', () => {
  const c = { env: {} as Env, req: { url: 'https://api.panperyskop.app/stories' } };
  const j = storyJson(row as never, c as never);
  assert.equal(j.meta, '{"lineup":["A"]}');
  assert.equal(j.source, 'ra');
  assert.equal(j.media_url, null, 'empty external URL reads as absent');
});
