import type { UsageEvent } from './ga4';

// Pure request → usage event mapping. A fixed table, so the recorded
// dimensions come from a closed set and never store the raw query string.

interface RouteSpec {
  event: string;
  /** Coarse dimension names to copy from the query, in output order. */
  dims: string[];
}

const ROUTES: Array<{ method: string; prefix: string; spec: RouteSpec }> = [
  { method: 'GET', prefix: '/travel/events', spec: { event: 'events_browse', dims: ['tags', 'origins'] } },
  { method: 'GET', prefix: '/travel/flights/ryanair', spec: { event: 'flight_request', dims: ['origin', 'destination', 'eventDay'] } },
  { method: 'GET', prefix: '/travel/flights/wizzair', spec: { event: 'flight_request', dims: ['origin', 'destination', 'eventDay'] } },
  { method: 'GET', prefix: '/travel/bus/flixbus', spec: { event: 'bus_request', dims: ['fromCity', 'toCity', 'eventDay'] } },
  { method: 'GET', prefix: '/travel/places', spec: { event: 'place_open', dims: ['kind'] } },
  { method: 'GET', prefix: '/travel/stays-widget', spec: { event: 'stays_open', dims: [] } },
  { method: 'GET', prefix: '/travel/catalogue', spec: { event: 'catalogue_fetch', dims: [] } },
  { method: 'GET', prefix: '/stories', spec: { event: 'stories_browse', dims: ['day', 'category'] } },
  { method: 'GET', prefix: '/posts/', spec: { event: 'post_open', dims: [] } },
];

/** Map a request to a usage event, or null when the path is not measured.
 *  `day` is normalised to YYYY-MM-DD; free text is dropped, never stored. */
export function classifyRequest(
  method: string,
  path: string,
  query: Record<string, string | undefined>,
): UsageEvent | null {
  const route = ROUTES.find((r) => r.method === method && path.startsWith(r.prefix));
  if (!route) return null;
  const params: Record<string, string | number> = {};
  for (const dim of route.spec.dims) {
    const value = coerce(dim, query[dim]);
    if (value !== null) params[dim] = value;
  }
  return { name: route.spec.event, params };
}

function coerce(dim: string, raw: string | undefined): string | number | null {
  if (!raw) return null;
  if (dim === 'eventDay') return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  if (dim === 'day') return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  if (dim === 'kind') return /^[a-z]{3,20}$/.test(raw) ? raw : null;
  if (dim === 'origin' || dim === 'destination') return /^[A-Z]{3}$/.test(raw) ? raw : null;
  // Tags/origins lists and city names: keep them short and structured only.
  return raw.slice(0, 40);
}
