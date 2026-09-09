import { Hono } from 'hono';
import { TRAVEL_TAGS, TravelTag } from '../travel/constants';

export const travelRoutes = new Hono<{ Bindings: Env }>();

const MAX_WINDOW_MS = 370 * 24 * 3_600_000;
const MAX_LIMIT = 1000;

interface BBox {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

function parseBBox(q: Record<string, string | undefined>): BBox | null {
  const num = (v: string | undefined) => {
    if (v === undefined) return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const swLat = num(q.sw_lat), swLng = num(q.sw_lng), neLat = num(q.ne_lat), neLng = num(q.ne_lng);
  if (!isFinite(swLat) || !isFinite(swLng) || !isFinite(neLat) || !isFinite(neLng)) return null;
  if (neLat <= swLat || neLng <= swLng) return null;
  if (Math.abs(swLat) > 90 || Math.abs(neLat) > 90 || Math.abs(swLng) > 180 || Math.abs(neLng) > 180) return null;
  return { swLat, swLng, neLat, neLng };
}

travelRoutes.get('/events', async (c) => {
  const q = c.req.query();
  const bbox = parseBBox(q);
  if (!bbox) return c.json({ error: 'Invalid or missing bbox' }, 400);
  const from = Number(q.from);
  const to = Number(q.to);
  if (!isFinite(from) || !isFinite(to) || to <= from) return c.json({ error: 'Invalid or missing from/to (epoch ms)' }, 400);
  if (to - from > MAX_WINDOW_MS) return c.json({ error: 'Window too large' }, 400);
  const tag = parseTag(q.tag);
  const limit = q.limit ? Math.min(Number(q.limit), MAX_LIMIT) : MAX_LIMIT;

  const { results } = await c.env.DB
    .prepare(
      `SELECT provider, external_id, title, lat, lng, city, country, start_ms, tag, link
       FROM travel_events
       WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       AND start_ms >= ? AND start_ms <= ?
       ${tag ? 'AND tag = ?' : ''}
       ORDER BY start_ms
       LIMIT ${limit}`
    )
    .bind(bbox.swLat, bbox.neLat, bbox.swLng, bbox.neLng, from, to, ...(tag ? [tag] : []))
    .all();

  return c.json({ events: results ?? [] });
});

function parseTag(raw: string | undefined): TravelTag | null {
  if (!raw) return null;
  if (TRAVEL_TAGS.has(raw as TravelTag)) return raw as TravelTag;
  return null;
}