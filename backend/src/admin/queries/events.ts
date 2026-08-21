// Events query builders + aggregates (category='events').
import { CITIES, cityBbox } from '../cities';

export interface EventFilter {
  cityId: string | null;
  source: string | null;
  status: string | null;
  from: string | null;
  to: string | null;
  tag: string | null;
  geo: string | null;
  fromMs: number | null;
  toMs: number | null;
  q?: string | null;
  sources?: string[] | null;
  limit: number;
  offset?: number;
}

// "Default bbox" geo = the seed fallback pin at a city's bbox center (CITIES lat/lng).
const GEO_DEFAULT_EPS = 0.002;

function eventsWhere(f: EventFilter): { where: string; binds: unknown[] } {
  let where = `p.category='events'`;
  const binds: unknown[] = [];
  const bbox = f.cityId ? cityBbox(f.cityId) : null;
  if (bbox) { where += ' AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?'; binds.push(bbox.swLat, bbox.neLat, bbox.swLng, bbox.neLng); }
  if (f.source) { where += " AND substr(p.external_id,1,instr(p.external_id,'-')-1)=?"; binds.push(f.source); }
  if (f.sources && f.sources.length) {
    const ph = f.sources.map(() => '?').join(',');
    where += ` AND substr(p.external_id,1,instr(p.external_id,'-')-1) IN (${ph})`;
    binds.push(...f.sources);
  }
  if (f.status) { where += ' AND p.status=?'; binds.push(f.status); }
  if (f.from) { where += ' AND p.event_date >= ?'; binds.push(f.from); }
  if (f.to) { where += ' AND p.event_date <= ?'; binds.push(f.to); }
  if (f.tag) { where += f.tag === 'none' ? ' AND (p.tags IS NULL OR p.tags = ?)' : ' AND p.tags LIKE ?'; binds.push(f.tag === 'none' ? '[]' : `%"${f.tag}"%`); }
  if (f.q) { where += ' AND (p.description LIKE ? OR p.external_id LIKE ?)'; binds.push(`%${f.q}%`, `%${f.q}%`); }
  if (f.geo === 'default') {
    const eps = GEO_DEFAULT_EPS;
    const ors = CITIES.map((c) => `(ABS(p.lat - ${c.lat}) < ${eps} AND ABS(p.lng - ${c.lng}) < ${eps})`).join(' OR ');
    where += ` AND (${ors})`;
  }
  if (f.geo === 'locked') { where += ' AND p.geo_locked = 1'; }
  if (f.geo === 'none') { where += ' AND (p.lat IS NULL OR p.lng IS NULL)'; }
  if (f.fromMs) { where += ' AND p.created_at>=?'; binds.push(f.fromMs); }
  if (f.toMs) { where += ' AND p.created_at<=?'; binds.push(f.toMs); }
  return { where, binds };
}

// Build SQL + binds for events, with optional city bbox + date window.
export function eventsSql(f: EventFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = eventsWhere(f);
  const offset = f.offset ?? 0;
  return {
    sql: `SELECT p.id, p.external_id, p.description, p.created_at, p.status, p.link_url,
          p.thumb_key, p.media_key, p.tags, p.event_date, p.showtimes, p.showtime_booking,
          p.lat, p.lng, p.is_sold_out, p.geo_locked, p.tags_locked, p.rejection_reason,
          substr(p.external_id,1,instr(p.external_id,'-')-1) AS source
          FROM posts p WHERE ${where} ORDER BY p.event_date DESC, p.created_at DESC LIMIT ? OFFSET ?`,
    binds: [...binds, f.limit, offset],
  };
}

// Count query matching eventsSql filters — used for pagination.
export function eventsCountSql(f: EventFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = eventsWhere(f);
  return { sql: `SELECT COUNT(*) AS n FROM posts p WHERE ${where}`, binds };
}

// Event status counts (all-time, category='events') for the doughnut + KPIs.
export async function eventStatusBreakdown(db: D1Database): Promise<{ approved: number; pending: number; rejected: number }> {
  const { results } = await db.prepare(
    "SELECT status, COUNT(*) n FROM posts WHERE category='events' GROUP BY status"
  ).all<{ status: string; n: number }>();
  const r: Record<string, number> = { approved: 0, pending: 0, rejected: 0 };
  for (const x of results ?? []) if (x.status in r) r[x.status] = x.n;
  return r as unknown as { approved: number; pending: number; rejected: number };
}

// Per-source event counts (source = external_id prefix).
export async function eventSourceBreakdown(db: D1Database): Promise<{ source: string; n: number }[]> {
  const { results } = await db.prepare(
    "SELECT substr(external_id,1,instr(external_id,'-')-1) AS source, COUNT(*) AS n FROM posts WHERE category='events' GROUP BY source ORDER BY n DESC"
  ).all<{ source: string; n: number }>();
  return results ?? [];
}
