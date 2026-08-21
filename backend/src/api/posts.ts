import { Hono } from 'hono';
import { authenticate } from './auth';
import { nanoid } from 'nanoid';
import { gridCellId, TTL_MS, MAX_LOOKAHEAD_MS, POST_TYPE_SET, STATUS_APPROVED, PostRow } from '../core/models';
import { CANONICAL_TAG_SET } from '../seed/core/tags';
import { strField, fileField, ParsedForm } from '../core/form';
import { mediaUrl, originFromRequest } from '../core/media';
import { detectMediaType, extForMediaType } from '../core/mediaFormat';
import { warsawDateOf } from '../seed/core/dates';

export const postsRoutes = new Hono<{ Bindings: Env }>();

const MAX_EXTERNAL_ID_LEN = 200;

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

postsRoutes.post('/', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const contentType = c.req.header('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'Media posts must use multipart/form-data' }, 400);
  }

  const form = await c.req.parseBody() as ParsedForm;

  const type = strField(form, 'type') ?? 'photo';
  if (!POST_TYPE_SET.has(type)) {
    return c.json({ error: 'Invalid post type' }, 400);
  }

  const lat = parseFloat(strField(form, 'lat') ?? '');
  const lng = parseFloat(strField(form, 'lng') ?? '');
  const description = strField(form, 'description') ?? '';
  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return c.json({ error: 'Invalid coordinates' }, 400);
  }

  // created_at is server-authoritative for app posts. Seed may pass an explicit
  // (future) instant so events become visible inside the [now-24h, now] window.
  const now = Date.now();
  let createdAt = now;
  const createdAtRaw = strField(form, 'created_at');
  if (createdAtRaw !== undefined) {
    const v = parseInt(createdAtRaw, 10);
    if (!isFinite(v)) return c.json({ error: 'Invalid created_at' }, 400);
    if (v < now - TTL_MS) return c.json({ error: 'created_at too far in the past' }, 400);
    if (v > now + MAX_LOOKAHEAD_MS) return c.json({ error: 'created_at too far in the future' }, 400);
    createdAt = v;
  }

  const isSponsored = strField(form, 'is_sponsored') === '1' || strField(form, 'is_sponsored') === 'true';

  let linkUrl: string | null = null;
  const linkUrlRaw = strField(form, 'link_url');
  if (linkUrlRaw) {
    const lv = linkUrlRaw.trim();
    if (!isValidHttpUrl(lv)) return c.json({ error: 'Invalid link_url' }, 400);
    linkUrl = lv;
  }

  let externalId: string | null = null;
  const externalIdRaw = strField(form, 'external_id');
  if (externalIdRaw) {
    const ev = externalIdRaw.trim();
    if (!ev || ev.length > MAX_EXTERNAL_ID_LEN) return c.json({ error: 'Invalid external_id' }, 400);
    externalId = ev;
  }

  const file = fileField(form, 'file');
  if (!file || file.size === 0) return c.json({ error: 'Missing media file' }, 400);
  if (file.size > 100 * 1024 * 1024) return c.json({ error: 'File too large (max 100MB)' }, 413);

  const fileData = new Uint8Array(await file.arrayBuffer());
  const detectedType = detectMediaType(fileData);
  if (!detectedType) return c.json({ error: 'Invalid media file' }, 400);
  const isPhoto = type === 'photo' && detectedType.startsWith('image/');
  const isVideo = type === 'video' && detectedType.startsWith('video/');
  if (!isPhoto && !isVideo) return c.json({ error: 'Media type does not match post type' }, 400);

  // Upsert by external_id keeps the post id (and media path) stable across re-seeds.
  let postId = nanoid(24);
  let isUpdate = false;
  if (externalId) {
    const existing = await c.env.DB
      .prepare('SELECT id FROM posts WHERE external_id = ?')
      .bind(externalId)
      .first<{ id: string }>();
    if (existing) {
      postId = existing.id;
      isUpdate = true;
    }
  }

  const ext = extForMediaType(detectedType);
  const mediaKey = `posts/${postId}/media.${ext}`;
  await c.env.MEDIA.put(mediaKey, fileData, { httpMetadata: { contentType: detectedType } });

  let thumbKey: string | null = null;
  const thumb = fileField(form, 'thumb');
  if (thumb && thumb.size > 0 && thumb.size <= 2 * 1024 * 1024) {
    const thumbData = new Uint8Array(await thumb.arrayBuffer());
    const thumbType = detectMediaType(thumbData) ?? 'image/jpeg';
    thumbKey = `posts/${postId}/thumb.${extForMediaType(thumbType)}`;
    await c.env.MEDIA.put(thumbKey, thumbData, { httpMetadata: { contentType: thumbType } });
  }

  // Optional structured showtimes (JSON array of "HH:MM") — seed-only; the app
  // never sends it. Invalid values are rejected.
  let showtimesJson: string | null = null;
  const showtimesRaw = strField(form, 'showtimes');
  if (showtimesRaw) {
    let parsed: unknown;
    try { parsed = JSON.parse(showtimesRaw); } catch { return c.json({ error: 'Invalid showtimes' }, 400); }
    const times = Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === 'string')
      : null;
    if (!times || times.length === 0 || times.length > 30 || !times.every((t) => /^\d{2}:\d{2}$/.test(t))) {
      return c.json({ error: 'Invalid showtimes' }, 400);
    }
    showtimesJson = JSON.stringify(times);
  }

  // Optional per-showtime booking identity (cinema providers) — seed-only.
  let showtimeBookingJson: string | null = null;
  const bookingRaw = strField(form, 'showtime_booking');
  if (bookingRaw) {
    let parsed: unknown;
    try { parsed = JSON.parse(bookingRaw); } catch { return c.json({ error: 'Invalid showtime_booking' }, 400); }
    const entries = Array.isArray(parsed)
      ? parsed.filter(
          (b): b is { time: string; kind: string; params: Record<string, string> } =>
            !!b && typeof b === 'object' && typeof (b as any).time === 'string' && typeof (b as any).kind === 'string' && !!((b as any).params)
        )
      : null;
    if (!entries || entries.length === 0 || entries.length > 30) {
      return c.json({ error: 'Invalid showtime_booking' }, 400);
    }
    showtimeBookingJson = JSON.stringify(entries);
  }

  // Optional canonical tags (JSON array) — seed-only. Only closed-set ids pass.
  let tagsJson: string | null = null;
  const tagsRaw = strField(form, 'tags');
  if (tagsRaw) {
    let parsed: unknown;
    try { parsed = JSON.parse(tagsRaw); } catch { return c.json({ error: 'Invalid tags' }, 400); }
    const tags = Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === 'string' && CANONICAL_TAG_SET.has(t))
      : null;
    if (!tags) return c.json({ error: 'Invalid tags' }, 400);
    tagsJson = JSON.stringify([...new Set(tags)].sort());
  }

  const result = await doSavePost(
    c.env, user, postId, type, lat, lng, description,
    mediaKey, thumbKey, createdAt, isSponsored, linkUrl, externalId, isUpdate, false, showtimesJson, showtimeBookingJson, tagsJson
  );
  return c.json(result, isUpdate ? 200 : 201);
});

