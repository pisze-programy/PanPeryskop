// Manual Facebook ingest — the browser addon scrapes the FB events feed and
// uploads each event via POST /admin/seed/facebook. This module is the
// authoritative ingest path: cross-provider dedupe (facebook rank in the
// registry), geo resolution (shared resolveGeo), R2 media, and the post save.
// All DB-free logic is a pure function (testable); the Hono routes in
// api/facebookSeed.ts only parse/validate the form.
import { nanoid } from 'nanoid';
import { priorityOf } from '../providers/registry';
import { ProviderId } from '../core/types';
import { containment, titleTokens, venuesMatch, isUkrainian } from '../core/match';
import { eventCreatedAtMs, warsawDateOf } from '../core/dates';
import { buildDescription, showtimesJson, tagsJson } from '../core/dedupe';
import { resolveGeo, fallbackSeedGeo } from '../core/geo';
import { detectMediaType, extForMediaType } from '../../core/mediaFormat';
import { doSavePost } from '../../api/posts';
import { STATUS_APPROVED, STATUS_PENDING, STATUS_REJECTED } from '../../core/models';
import { getOrCreateSeedUser } from '../pipeline/queue/state';
import { writeSeedRun } from '../core/log';

export const FACEBOOK_SOURCE = ProviderId.FACEBOOK;

/** A cross-provider comparison shape (what the guard matches on). */
export interface Matchable {
  source: string;
  title: string;
  venue: string;
  lat: number | null;
  lng: number | null;
  startMs: number;
}

/** An existing event post, reduced to what the guard needs (plus the row id). */
export interface ExistingEvent {
  postId: string;
  externalId: string;
  link: string | null;
  m: Matchable;
}

export interface IngestInput {
  title: string;
  startMs: number;
  venue: string;
  address: string;
  city: string;
  link: string;
  externalId: string;
  tags?: string[];
  times?: string[];
  file: Uint8Array;
  thumb: Uint8Array | null;
}

export interface PreviewInput {
  externalId: string;
  title: string;
  startMs: number;
  venue: string;
}

export type IngestStatus = 'pending' | 'duplicate' | 'no_coords' | 'error';

export interface WinnerInfo {
  provider: string;
  title: string;
  link: string | null;
  externalId: string;
}

export interface IngestResult {
  status: IngestStatus;
  postId?: string;
  lat?: number;
  lng?: number;
  /** How the coordinates were obtained: real | city_fallback | zero_fallback. */
  geo?: 'real' | 'city_fallback' | 'zero_fallback';
  reason?: string;
  winner?: WinnerInfo;
}

/**
 * Geo fallback for facebook events whose venue can't be geocoded. Better to have
 * the event in the right city (or at a clearly-wrong 0,0) than to drop it: the
 * admin moderates per day and fixes the pin. Known city → its CITIES center
 * (matches the admin "Fallback bbox" filter); otherwise → 0,0.
 */
export const fallbackGeo = fallbackSeedGeo;

export interface PreviewResult {
  externalId: string;
  duplicate: boolean;
  winner: WinnerInfo | null;
}

export interface GeoPreviewInput {
  externalId: string;
  venue: string;
  address: string;
  city: string;
}

export interface GeoPreviewResult {
  externalId: string;
  lat: number | null;
  lng: number | null;
  resolved: boolean;
  /** why geo failed — lets the summary tell the user what to fix */
  reason?: 'no_city' | 'no_geo';
}

// ---------- description reconstruction (existing post -> matchable) ----------

/** "Title: 21:00, Venue, Street" (seed description format) -> { title, loc }. */
export function parseDescription(description: string): { title: string; loc: string } | null {
  const m = /^(.+?): \d{2}:\d{2}, (.*)$/.exec(description || '');
  if (!m) return null;
  return { title: m[1], loc: m[2] };
}

/** First comma segment of the location string = the venue name. */
export function venueFromLoc(loc: string): string {
  return loc.split(',')[0].trim();
}

/** Provider prefix of an external_id ("dzisapp-123-…" -> "dzisapp"). */
export function sourceFromExternalId(externalId: string | null): string {
  if (!externalId) return 'unknown';
  return externalId.split('-')[0];
}

