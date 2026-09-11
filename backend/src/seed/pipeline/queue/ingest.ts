// Ingest winners from seed_raw: turn a reconciled winner row into a post
// (blacklist gate, deferred geo, media reuse, doSavePost upsert).
//
// Idempotent re-run: posts upsert by external_id (see doSavePost), and an
// already-done row short-circuits to its post without touching media or geo.
import { nanoid } from 'nanoid';
import { SeedCandidate, SeedProvider, ShowtimeBooking } from '../../core/types';
import { buildDescription, showtimesJson, showtimeBookingJson, tagsJson } from '../../core/eventFormat';
import { fallbackSeedGeo, resolveGeo } from '../../core/geo';
import { detectMediaType, extForMediaType } from '../../../core/mediaFormat';
import { doSavePost } from '../../../api/posts';
import { STATUS_APPROVED, STATUS_PENDING, POST_TYPE_PHOTO } from '../../../core/models';
import { findBlacklist, loadBlacklistRules, blacklistReason } from '../../core/blacklist';
import { configOf } from '../../providers/registry';
import { eventCreatedAtMs, eventDayEndMs, warsawMidnightMs } from '../../core/dates';
import { now } from './state';

export type RawIngestEnv = Env;

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
  lat: number | null;
  lng: number | null;
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
  pending_reason: string | null;
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

    // Geo: source coords (exact) → canonical venue → deferred resolver (store →
    // Nominatim) → CITY-CENTER fallback when the city is known. If we do not even
    // know the city, pin 0,0 and PENDING (never shown until the admin fixes it).
    let lat: number | null = typeof row.lat === 'number' ? row.lat : null;
    let lng: number | null = typeof row.lng === 'number' ? row.lng : null;
    if ((lat === null || lng === null) && row.canonical_venue_id) {
      const hit = await env.DB.prepare('SELECT lat, lng FROM venues WHERE id = ?')
        .bind(row.canonical_venue_id)
        .first<{ lat: number | null; lng: number | null }>();
      if (typeof hit?.lat === 'number' && typeof hit?.lng === 'number') {
        lat = hit.lat;
        lng = hit.lng;
      }
    }
    if (lat === null || lng === null) {
      const geo = await resolveGeo({
        name: row.raw_venue,
        city: row.city === null ? undefined : row.city,
        db: env.DB,
        provider: row.provider,
      });
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }
    const cityKnown = row.city !== null && row.city !== '';
    let geoPending = false;
    if (lat === null || lng === null) {
      if (cityKnown) {
        const fb = fallbackSeedGeo(row.city); // city center — exact venue unknown
        lat = fb.lat;
        lng = fb.lng;
      } else {
        lat = 0;
        lng = 0; // unknown city — PENDING, never shown
        geoPending = true;
      }
    }

    const existing = await env.DB.prepare('SELECT id, media_key, thumb_key FROM posts WHERE external_id=?')
      .bind(row.external_id)
      .first<{ id: string; media_key: string | null; thumb_key: string | null }>();
    const postId = existing === null || existing === undefined ? nanoid(24) : existing.id;

    // Missing link/image is NOT an error — it makes the post PENDING (kept).
    const mediaUrl = row.media_url === null ? '' : row.media_url;
    const link0 = row.link_url === null ? '' : row.link_url;

    const ctx = {
      env, day, dayStart,
      dayEnd: eventDayEndMs(day), createdAt,
      recordBrowserMs: (_ms: number) => {},
    };
    let link = link0;
    if (provider.resolveLink) {
      try {
        link = await provider.resolveLink(ctx, rowToCandidate(row, dayStart, lat, lng, link, mediaUrl));
      } catch { /* best-effort */ }
    }

    // Media mode is required registry config — no silent default.
    const providerConfig = configOf(provider.id);
    if (!providerConfig) throw new Error(`no registry config for provider ${provider.id}`);
    const mediaMode = providerConfig.media;
    let mediaKey: string | null = existing === null || existing === undefined ? null : existing.media_key;
    let thumbKey: string | null = existing === null || existing === undefined ? null : existing.thumb_key;
    let externalMediaUrl: string | null = null;
    let externalThumbUrl: string | null = null;
    if (mediaMode === 'hotlink') {
      // Store the source CDN URLs verbatim. A missing thumb stays NULL (the app
      // falls back to the full image at render time — that is display, not data);
      // a missing image is fine here — pending_reason already forces PENDING.
      externalMediaUrl = row.media_url;
      externalThumbUrl = row.thumb_url;
    } else {
      if (mediaKey === null && row.media_url !== null && row.media_url !== '') {
        const mediaBytes = await provider.fetchBytes(ctx, row.media_url);
        const mediaType = detectMediaType(mediaBytes);
        if (!mediaType || !mediaType.startsWith('image/')) {
          throw new Error(`bad media ${mediaType === null || mediaType === undefined ? 'unknown' : mediaType}`);
        }
        mediaKey = `posts/${postId}/media.${extForMediaType(mediaType)}`;
        await env.MEDIA.put(mediaKey, mediaBytes, { httpMetadata: { contentType: mediaType } });
      }
      if (thumbKey === null && row.thumb_url !== null) {
        try {
          const thumbBytes = await provider.fetchBytes(ctx, row.thumb_url);
          const thumbType = detectMediaType(thumbBytes);
          if (!thumbType) throw new Error('unknown thumb type');
          thumbKey = `posts/${postId}/thumb.${extForMediaType(thumbType)}`;
          await env.MEDIA.put(thumbKey, thumbBytes, { httpMetadata: { contentType: thumbType } });
        } catch { thumbKey = null; }
      }
    }

    // PENDING when content is incomplete, geo/city is unknown, or the provider
    // opts in. Missing price/thumb never affect it. All else is APPROVED.
    const contentPending = row.pending_reason !== null && row.pending_reason !== undefined && row.pending_reason !== '';
    const status = contentPending || geoPending || provider.pendingByDefault ? STATUS_PENDING : STATUS_APPROVED;

    const cand = rowToCandidate(row, dayStart, lat, lng, link, mediaUrl);
    const description = buildDescription(cand);
    await doSavePost(env, { id: userId }, postId, POST_TYPE_PHOTO, lat, lng, description,
      mediaKey, thumbKey, createdAt, true, link, row.external_id, Boolean(existing), row.is_sold_out === 1,
      showtimesJson(cand), showtimeBookingJson(cand), tagsJson(cand),
      status, row.partner_id, row.partner_name, row.price_pln, null, externalMediaUrl, externalThumbUrl);

    await env.DB.prepare(`UPDATE seed_raw SET status='done', post_id=?, reason=NULL, updated_at=? WHERE id=?`)
      .bind(postId, now(), row.id)
      .run();
    return { postId, skipped: false, pendingGeo: contentPending || geoPending };
  } catch (e) {
    await env.DB.prepare(`UPDATE seed_raw SET status='error', reason=?, updated_at=? WHERE id=?`)
      .bind((e as Error).message, now(), row.id)
      .run();
    throw e;
  }
}

/** Rebuild the candidate view a row was written from (description + JSON helpers). */
function rowToCandidate(row: RawWinnerRow, dayStart: number, lat: number, lng: number, link: string, mediaUrl: string): SeedCandidate {
  const times = parseJsonArray<string>(row.showtimes);
  return {
    source: row.provider as SeedCandidate['source'],
    externalId: row.external_id,
    title: row.title,
    startMs: dayStart + row.start_min * 60_000,
    lat, lng,
    city: row.city === null ? '' : row.city,
    venue: row.raw_venue,
    address: '',
    link,
    mediaUrl,
    thumbUrl: row.thumb_url,
    isSoldOut: row.is_sold_out === 1,
    times: times.length > 0 ? times : undefined,
    showtimeBooking: parseJsonArray<ShowtimeBooking>(row.showtime_booking),
    tags: parseJsonArray<string>(row.tags),
    partnerId: row.partner_id === null ? undefined : row.partner_id,
    partnerName: row.partner_name === null ? undefined : row.partner_name,
    price: row.price_pln,
    affiliateLink: row.affiliate_link === null ? undefined : row.affiliate_link,
  };
}
