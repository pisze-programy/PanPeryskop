// Media requests query builders.
import { cityBbox } from '../cities';

export interface MediaRequestFilter {
  days: number;
  cityId?: string | null;
  userId?: string | null;
  fromMs?: number | null;
  toMs?: number | null;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

function mediaRequestsWhere(f: MediaRequestFilter): { where: string; binds: unknown[] } {
  const since = Date.now() - f.days * 86_400_000;
  const where: string[] = ['r.created_at>=?'];
  const binds: unknown[] = [since];
  if (f.cityId) {
    const bbox = cityBbox(f.cityId);
    if (bbox) { where.push('r.lat BETWEEN ? AND ? AND r.lng BETWEEN ? AND ?'); binds.push(bbox.swLat, bbox.neLat, bbox.swLng, bbox.neLng); }
  }
  if (f.userId) { where.push('r.user_id=?'); binds.push(f.userId); }
  if (f.fromMs) { where.push('r.created_at>=?'); binds.push(f.fromMs); }
  if (f.toMs) { where.push('r.created_at<=?'); binds.push(f.toMs); }
  if (f.activeOnly) { where.push('r.created_at>=?'); binds.push(Date.now() - 4 * 3_600_000); }
  return { where: where.join(' AND '), binds };
}

export function mediaRequestsSql(f: MediaRequestFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = mediaRequestsWhere(f);
  const offset = f.offset ?? 0;
  return {
    sql: `SELECT r.id, r.lat, r.lng, r.created_at, r.user_id, COALESCE(NULLIF(u.username,''), u.device_id) AS user
          FROM media_requests r JOIN users u ON r.user_id=u.id
          WHERE ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    binds: [...binds, f.limit ?? 50, offset],
  };
}

export function mediaRequestsCountSql(f: MediaRequestFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = mediaRequestsWhere(f);
  return { sql: `SELECT COUNT(*) n FROM media_requests r WHERE ${where}`, binds };
}
