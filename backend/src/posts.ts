import { Hono } from 'hono';
import { authenticate } from './auth';
import { nanoid } from 'nanoid';
import { gridCellId, TTL_MS, MAX_LOOKAHEAD_MS, POST_TYPE_SET, STATUS_APPROVED, PostRow } from './models';
import { strField, fileField, ParsedForm } from './form';

export const postsRoutes = new Hono<{ Bindings: Env }>();

const MAX_EXTERNAL_ID_LEN = 200;

function detectMediaType(data: Uint8Array): string | null {
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return 'image/png';
  }
  if (
    data.length >= 12 &&
    data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70 &&
    (new TextDecoder().decode(data.subarray(8, 12)) === 'heic' ||
     new TextDecoder().decode(data.subarray(8, 12)) === 'heix' ||
     new TextDecoder().decode(data.subarray(8, 12)) === 'mif1')
  ) {
    return 'image/heic';
  }
  if (
    data.length >= 12 &&
    data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70 &&
    new TextDecoder().decode(data.subarray(8, 12)) === 'mp42'
  ) {
    return 'video/mp4';
  }
  return null;
}

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

  const ext = detectedType === 'image/jpeg' ? 'jpg' : detectedType === 'image/heic' ? 'heic' : detectedType.split('/')[1];
  const mediaKey = `posts/${postId}/media.${ext}`;
  await c.env.MEDIA.put(mediaKey, fileData, { httpMetadata: { contentType: detectedType } });

  let thumbKey: string | null = null;
  const thumb = fileField(form, 'thumb');
  if (thumb && thumb.size > 0 && thumb.size <= 2 * 1024 * 1024) {
    const thumbData = new Uint8Array(await thumb.arrayBuffer());
    thumbKey = `posts/${postId}/thumb.jpg`;
    await c.env.MEDIA.put(thumbKey, thumbData, { httpMetadata: { contentType: 'image/jpeg' } });
  }

  const result = await doSavePost(
    c.env, user, postId, type, lat, lng, description,
    mediaKey, thumbKey, createdAt, isSponsored, linkUrl, externalId, isUpdate
  );
  return c.json(result, isUpdate ? 200 : 201);
});

async function doSavePost(
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
  isUpdate: boolean
) {
  const db = env.DB;
  const sponsored = isSponsored ? 1 : 0;
  // Category is assigned server-side: seed (has external_id) -> 'events', app -> 'live'.
  const category = externalId ? 'events' : 'live';

  if (isUpdate) {
    await db
      .prepare(
        `UPDATE posts
         SET type = ?, lat = ?, lng = ?, description = ?, media_key = ?, thumb_key = ?,
             is_sponsored = ?, category = ?, link_url = ?, created_at = ?, external_id = ?
         WHERE id = ?`
      )
      .bind(type, lat, lng, description, mediaKey, thumbKey, sponsored, category, linkUrl, createdAt, externalId, postId)
      .run();
  } else {
    const cellId = gridCellId(lat, lng);
    await db
      .prepare(
        `INSERT INTO posts (id, user_id, type, lat, lng, description, status, media_key, thumb_key, created_at, grid_cell_id, is_sponsored, category, link_url, external_id)
         VALUES (?, ?, ?, ?, ?, ?, '${STATUS_APPROVED}', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(postId, user.id, type, lat, lng, description, mediaKey, thumbKey, createdAt, cellId, sponsored, category, linkUrl, externalId)
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
    status: STATUS_APPROVED,
    media_key: mediaKey,
    thumb_key: thumbKey,
    created_at: createdAt,
    is_sponsored: isSponsored,
    category,
    link_url: linkUrl,
    external_id: externalId,
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
       AND p.created_at >= ? AND p.created_at <= ?`
    )
    .bind(c.req.param('id'), now - TTL_MS, now)
    .first<PostRow & { author_name: string; author_avatar_key: string | null }>();

  if (!post) return c.json({ error: 'Not found' }, 404);

  const mediaUrl = post.media_key
    ? `https://panperyskop-api.dev-4cb.workers.dev/media/${post.media_key}`
    : null;

  return c.json({
    ...post,
    is_sponsored: post.is_sponsored === 1,
    liked: false,
    disliked: false,
    watched: false,
    author_name: post.author_name || 'unknown',
    author_avatar_url: post.author_avatar_key
      ? `https://panperyskop-api.dev-4cb.workers.dev/media/${post.author_avatar_key}`
      : null,
    media_url: mediaUrl,
    thumb_url: post.thumb_key
      ? `https://panperyskop-api.dev-4cb.workers.dev/media/${post.thumb_key}`
      : mediaUrl,
  });
});
