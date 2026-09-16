import { CONFIG, type TravelTag } from '../config/index';
import { Hono } from 'hono';
import { buildPlaces, isPlaceKind, paginatePlaces } from '../travel/places';
import { fetchRyanairWindow, fetchWizzairWindow } from '../travel/flightsApi';
import { reachableEvents, type TravelEventRow } from '../travel/reachability';

export const travelRoutes = new Hono<{ Bindings: Env }>();


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
  if (to - from > CONFIG.travel.api.maxWindowMs) return c.json({ error: 'Window too large' }, 400);
  const hasTagFilter = q.tags !== undefined || q.tag !== undefined;
  let tagCond = '';
  let tagBinds: string[] = [];
  if (hasTagFilter) {
    const requested = String(q.tags ?? q.tag ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = requested.filter((t) => CONFIG.travel.tags.set.has(t as TravelTag));
    if (tags.length === 0) return c.json({ events: [] });
    tagCond = 'AND (' + tags.map(() => 'tag = ?').join(' OR ') + ')';
    tagBinds = tags;
  }
  const limit = parseLimit(q.limit);
  const origin = q.origin && CONFIG.travel.api.iataPattern.test(q.origin) ? q.origin.toUpperCase() : null;

  const { results } = await c.env.DB
    .prepare(
      `SELECT provider, external_id, title, lat, lng, city, country, start_ms, tag, link, meta
       FROM travel_events
       WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       AND start_ms >= ? AND start_ms <= ?
       ${tagCond}
       ORDER BY start_ms
       LIMIT ${limit}`
    )
    .bind(bbox.swLat, bbox.neLat, bbox.swLng, bbox.neLng, from, to, ...tagBinds)
    .all<{ city: string }>();

  const events = (results ?? []) as TravelEventRow[];

  if (origin) {
    const reachable = await reachableEvents(origin, events, c.env.DB);
    return c.json({ events: reachable });
  }
  return c.json({ events });
});

// Europe-wide per-day tag counts for the Wycieczki filter chips. Scope is the
// WHOLE of Europe (no bbox) for the requested day window, independent of the
// currently selected tag — mirrors /stories/tag-counts for the Events chips.
travelRoutes.get('/tag-counts', async (c) => {
  const q = c.req.query();
  const from = Number(q.from);
  const to = Number(q.to);
  if (!isFinite(from) || !isFinite(to) || to <= from) return c.json({ error: 'Invalid or missing from/to (epoch ms)' }, 400);
  if (to - from > CONFIG.travel.api.maxWindowMs) return c.json({ error: 'Window too large' }, 400);
  const { results } = await c.env.DB
    .prepare(`SELECT tag, COUNT(*) AS count FROM travel_events WHERE start_ms >= ? AND start_ms <= ? GROUP BY tag`)
    .bind(from, to)
    .all<{ tag: string; count: number }>();
  const counts = (results ?? []).filter((r) => CONFIG.travel.tags.set.has(r.tag as TravelTag));
  const total = counts.reduce((a, r) => a + r.count, 0);
  return c.json({ total, counts });
});

function parseLimit(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), CONFIG.travel.api.maxLimit) : CONFIG.travel.api.maxLimit;
}

travelRoutes.get('/places', (c) => {
  const q = c.req.query();
  const kind = q.kind ?? '';
  if (!isPlaceKind(kind)) {
    return c.json({ error: 'kind must be hotel|attraction|car|insurance' }, 400);
  }
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return c.json({ error: 'valid lat and lng required' }, 400);
  }
  const all = buildPlaces(kind, lat, lng);
  return c.json(paginatePlaces(all, Number(q.offset) || 0, Number(q.limit)));
});

function flightParams(q: Record<string, string | undefined>): { origin: string; destination: string; eventDay: string } | null {
  const origin = q.origin?.toUpperCase() ?? '';
  const destination = q.destination?.toUpperCase() ?? '';
  const eventDay = q.eventDay ?? '';
  if (!CONFIG.travel.api.iataPattern.test(origin) || !CONFIG.travel.api.iataPattern.test(destination) || !/^\d{4}-\d{2}-\d{2}$/.test(eventDay)) return null;
  return { origin, destination, eventDay };
}

async function flightHandler(c: any, airline: 'ryanair' | 'wizzair'): Promise<Response> {
  const q = c.req.query();
  const params = flightParams(q);
  if (!params) return c.json({ error: 'origin, destination, eventDay required (IATA, YYYY-MM-DD)' }, 400);
  try {
    const window = airline === 'ryanair'
      ? await fetchRyanairWindow(params.origin, params.destination, params.eventDay, c.env.DB)
      : await fetchWizzairWindow(params.origin, params.destination, params.eventDay);
    return c.json(window);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
}

travelRoutes.get('/flights/ryanair', (c) => flightHandler(c, 'ryanair'));
travelRoutes.get('/flights/wizzair', (c) => flightHandler(c, 'wizzair'));