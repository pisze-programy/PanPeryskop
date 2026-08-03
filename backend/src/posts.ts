import { Hono } from 'hono';
import { authenticate } from './auth';
import { nanoid } from 'nanoid';
import { gridCellId, TTL_MS } from './models';

export const postsRoutes = new Hono<{ Bindings: Env }>();

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
      const postId = nanoid(24);
      const ext = file.name?.split('.').pop() || 'bin';
      const key = `posts/${postId}/media.${ext}`;
      await c.env.MEDIA.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
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
    .prepare('SELECT * FROM posts WHERE id = ? AND status = ? AND expires_at > ?')
    .bind(c.req.param('id'), 'approved', Date.now())
    .first();

  if (!post) return c.json({ error: 'Not found' }, 404);

  const mediaUrl = post.media_key
    ? `https://pub-panperyskop.r2.dev/${post.media_key}`
    : null;

  return c.json({ ...post, media_url: mediaUrl });
});
