import { CONFIG, type TravelTag } from '../config/index';
import { Hono } from 'hono';
import { isPlaceKind, type TravelPlace } from '../travel/places';
import { fetchRyanairWindow, fetchWizzairWindow } from '../travel/flightsApi';
import { reachableEvents, type TravelEventRow } from '../travel/reachability';
import { viatorRandomCity, viatorProductsForCity, viatorConfigured, viatorWindowFor } from '../travel/viator';
import { staysWidgetUrl, type StayTheme, type StayView } from '../travel/stay22';
import { addDaysWarsaw } from '../seed/core/dates';

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

travelRoutes.get('/places', async (c) => {
  const q = c.req.query();
  const kind = q.kind ?? '';
  if (!isPlaceKind(kind)) {
    return c.json({ error: 'kind must be attraction' }, 400);
  }
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return c.json({ error: 'valid lat and lng required' }, 400);
  }
  const offset = Math.max(0, Number(q.offset) || 0);
  const limit = Number(q.limit) > 0 ? Math.floor(Number(q.limit)) : 15;
  const viator = await viatorAttractions(c.env, lat, lng, q.day, offset, limit);
  return c.json(viator);
});

const noPlaces = { places: [] as TravelPlace[], total: 0, hasMore: false };

// Attractions never fall back to the local catalogue: invented places with
// GetYourGuide links are worse than an empty section.
async function viatorAttractions(
  env: Env,
  lat: number,
  lng: number,
  day: string | undefined,
  offset: number,
  limit: number,
): Promise<{ places: TravelPlace[]; total: number; hasMore: boolean }> {
  if (!viatorConfigured(env)) return noPlaces;
  try {
    const city = await viatorRandomCity(env.DB, lat, lng);
    if (!city) return noPlaces;
    const window = viatorWindowFor(day);
    const { places, total } = await viatorProductsForCity(env.DB, env, city.destinationId, window, offset, limit);
    return {
      places: places.map((p) => ({
        id: p.productCode,
        kind: 'attraction' as const,
        name: p.title,
        image: p.imageUrl ?? '',
        price: p.fromPrice === null ? 0 : Math.round(p.fromPrice),
        currency: p.currency ?? CONFIG.travel.viator.currency,
        address: city.name,
        lat: city.lat ?? lat,
        lng: city.lng ?? lng,
        link: p.productUrl,
        rating: p.rating ?? undefined,
        reviews: p.reviewCount ?? undefined,
        source: CONFIG.travel.viator.provider,
        durationMinutes: p.durationMinutes ?? undefined,
        badges: p.badges,
      })),
      total,
      hasMore: offset + places.length < total,
    };
  } catch (error) {
    console.error(`viator places failed: ${(error as Error).message}`);
    return noPlaces;
  }
}

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

// Stay22 hotel map widget URL. The app opens the URL, the widget does the rest.
travelRoutes.get('/stays-widget', (c) => {
  const q = c.req.query();
  const aid = c.env.STAY22_AID;
  if (!aid) return c.json({ error: 'STAY22_AID is not configured' }, 500);

  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(q.checkin ?? '') || !day.test(q.checkout ?? '')) {
    return c.json({ error: 'checkin and checkout must be YYYY-MM-DD' }, 400);
  }
  const checkin = q.checkin as string;
  const checkout = (q.checkout as string) > checkin ? (q.checkout as string) : addDaysWarsaw(checkin, 1);

  const lat = Number(q.lat);
  const lng = Number(q.lng);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const address = (q.address ?? '').trim().slice(0, 120);
  if (!hasCoordinates && !address) {
    return c.json({ error: 'lat/lng or address required' }, 400);
  }

  const theme: StayTheme = q.theme === 'dark' ? 'dark' : 'light';
  const view: StayView = q.view === 'full' ? 'full' : 'mini';
  const priceper = q.priceper === 'total' ? 'total' : q.priceper === 'nightly' ? 'nightly' : undefined;
  const minstars = clampInt(q.minstars, 0, 5);
  const minguest = clampInt(q.minguest, 0, 10);
  const url = staysWidgetUrl(aid, {
    lat: hasCoordinates ? lat : undefined,
    lng: hasCoordinates ? lng : undefined,
    address: hasCoordinates ? undefined : address,
    checkin,
    checkout,
    theme,
    view,
    priceper,
    minstars,
    minguest,
  });
  return c.json({ url });
});

function clampInt(raw: string | undefined, min: number, max: number): number | undefined {
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded > min && rounded <= max ? rounded : undefined;
}
