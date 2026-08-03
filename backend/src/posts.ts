import { Hono } from 'hono';
import { authenticate } from './auth';
import { nanoid } from 'nanoid';
import { gridCellId, TTL_MS } from './models';

export const postsRoutes = new Hono<{ Bindings: Env }>();

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

postsRoutes.post('/', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  let type: string;
  let lat: number;
  let lng: number;
  let description: string;
  let mediaKey: string | null = null;
  let thumbKey: string | null = null;

  const contentType = c.req.header('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.parseBody();
    type = (form.type as string) || 'photo';
    lat = parseFloat(form.lat as string);
    lng = parseFloat(form.lng as string);
    description = (form.description as string) || '';

    const file = form.file as File | undefined;
    if (file && (type === 'photo' || type === 'video')) {
      const fileData = new Uint8Array(await file.arrayBuffer());
      const detectedType = detectMediaType(fileData);
      if (!detectedType) {
        return c.json({ error: 'Invalid media file' }, 400);
      }
      const isPhoto = type === 'photo' && detectedType.startsWith('image/');
      const isVideo = type === 'video' && detectedType.startsWith('video/');
      if (!isPhoto && !isVideo) {
        return c.json({ error: 'Media type does not match post type' }, 400);
      }
      const postId = nanoid(24);
      const ext = detectedType === 'image/jpeg' ? 'jpg' : detectedType === 'image/heic' ? 'heic' : detectedType.split('/')[1];
      const key = `posts/${postId}/media.${ext}`;
      await c.env.MEDIA.put(key, fileData, {
        httpMetadata: { contentType: detectedType },
      });
      mediaKey = key;
      const result = await doSavePost(c.env, user, postId, type, lat, lng, description, mediaKey, thumbKey);
      return c.json(result, 201);
    }

    if (type === 'text') {
      const result = await doSavePost(c.env, user, nanoid(24), type, lat, lng, description, null, null);
      return c.json(result, 201);
    }

    return c.json({ error: 'Missing media for photo/video' }, 400);
  }

  const body = await c.req.json<{
    type?: string;
    lat?: number;
    lng?: number;
    description?: string;
  }>();
  type = body.type || 'text';
  lat = body.lat ?? 0;
  lng = body.lng ?? 0;
  description = body.description || '';

  if (type !== 'text') {
    return c.json({ error: 'Media posts must use multipart/form-data' }, 400);
  }

  const result = await doSavePost(c.env, user, nanoid(24), type, lat, lng, description, null, null);
  return c.json(result, 201);
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
  thumbKey: string | null
) {
  const db = env.DB;
  const now = Date.now();
  const cellId = gridCellId(lat, lng);

  await db
    .prepare(
      `INSERT INTO posts (id, user_id, type, lat, lng, description, status, media_key, thumb_key, created_at, expires_at, grid_cell_id)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    )
    .bind(postId, user.id, type, lat, lng, description, mediaKey, thumbKey, now, now + TTL_MS, cellId)
    .run();

  if (type !== 'text') {
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
    status: 'pending',
    media_key: mediaKey,
    created_at: now,
    expires_at: now + TTL_MS,
  };
}

postsRoutes.get('/:id', async (c) => {
  const db = c.env.DB;
  const post = await db
    .prepare(
      `SELECT p.*, u.device_id as author_name, u.avatar_key as author_avatar_key
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ? AND p.status = ? AND p.expires_at > ?`
    )
    .bind(c.req.param('id'), 'approved', Date.now())
    .first();

  if (!post) return c.json({ error: 'Not found' }, 404);

  const mediaUrl = post.media_key
    ? `https://panperyskop-api.dev-4cb.workers.dev/media/${post.media_key}`
    : null;

  return c.json({
    ...post,
    liked: false,
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
