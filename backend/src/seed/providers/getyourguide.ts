// getyourguide.com provider — 'fetch' transport, Worker executor. Partner API
// (https://api.getyourguide.com), auth via the X-ACCESS-TOKEN header
// (wrangler secret GETYOURGUIDE_TOKEN). JSON API, no anti-bot → runs on the CF
// Workers edge. Content: attractions & tours anchored to a destination city —
// tagged 'atrakcje'. Attractions are ongoing products, so each is seeded as a
// post for the far-edge day (today+SEED_DAYS_AHEAD) and re-seeded daily
// (idempotent upsert by external_id 'getyourguide-<tour_id>'). showtimes (real
// start times for the day, when the API exposes them) come from the per-tour
// availability endpoint; link_url is the API-provided affiliate URL.
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { CityDef, CITIES } from '../../admin/cities';
import { GYG_BASE, GYG_WEB, GYG_RADIUS_KM, GYG_LIMIT, GYG_IMG_FORMAT } from '../core/constants';
import { UA_HEADERS } from './http';

const GYG_TIMEOUT_MS = 15_000;

interface GyCoordinates { lat: number; long: number }

interface GyTour {
  tour_id: number;
  title: string;
  abstract?: string;
  pictures?: { url?: string; ssl_url?: string }[];
  coordinates?: GyCoordinates | null;
  locations?: { name?: string }[];
  url?: string;
  activity_type?: string;
}

interface GyAvailability {
  data?: {
    start_times?: string[];
    available_start_times?: string[];
    available_dates?: Array<{ date?: string; start_times?: string[]; start_time?: string }>;
  };
}

async function gyGet<T>(token: string, path: string, params: [string, string][]): Promise<T | null> {
  const url = new URL(`${GYG_BASE}${path}`);
  for (const [k, v] of params) url.searchParams.append(k, v);
  try {
    const res = await fetch(url.toString(), {
      headers: { ...UA_HEADERS, 'X-ACCESS-TOKEN': token, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(GYG_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Real start times for the target day (if the API exposes them), else null. */
async function fetchDayTimes(token: string, tourId: number, day: string): Promise<string[] | null> {
  const a = await gyGet<GyAvailability>(token, `/v2/tours/${tourId}/availability`, [['cnt_language', 'pl']]);
  if (!a?.data) return null;
  if (Array.isArray(a.data.start_times) && a.data.start_times.length) return a.data.start_times;
  if (Array.isArray(a.data.available_start_times) && a.data.available_start_times.length) return a.data.available_start_times;
  for (const d of a.data.available_dates || []) {
    if (d.date === day && Array.isArray(d.start_times) && d.start_times.length) return d.start_times;
  }
  return null;
}

async function fetchCityTours(ctx: SeedContext, token: string, city: CityDef): Promise<SeedCandidate[]> {
  const data = await gyGet<{ data?: { tours?: GyTour[] } }>(token, '/v2/tours', [
    ['coordinates[]', String(city.lat)],
    ['coordinates[]', String(city.lng)],
    ['coordinates[]', String(GYG_RADIUS_KM)],
    ['cnt_language', 'pl'],
    ['currency', 'PLN'],
    ['limit', String(GYG_LIMIT)],
    ['sortfield', 'popularity'],
  ]);
  const tours = (data?.data?.tours || []).filter((t) => t.activity_type !== 'transfer');
  const out: SeedCandidate[] = [];
  for (const t of tours) {
    const times = await fetchDayTimes(token, t.tour_id, ctx.day);
    const img = t.pictures?.[0]?.url || t.pictures?.[0]?.ssl_url || '';
    const lat = t.coordinates?.lat ?? city.lat;
    const lng = t.coordinates?.long ?? city.lng;
    const loc = t.locations?.[0]?.name || city.name;
    out.push({
      source: ProviderId.GETYOURGUIDE,
      externalId: `getyourguide-${t.tour_id}`,
      title: t.title,
      startMs: ctx.dayStart,
      lat, lng,
      city: city.name,
      venue: loc,
      address: '',
      link: t.url || `${GYG_WEB}/`,
      mediaUrl: img ? img.replace('[format_id]', GYG_IMG_FORMAT) : '',
      thumbUrl: null,
      times: times && times.length ? times : undefined,
      tags: ['atrakcje'],
    });
  }
  return out;
}

export async function fetchGyCity(ctx: SeedContext, cityId: string): Promise<SeedCandidate[]> {
  const city = CITIES.find((c) => c.id === cityId);
  if (!city) return [];
  const token = ctx.env.GETYOURGUIDE_TOKEN;
  if (!token) return [];
  return fetchCityTours(ctx, token, city);
}

export async function fetchGy(ctx: SeedContext): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  for (const city of CITIES) out.push(...(await fetchGyCity(ctx, city.id)));
  return out;
}

export const getyourguideProvider: SeedProvider = {
  id: ProviderId.GETYOURGUIDE,
  transport: 'fetch',
  fetchCandidates: fetchGy,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: CITIES.map((c) => c.id),
  fetchScope: (ctx, scope) => fetchGyCity(ctx, scope),
};
