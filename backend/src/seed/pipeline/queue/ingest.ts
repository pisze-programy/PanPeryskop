// Ingest winners from seed_raw (queue redesign, step 7): turn a reconciled
// winner row into a post. Mirrors handleIngest step for step (blacklist gate,
// deferred geo, media reuse, doSavePost upsert) so behavior is identical — the
// only difference is the source of the candidate (a seed_raw row instead of a
// seed_candidates row).
//
// Idempotent re-run: posts upsert by external_id (see doSavePost), and an
// already-done row short-circuits to its post without touching media or geo.
// Shadow mode: nothing calls this in production yet (wiring comes later).
import { nanoid } from 'nanoid';
import { SeedCandidate, SeedProvider, ShowtimeBooking } from '../../core/types';
import { buildDescription, showtimesJson, showtimeBookingJson, tagsJson } from '../../core/dedupe';
import { fallbackSeedGeo, resolveGeo } from '../../core/geo';
import { detectMediaType, extForMediaType } from '../../../core/mediaFormat';
import { doSavePost } from '../../../api/posts';
import { STATUS_APPROVED, STATUS_PENDING } from '../../../core/models';
import { findBlacklist, loadBlacklistRules, blacklistReason } from '../../core/blacklist';
import { eventCreatedAtMs, eventDayEndMs, warsawMidnightMs } from '../../core/dates';
import { now } from './state';

export interface RawIngestEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
}

export interface RawWinnerRow {
  id: string;
  day: string;
  batch_id: string;
  provider: string;
  external_id: string;
  title: string;
  raw_venue: string;
  city: string | null;
  canonical_venue_id: string | null;
  start_min: number;
  showtimes: string | null;
  showtime_booking: string | null;
  tags: string | null;
  price_pln: number | null;
  is_sold_out: number;
  media_url: string | null;
  thumb_url: string | null;
  link_url: string | null;
  affiliate_link: string | null;
  partner_id: string | null;
  partner_name: string | null;
  status: string;
}

export interface RawIngestResult {
  postId: string | null;
  skipped: boolean;
  pendingGeo: boolean;
}

