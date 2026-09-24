import { Hono } from 'hono';
import { gridCellId, TTL_MS, STATUS_APPROVED, STATUS_REJECTED, CATEGORY_EVENTS, CATEGORY_FOOD, PostRow } from '../core/models';
import { mediaUrl, originFromRequest, resolvePostMedia } from '../core/media';
import { warsawDateOf } from '../seed/core/dates';

export const postsRoutes = new Hono<{ Bindings: Env }>();


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
  status: string = STATUS_APPROVED,
  partnerId: string | null = null,
  partnerName: string | null = null,
  price: number | null = null,
  sourceUrl: string | null = null,
  externalMediaUrl: string | null = null,
  externalThumbUrl: string | null = null,
  meta: string | null = null
) {
  const db = env.DB;
  const sponsored = isSponsored ? 1 : 0;
  const soldOut = isSoldOut ? 1 : 0;
  const category = CATEGORY_EVENTS;
  const eventDate = warsawDateOf(createdAt);

  if (isUpdate) {
    await db
      .prepare(
        `UPDATE posts
         SET type = ?, lat = CASE WHEN geo_locked = 1 THEN lat ELSE ? END,
             lng = CASE WHEN geo_locked = 1 THEN lng ELSE ? END,
             description = CASE WHEN geo_locked = 1 OR time_locked = 1 THEN description ELSE ? END,
             media_key = COALESCE(?, media_key), thumb_key = COALESCE(?, thumb_key),
             external_media_url = ?, external_thumb_url = ?,
             is_sponsored = ?, category = ?, link_url = ?, created_at = ?, external_id = ?,
             status = CASE WHEN status = '${STATUS_REJECTED}' THEN status ELSE ? END,
             is_sold_out = CASE WHEN sold_out_locked = 1 THEN is_sold_out ELSE ? END,
             event_date = ?, showtimes = CASE WHEN time_locked = 1 THEN showtimes ELSE ? END,
             showtime_booking = CASE WHEN time_locked = 1 THEN showtime_booking ELSE ? END,
             tags = CASE WHEN tags_locked = 1 THEN tags ELSE ? END,
             partner_id = ?, partner_name = ?, price_pln = ?, source_url = ?, meta = ?
         WHERE id = ?`
      )
      .bind(type, lat, lng, description, mediaKey, thumbKey, externalMediaUrl, externalThumbUrl, sponsored, category, linkUrl, createdAt, externalId, status, soldOut, eventDate, showtimes, showtimeBooking, tags, partnerId, partnerName, price, sourceUrl, meta, postId)
      .run();
  } else {
    const cellId = gridCellId(lat, lng);
    await db
      .prepare(
        `INSERT INTO posts (id, user_id, type, lat, lng, description, status, media_key, thumb_key, external_media_url, external_thumb_url, created_at, grid_cell_id, is_sponsored, category, link_url, source_url, external_id, is_sold_out, event_date, showtimes, showtime_booking, tags, partner_id, partner_name, price_pln, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(postId, user.id, type, lat, lng, description, status, mediaKey, thumbKey, externalMediaUrl, externalThumbUrl, createdAt, cellId, sponsored, category, linkUrl, sourceUrl, externalId, soldOut, eventDate, showtimes, showtimeBooking, tags, partnerId, partnerName, price, meta)
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
    external_media_url: externalMediaUrl,
    external_thumb_url: externalThumbUrl,
    created_at: createdAt,
    is_sponsored: isSponsored,
    category,
    link_url: linkUrl,
    source_url: sourceUrl,
    external_id: externalId,
    is_sold_out: soldOut,
    event_date: eventDate,
    showtimes: showtimes ? (JSON.parse(showtimes) as string[]) : null,
    showtime_booking: showtimeBooking ? JSON.parse(showtimeBooking) : null,
    tags: tags ? JSON.parse(tags) : null,
    price_pln: price,
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
       AND (p.created_at >= ? OR p.category = '${CATEGORY_FOOD}')`
    )
    .bind(c.req.param('id'), now - TTL_MS)
    .first<PostRow & { author_name: string; author_avatar_key: string | null }>();

  if (!post) return c.json({ error: 'Not found' }, 404);

  const origin = originFromRequest(c);
  const mediaUrls = resolvePostMedia(origin, post);

  return c.json({
    ...post,
    is_sponsored: post.is_sponsored === 1,
    liked: false,
    disliked: false,
    watched: false,
    author_name: post.author_name || 'unknown',
    author_avatar_url: mediaUrl(origin, post.author_avatar_key),
    media_url: mediaUrls.media_url,
    thumb_url: mediaUrls.thumb_url,
    showtime_booking: post.showtime_booking ? JSON.parse(post.showtime_booking) : null,
    tags: post.tags ? JSON.parse(post.tags) : null,
  });
});