export function postToMatchable(row: {
  external_id: string | null;
  description: string;
  lat: number | null;
  lng: number | null;
  created_at: number;
}): Matchable {
  const parsed = parseDescription(row.description);
  return {
    source: sourceFromExternalId(row.external_id),
    title: parsed?.title ?? row.description,
    venue: parsed ? venueFromLoc(parsed.loc) : '',
    lat: row.lat,
    lng: row.lng,
    startMs: row.created_at,
  };
}

// ---------- dedupe guard ----------

/** Canonical rank of an arbitrary source string (unknown -> last). */
export function rankOf(source: string): number {
  return priorityOf(source as ProviderId);
}

/** Same dedupe rule as core/dedupe R3: token containment (>=0.8) + venue match. */
export function matchesExisting(cand: Matchable, existing: Matchable): boolean {
  const a = titleTokens(cand.title, cand.venue);
  const b = titleTokens(existing.title, existing.venue);
  if (!containment(a, b, 0.8)) return false;
  return venuesMatch(cand, existing);
}

/**
 * Guard verdict for a facebook candidate vs the day's existing event posts.
 * - null            -> no match, facebook is unique.
 * - 'facebook'      -> matched, but facebook outranks every match (ingest + reject).
 * - ExistingEvent   -> that post outranks facebook (skip as duplicate).
 */
export function findWinner(cand: Matchable, existing: ExistingEvent[]): ExistingEvent | 'facebook' | null {
  const matches = existing.filter((e) => matchesExisting(cand, e.m));
  if (matches.length === 0) return null;
  const best = [cand, ...matches.map((e) => e.m)].sort((x, y) =>
    rankOf(x.source) - rankOf(y.source) ||
    (isUkrainian(x.title) ? 1 : 0) - (isUkrainian(y.title) ? 1 : 0) ||
    x.startMs - y.startMs
  )[0];
  if (best === cand) return 'facebook';
  return matches.find((e) => e.m === best) ?? matches[0];
}

// ---------- D1 + R2 + save ----------

export async function loadDayEvents(db: D1Database, day: string): Promise<ExistingEvent[]> {
  const { results } = await db
    .prepare(
      `SELECT id, external_id, link_url, description, lat, lng, created_at
       FROM posts WHERE category='events' AND status=? AND event_date=?`
    )
    .bind(STATUS_APPROVED, day)
    .all<{
      id: string; external_id: string | null; link_url: string | null;
      description: string; lat: number | null; lng: number | null; created_at: number;
    }>();
  return (results || []).map((r) => ({
    postId: r.id,
    externalId: r.external_id ?? '',
    link: r.link_url,
    m: postToMatchable(r),
  }));
}

export async function rejectPosts(db: D1Database, postIds: string[]): Promise<void> {
  for (const id of postIds) {
    await db
      .prepare('UPDATE posts SET status=?, rejection_reason=? WHERE id=?')
      .bind(STATUS_REJECTED, 'dedupe: facebook wins', id)
      .run();
  }
}

/** Look up an existing post by external_id (keeps id + media path stable on re-seed). */
async function existingByExternalId(db: D1Database, externalId: string): Promise<{ id: string } | null> {
  return db.prepare('SELECT id FROM posts WHERE external_id=?').bind(externalId).first<{ id: string }>();
}

export async function previewFacebookEvents(env: Env, events: PreviewInput[]): Promise<PreviewResult[]> {
  const out: PreviewResult[] = [];
  for (const ev of events) {
    const day = warsawDateOf(ev.startMs);
    const existing = await loadDayEvents(env.DB, day);
    const cand: Matchable = {
      source: FACEBOOK_SOURCE, title: ev.title, venue: ev.venue, lat: null, lng: null, startMs: ev.startMs,
    };
    const winner = findWinner(cand, existing);
    out.push({
      externalId: ev.externalId,
      duplicate: winner !== null && winner !== 'facebook',
      winner: winner !== null && winner !== 'facebook'
        ? { provider: winner.m.source, title: winner.m.title, link: winner.link, externalId: winner.externalId }
        : null,
    });
  }
  return out;
}

/**
 * Geo preview for the summary: resolve each location (shared resolveGeo, paced).
 * A missing city is a hard stop — Nominatim free-form picks a RANDOM city for a
 * bare street/venue name (Kordeckiego 12 -> Warsaw, "Wilczek" -> Wrocław), so we
 * refuse to geocode rather than pin an event to the wrong city.
 */
