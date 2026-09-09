// Manual MTP (Targi Poznańskie) ingest — the annual calendar is pulled once a year
// by hand (backend/scripts/mtp-backfill.mjs) and each day of each Poznań fair is
// posted via POST /admin/seed/mtp. Geo is FIXED (the MTP complex in Poznań — the
// user provided the coordinates); no geocoding. Every event starts 10:00 Warsaw.
import { nanoid } from 'nanoid';
import { ProviderId } from '../core/types';
import { eventCreatedAtMs, warsawMidnightMs } from '../core/dates';
import { buildDescription, showtimesJson, tagsJson } from '../core/eventFormat';
import { detectMediaType, extForMediaType } from '../../core/mediaFormat';
import { doSavePost } from '../../api/posts';
import { STATUS_APPROVED, POST_TYPE_PHOTO } from '../../core/models';
import { getOrCreateSeedUser } from '../pipeline/queue/state';
import { writeSeedRun } from '../core/log';
import { loadDayEvents, findWinner, matchesExisting, rejectPosts } from './facebook';

export const MTP_GEO = { lat: 52.40348664284927, lng: 16.91105358308765 };

/** One day of one fair (externalId = mtp-<slug>-<day>). */
export interface MtpEventInput {
  externalId: string;
  title: string;
  /** YYYY-MM-DD (start 10:00 Warsaw). */
  day: string;
  link: string;
  imageUrl: string;
  /** Optional pre-downloaded image (base64) — the Worker fetch of static.mtp.pl
   *  intermittently gets an HTML error page for some files; the backfill script
   *  downloads them reliably and ships the bytes. When absent, the Worker fetches. */
  imageData?: string;
  venue?: string;
  address?: string;
  city?: string;
}

export interface MtpIngestResult {
  externalId: string;
  status: 'ok' | 'duplicate' | 'error' | 'no_media';
  postId?: string;
  reason?: string;
  winner?: { provider: string; title: string; link: string | null; externalId: string };
}

export async function ingestMtpEvent(env: Env, input: MtpEventInput): Promise<MtpIngestResult> {
  const t0 = Date.now();
  const day = input.day;
  const startMs = warsawMidnightMs(day) + 10 * 3600 * 1000; // 10:00 Warsaw
  const existing = await loadDayEvents(env.DB, day);
  const cand = {
    source: ProviderId.MTP,
    title: input.title,
    venue: input.venue || 'Międzynarodowe Targi Poznańskie',
    lat: MTP_GEO.lat,
    lng: MTP_GEO.lng,
    startMs,
  };
  // findWinner returns 'facebook' when the CANDIDATE wins (the label is a generic
  // "candidate wins" marker); an ExistingEvent means that post outranks MTP.
  const winner = findWinner(cand, existing);
  if (winner !== null && winner !== 'facebook') {
    return {
      externalId: input.externalId,
      status: 'duplicate',
      winner: { provider: winner.m.source, title: winner.m.title, link: winner.link, externalId: winner.externalId },
    };
  }
  if (winner === 'facebook') {
    // MTP wins dedupe against same-title/venue posts on the day (rare for fairs).
    const matched = existing.filter((e) => matchesExisting(cand, e.m));
    await rejectPosts(env.DB, matched.map((e) => e.postId));
  }

  let bytes: Uint8Array;
  const existingPost = await env.DB.prepare('SELECT id, media_key FROM posts WHERE external_id=?').bind(input.externalId).first<{ id: string; media_key: string | null }>();
  const postId = existingPost?.id ?? nanoid(24);
  const isUpdate = Boolean(existingPost);
  // Reuse stored media on re-runs — re-downloading every image on a retry trips
  // static.mtp.pl's burst throttle (it 429/502s after ~100 rapid requests).
  let mediaKey: string | null = existingPost?.media_key ?? null;
  if (!mediaKey) {
    try {
      if (input.imageData) {
        bytes = Uint8Array.from(atob(input.imageData), (c) => c.charCodeAt(0));
      } else {
        const res = await fetch(input.imageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`media ${res.status}`);
        bytes = new Uint8Array(await res.arrayBuffer());
      }
    } catch (e) {
      return { externalId: input.externalId, status: 'error', reason: (e as Error).message };
    }
    const mediaType = detectMediaType(bytes);
    if (!mediaType || !mediaType.startsWith('image/')) return { externalId: input.externalId, status: 'no_media' };
    mediaKey = `posts/${postId}/media.${extForMediaType(mediaType)}`;
    await env.MEDIA.put(mediaKey, bytes, { httpMetadata: { contentType: mediaType } });
  }

  const user = await getOrCreateSeedUser(env.DB);
  const seedCand = {
    source: ProviderId.MTP,
    externalId: input.externalId,
    title: input.title,
    startMs,
    lat: MTP_GEO.lat,
    lng: MTP_GEO.lng,
    city: input.city || 'Poznań',
    venue: input.venue || 'Międzynarodowe Targi Poznańskie',
    address: input.address || '',
    link: input.link,
    mediaUrl: '',
    thumbUrl: null,
    times: ['10:00'],
    tags: ['inne'],
  };
  const createdAt = eventCreatedAtMs(day);
  await doSavePost(
    env, user, postId, POST_TYPE_PHOTO, MTP_GEO.lat, MTP_GEO.lng, buildDescription(seedCand as never),
    mediaKey, mediaKey, createdAt, true, input.link, input.externalId, isUpdate, false,
    showtimesJson(seedCand as never), null, tagsJson(seedCand as never), STATUS_APPROVED,
  );

  await writeSeedRun(env, {
    runType: 'manual', day, provider: ProviderId.MTP, transport: 'manual',
    candidates: 1, ingested: 1, skipped: 0, errors: 0, errorDetail: null,
    durationMs: Date.now() - t0, browserMs: 0,
  });

  return { externalId: input.externalId, status: 'ok', postId };
}
