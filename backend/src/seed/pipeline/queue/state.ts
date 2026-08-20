// D1 persistence helpers for the seed queue pipeline: batch/scope state reads +
// writes, the seed user, and the candidate row → SeedCandidate mapper.
import { nanoid } from 'nanoid';
import { CandidateStatus, ProviderId, SeedCandidate } from '../../core/types';
import { SEED_DEVICE_ID } from '../../core/constants';
import { EnvQ, SeedScopeRow } from './types';

export function now(): number { return Date.now(); }

export interface CandRow {
  id: string; batch_id: string; external_id: string; provider: ProviderId; title: string; start_ms: number;
  lat: number | null; lng: number | null; city: string; venue: string; address: string;
  link: string; media_url: string | null; thumb_url: string | null;
  status?: CandidateStatus; is_sold_out?: number; geo_ref?: string | null; showtimes?: string | null;
  showtime_booking?: string | null; tags?: string | null;
}

export interface BatchRow {
  id: string; day: string; status: string; run_type: 'cron' | 'manual';
}

export async function getOrCreateSeedUser(db: D1Database): Promise<{ id: string }> {
  const existing = await db.prepare('SELECT id FROM users WHERE device_id = ?').bind(SEED_DEVICE_ID).first<{ id: string }>();
  if (existing) return existing;
  const id = nanoid(16);
  await db.prepare('INSERT INTO users (id, device_id, session_token, role, username, auth_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, SEED_DEVICE_ID, nanoid(48), 'user', 'PanPeryskop Seed', 'device', now()).run();
  return { id };
}

export async function getBatch(env: EnvQ, batchId: string): Promise<BatchRow | null> {
  return env.DB.prepare('SELECT id, day, status, run_type FROM seed_batches WHERE id=?').bind(batchId).first<BatchRow>();
}

export async function setBatchStatus(env: EnvQ, batchId: string, status: string, reason?: string): Promise<void> {
  if (reason) {
    await env.DB.prepare('UPDATE seed_batches SET status=?, reason=?, updated_at=? WHERE id=?').bind(status, reason, now(), batchId).run();
  } else {
    await env.DB.prepare('UPDATE seed_batches SET status=?, updated_at=? WHERE id=?').bind(status, now(), batchId).run();
  }
}

export async function getScope(env: EnvQ, batchId: string, provider: string, scope: string): Promise<SeedScopeRow | null> {
  return env.DB.prepare('SELECT * FROM seed_scopes WHERE batch_id=? AND provider=? AND scope=?')
    .bind(batchId, provider, scope).first<SeedScopeRow>();
}

export async function listScopes(env: EnvQ, batchId: string): Promise<SeedScopeRow[]> {
  const { results } = await env.DB.prepare('SELECT * FROM seed_scopes WHERE batch_id=?').bind(batchId).all<SeedScopeRow>();
  return results || [];
}

export async function setScopeStatus(env: EnvQ, batchId: string, provider: string, scope: string, status: string, error?: string): Promise<void> {
  await env.DB.prepare('UPDATE seed_scopes SET status=?, error=?, updated_at=? WHERE batch_id=? AND provider=? AND scope=?')
    .bind(status, error ?? null, now(), batchId, provider, scope).run();
}

export async function bumpScopeAttempts(env: EnvQ, batchId: string, provider: string, scope: string): Promise<void> {
  await env.DB.prepare('UPDATE seed_scopes SET attempts=attempts+1, updated_at=? WHERE batch_id=? AND provider=? AND scope=?')
    .bind(now(), batchId, provider, scope).run();
}

export async function countNonTerminalCandidates(env: EnvQ, batchId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM seed_candidates WHERE batch_id=? AND status NOT IN ('${CandidateStatus.DONE}', '${CandidateStatus.DUPLICATE}', '${CandidateStatus.NO_MEDIA}', '${CandidateStatus.NO_COORDS}', '${CandidateStatus.ERROR}')`
  ).bind(batchId).first<{ n: number }>();
  return row?.n ?? 0;
}

export function toCandidate(row: CandRow, forDedupe = false): SeedCandidate {
  return {
    source: row.provider,
    externalId: forDedupe ? row.id : row.external_id,
    title: row.title, startMs: row.start_ms,
    lat: row.lat, lng: row.lng, city: row.city, venue: row.venue, address: row.address,
    link: row.link, mediaUrl: row.media_url || '', thumbUrl: row.thumb_url,
    isSoldOut: row.is_sold_out === 1,
    geoRef: row.geo_ref || null,
    times: row.showtimes ? (JSON.parse(row.showtimes) as string[]) : undefined,
    showtimeBooking: row.showtime_booking ? JSON.parse(row.showtime_booking) : undefined,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
  };
}