function parseJsonArray<T>(s: string | null | undefined): T[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/** Ingest one reconciled winner row. Returns its post id. Throws on transient
 *  errors (the caller retries); marks the row done/error accordingly. */
export async function ingestWinnerRow(
  env: RawIngestEnv,
  provider: SeedProvider,
  userId: string,
  day: string,
  row: RawWinnerRow,
): Promise<RawIngestResult> {
  if (row.status === 'done') {
    const post = await env.DB.prepare('SELECT id FROM posts WHERE external_id=?')
      .bind(row.external_id)
      .first<{ id: string }>();
    return { postId: post?.id ?? null, skipped: true, pendingGeo: false };
  }
  if (row.status !== 'winner') {
    return { postId: null, skipped: true, pendingGeo: false };
  }

  await env.DB.prepare(`UPDATE seed_raw SET status='ingesting', attempts=attempts+1, updated_at=? WHERE id=?`)
    .bind(now(), row.id)
    .run();
  try {
    const dayStart = warsawMidnightMs(day);
    const createdAt = eventCreatedAtMs(day);

    // Blacklist gate BEFORE geo and media: a matched rule drops the row without
    // spending a geocode or a download. Same order as handleIngest.
    const blacklistRules = await loadBlacklistRules(env.DB as D1Database);
    const bl = findBlacklist(blacklistRules, { title: row.title, venue: row.raw_venue, partnerId: row.partner_id });
    if (bl) {
      await env.DB.prepare(`UPDATE seed_raw SET status='duplicate', reason=?, updated_at=? WHERE id=?`)
        .bind(blacklistReason(bl), now(), row.id)
        .run();
      return { postId: null, skipped: true, pendingGeo: false };
    }

    // Geo: canonical venue row first (covers provider-supplied coords and every
    // previously healed venue — no geo API call); then the shared deferred path
    // (store → Nominatim, survivors only); finally the default pin + PENDING.
    let lat: number | null = null;
    let lng: number | null = null;
    if (row.canonical_venue_id) {
      const hit = await env.DB.prepare('SELECT lat, lng FROM venues WHERE id = ?')
        .bind(row.canonical_venue_id)
        .first<{ lat: number | null; lng: number | null }>();
      if (typeof hit?.lat === 'number' && typeof hit?.lng === 'number') {
        lat = hit.lat;
        lng = hit.lng;
      }
    }
    let pendingGeo = false;
    if (lat === null || lng === null) {
      const geo = await resolveGeo({
        name: row.raw_venue,
        city: row.city || undefined,
        db: env.DB,
        provider: row.provider,
      });
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }
    if (lat === null || lng === null) {
      const fb = fallbackSeedGeo(row.city);
      lat = fb.lat;
      lng = fb.lng;
      pendingGeo = true;
    }

    const existing = await env.DB.prepare('SELECT id, media_key, thumb_key FROM posts WHERE external_id=?')
      .bind(row.external_id)
      .first<{ id: string; media_key: string | null; thumb_key: string | null }>();
    const postId = existing?.id || nanoid(24);

    const ctx = {
      env: env as unknown as Env, day, dayStart,
      dayEnd: eventDayEndMs(day), createdAt,
      recordBrowserMs: (_ms: number) => {},
    };
    let link = row.link_url || '';
    if (provider.resolveLink) {
      try {
        link = await provider.resolveLink(ctx, rowToCandidate(row, dayStart, lat, lng, link));
      } catch { /* best-effort */ }
    }

    // Idempotent re-seed: reuse stored media when the post already exists.
    let mediaKey: string | null = existing?.media_key ?? null;
    if (!mediaKey) {
      if (!row.media_url) throw new Error('missing media url');
      const mediaBytes = await provider.fetchBytes(ctx, row.media_url);
      const mediaType = detectMediaType(mediaBytes);
      if (!mediaType || !mediaType.startsWith('image/')) throw new Error(`bad media ${mediaType || 'unknown'}`);
      mediaKey = `posts/${postId}/media.${extForMediaType(mediaType)}`;
      await env.MEDIA.put(mediaKey, mediaBytes, { httpMetadata: { contentType: mediaType } });
    }

    let thumbKey: string | null = existing?.thumb_key ?? null;
    if (!thumbKey && row.thumb_url) {
      try {
        const thumbBytes = await provider.fetchBytes(ctx, row.thumb_url);
        const thumbType = detectMediaType(thumbBytes) ?? 'image/webp';
        thumbKey = `posts/${postId}/thumb.${extForMediaType(thumbType)}`;
        await env.MEDIA.put(thumbKey, thumbBytes, { httpMetadata: { contentType: thumbType } });
      } catch { thumbKey = null; }
    }

    const cand = rowToCandidate(row, dayStart, lat, lng, link);
    const description = buildDescription(cand);
    await doSavePost(env as unknown as Env, { id: userId }, postId, 'photo', lat, lng, description,
      mediaKey, thumbKey, createdAt, true, link, row.external_id, Boolean(existing), row.is_sold_out === 1,
      showtimesJson(cand), showtimeBookingJson(cand), tagsJson(cand),
      pendingGeo || provider.pendingByDefault ? STATUS_PENDING : STATUS_APPROVED,
      row.partner_id, row.partner_name, row.price_pln);

    await env.DB.prepare(`UPDATE seed_raw SET status='done', post_id=?, reason=NULL, updated_at=? WHERE id=?`)
      .bind(postId, now(), row.id)
      .run();
    return { postId, skipped: false, pendingGeo };
  } catch (e) {
    await env.DB.prepare(`UPDATE seed_raw SET status='error', reason=?, updated_at=? WHERE id=?`)
      .bind((e as Error).message, now(), row.id)
      .run();
    throw e;
  }
}

/** Rebuild the candidate view a row was written from (description + JSON helpers). */
function rowToCandidate(row: RawWinnerRow, dayStart: number, lat: number, lng: number, link: string): SeedCandidate {
  const times = parseJsonArray<string>(row.showtimes);
  return {
    source: row.provider as SeedCandidate['source'],
    externalId: row.external_id,
    title: row.title,
    startMs: dayStart + row.start_min * 60_000,
    lat, lng,
    city: row.city || '',
    venue: row.raw_venue,
    address: '',
    link,
    mediaUrl: row.media_url || '',
    thumbUrl: row.thumb_url,
    isSoldOut: row.is_sold_out === 1,
    times: times.length > 0 ? times : undefined,
    showtimeBooking: parseJsonArray<ShowtimeBooking>(row.showtime_booking),
    tags: parseJsonArray<string>(row.tags),
    partnerId: row.partner_id || undefined,
    partnerName: row.partner_name || undefined,
    price: row.price_pln,
    affiliateLink: row.affiliate_link || undefined,
  };
}