export async function previewGeo(env: Env, events: GeoPreviewInput[]): Promise<GeoPreviewResult[]> {
  const out: GeoPreviewResult[] = [];
  for (const ev of events) {
    if (!(ev.city || '').trim()) {
      out.push({ externalId: ev.externalId, lat: null, lng: null, resolved: false, reason: 'no_city' });
      continue;
    }
    const geo = await resolveGeo({
      name: ev.venue, address: ev.address, city: ev.city, db: env.DB, provider: FACEBOOK_SOURCE,
    });
    out.push({
      externalId: ev.externalId,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      resolved: Boolean(geo),
      reason: geo ? undefined : 'no_geo',
    });
  }
  return out;
}

export async function ingestFacebookEvent(env: Env, input: IngestInput): Promise<IngestResult> {
  const t0 = Date.now();
  const day = warsawDateOf(input.startMs);
  const existing = await loadDayEvents(env.DB, day);
  const cand: Matchable = {
    source: FACEBOOK_SOURCE, title: input.title, venue: input.venue, lat: null, lng: null, startMs: input.startMs,
  };
  const winner = findWinner(cand, existing);
  if (winner !== null && winner !== 'facebook') {
    return {
      status: 'duplicate',
      winner: { provider: winner.m.source, title: winner.m.title, link: winner.link, externalId: winner.externalId },
    };
  }

  // Geo: prefer a real resolution; fall back to the city center when the city is
  // known, else 0,0. Never guess a random pin for a bare street/venue name — when
  // the city is unknown we skip Nominatim entirely (0,0 marks "fix in admin").
  const fb = fallbackGeo(input.city);
  const geo = (input.city || '').trim()
    ? await resolveGeo({
        name: input.venue, address: input.address, city: input.city, db: env.DB, provider: FACEBOOK_SOURCE,
        fallback: fb,
      })
    : { lat: fb.lat, lng: fb.lng, address: '' };
  if (!geo) return { status: 'error', reason: 'geo-failed' };
  const geoKind: 'real' | 'city_fallback' | 'zero_fallback' =
    geo.lat === fb.lat && geo.lng === fb.lng
      ? fb.lat === 0 && fb.lng === 0 ? 'zero_fallback' : 'city_fallback'
      : 'real';

  if (winner === 'facebook') {
    const matched = existing.filter((e) => matchesExisting(cand, e.m));
    await rejectPosts(env.DB, matched.map((e) => e.postId));
  }

  const mediaType = detectMediaType(input.file);
  if (!mediaType || !mediaType.startsWith('image/')) return { status: 'error' };

  const existingPost = await existingByExternalId(env.DB, input.externalId);
  const postId = existingPost?.id ?? nanoid(24);
  const isUpdate = Boolean(existingPost);

  const mediaKey = `posts/${postId}/media.${extForMediaType(mediaType)}`;
  await env.MEDIA.put(mediaKey, input.file, { httpMetadata: { contentType: mediaType } });

  let thumbKey: string | null = null;
  if (input.thumb && input.thumb.length > 0) {
    const thumbType = detectMediaType(input.thumb) ?? 'image/jpeg';
    thumbKey = `posts/${postId}/thumb.${extForMediaType(thumbType)}`;
    await env.MEDIA.put(thumbKey, input.thumb, { httpMetadata: { contentType: thumbType } });
  }

  const user = await getOrCreateSeedUser(env.DB);
  const seedCand = {
    source: FACEBOOK_SOURCE, externalId: input.externalId, title: input.title,
    startMs: input.startMs, lat: geo.lat, lng: geo.lng, city: input.city,
    venue: input.venue, address: input.address, link: input.link,
    mediaUrl: '', thumbUrl: null, times: input.times, tags: input.tags,
  };
  const createdAt = eventCreatedAtMs(day);
  await doSavePost(
    env, user, postId, 'photo', geo.lat, geo.lng, buildDescription(seedCand as never),
    mediaKey, thumbKey, createdAt, true, input.link, input.externalId, isUpdate, false,
    showtimesJson(seedCand as never), null, tagsJson(seedCand as never), STATUS_PENDING,
  );

  await writeSeedRun(env, {
    runType: 'manual', day, provider: FACEBOOK_SOURCE, transport: 'manual',
    candidates: 1, ingested: 1, skipped: 0, errors: 0, errorDetail: null,
    durationMs: Date.now() - t0, browserMs: 0,
  });

  return { status: 'pending', postId, lat: geo.lat, lng: geo.lng, geo: geoKind };
}