export async function doSavePost(
  env: Env,
  user: { id: string },
  postId: string,
  type: string,
  lat: number,
  lng: number,
  description: string,
  mediaKey: string | null,
  thumbKey: string | null,
  createdAt: number,
  isSponsored: boolean,
  linkUrl: string | null,
  externalId: string | null,
  isUpdate: boolean,
  isSoldOut = false,
  showtimes: string | null = null,
  showtimeBooking: string | null = null,
  tags: string | null = null,
  status: string = STATUS_APPROVED
) {
  const db = env.DB;
  const sponsored = isSponsored ? 1 : 0;
  const soldOut = isSoldOut ? 1 : 0;
  // Category is assigned server-side: seed (has external_id) -> 'events', app -> 'live'.
  const category = externalId ? 'events' : 'live';
  // Day-browser key: the event's day in Europe/Warsaw (created_at = 06:00 of that day).
  const eventDate = externalId ? warsawDateOf(createdAt) : null;

  if (isUpdate) {
    await db
      .prepare(
        `UPDATE posts
         SET type = ?, lat = CASE WHEN geo_locked = 1 THEN lat ELSE ? END,
             lng = CASE WHEN geo_locked = 1 THEN lng ELSE ? END,
             description = CASE WHEN geo_locked = 1 OR time_locked = 1 THEN description ELSE ? END,
             media_key = ?, thumb_key = ?,
             is_sponsored = ?, category = ?, link_url = ?, created_at = ?, external_id = ?,
             is_sold_out = CASE WHEN sold_out_locked = 1 THEN is_sold_out ELSE ? END,
             event_date = ?, showtimes = CASE WHEN time_locked = 1 THEN showtimes ELSE ? END,
             showtime_booking = CASE WHEN time_locked = 1 THEN showtime_booking ELSE ? END,
             tags = CASE WHEN tags_locked = 1 THEN tags ELSE ? END
         WHERE id = ?`
      )
      .bind(type, lat, lng, description, mediaKey, thumbKey, sponsored, category, linkUrl, createdAt, externalId, soldOut, eventDate, showtimes, showtimeBooking, tags, postId)
      .run();
  } else {
    const cellId = gridCellId(lat, lng);
    await db
      .prepare(
        `INSERT INTO posts (id, user_id, type, lat, lng, description, status, media_key, thumb_key, created_at, grid_cell_id, is_sponsored, category, link_url, external_id, is_sold_out, event_date, showtimes, showtime_booking, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(postId, user.id, type, lat, lng, description, status, mediaKey, thumbKey, createdAt, cellId, sponsored, category, linkUrl, externalId, soldOut, eventDate, showtimes, showtimeBooking, tags)
      .run();
    await db
      .prepare(
        'INSERT INTO grid_cells (id, lat, lng, heat) VALUES (?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET heat = heat + 1'
      )
      .bind(cellId, lat, lng)
      .run();
  }

  return {
    id: postId,
    type,
    lat,
    lng,
    description,
    status,
    media_key: mediaKey,
    thumb_key: thumbKey,
    created_at: createdAt,
    is_sponsored: isSponsored,
    category,
    link_url: linkUrl,
    external_id: externalId,
    is_sold_out: soldOut,
    event_date: eventDate,
    showtimes: showtimes ? (JSON.parse(showtimes) as string[]) : null,
    showtime_booking: showtimeBooking ? JSON.parse(showtimeBooking) : null,
    tags: tags ? JSON.parse(tags) : null,
  };
}

postsRoutes.get('/:id', async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  const post = await db
    .prepare(
      `SELECT p.*, COALESCE(NULLIF(u.username, ''), u.device_id) as author_name,
              u.avatar_key as author_avatar_key
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ? AND p.status = '${STATUS_APPROVED}'
       AND p.created_at >= ?`
    )
    .bind(c.req.param('id'), now - TTL_MS)
    .first<PostRow & { author_name: string; author_avatar_key: string | null }>();

  if (!post) return c.json({ error: 'Not found' }, 404);

  const origin = originFromRequest(c);
  const mediaUrlV = mediaUrl(origin, post.media_key);

  return c.json({
    ...post,
    is_sponsored: post.is_sponsored === 1,
    liked: false,
    disliked: false,
    watched: false,
    author_name: post.author_name || 'unknown',
    author_avatar_url: mediaUrl(origin, post.author_avatar_key),
    media_url: mediaUrlV,
    thumb_url: mediaUrl(origin, post.thumb_key) ?? mediaUrlV,
    showtime_booking: post.showtime_booking ? JSON.parse(post.showtime_booking) : null,
    tags: post.tags ? JSON.parse(post.tags) : null,
  });
});
