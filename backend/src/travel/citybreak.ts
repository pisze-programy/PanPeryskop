import { CITY_ENTRIES, type CityEntry, type ImageCredit } from './cities';
import { foldCity } from './airports';
import { viatorConfigured, viatorNearestCity, viatorProductsForCity, viatorWindowFor, type ViatorEnv } from './viator';
export interface CityPhoto {
  id: string;
  name: string;
  namePl: string;
  lat: number;
  lng: number;
  costUsd: number;
  nearby: string[];
  imageUrl: string;
  imageLargeUrl: string;
  credit: ImageCredit | null;
}

export interface Point {
  lat: number;
  lng: number;
}

export type TravelMode = 'transit' | 'walking' | 'driving';

const byName = new Map<string, CityEntry>();
for (const entry of CITY_ENTRIES) {
  byName.set(foldCity(entry.name), entry);
  if (entry.namePl) byName.set(foldCity(entry.namePl), entry);
}

export function cityPhotoByCity(city: string): CityPhoto | null {
  const entry = byName.get(foldCity(city));
  if (!entry) return null;
  return {
    id: entry.id,
    name: entry.name,
    namePl: entry.namePl,
    lat: entry.lat,
    lng: entry.lng,
    costUsd: entry.costUsd,
    nearby: entry.nearby ?? [],
    imageUrl: entry.imageUrl,
    imageLargeUrl: entry.imageLargeUrl,
    credit: entry.imageCredit,
  };
}

const MAX_CITY_KM = 150;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function cityForAirport(name: string, lat: number, lng: number): CityPhoto | null {
  const exact = cityPhotoByCity(name);
  if (exact) return exact;
  let best: CityEntry | null = null;
  let bestKm = Infinity;
  for (const entry of CITY_ENTRIES) {
    const km = haversineKm(lat, lng, entry.lat, entry.lng);
    if (km > MAX_CITY_KM) continue;
    const larger = best === null || entry.population > best.population;
    const nearerTie = best !== null && entry.population === best.population && km < bestKm;
    if (larger || nearerTie) {
      best = entry;
      bestKm = km;
    }
  }
  if (!best) return null;
  const namePl = /region|stołeczny/i.test(best.namePl) ? best.name : best.namePl;
  return {
    id: best.id,
    name: best.name,
    namePl,
    lat: best.lat,
    lng: best.lng,
    costUsd: best.costUsd,
    nearby: best.nearby ?? [],
    imageUrl: best.imageUrl,
    imageLargeUrl: best.imageLargeUrl,
    credit: best.imageCredit,
  };
}

export interface CityImage {
  url: string;
  author: string;
  creditUrl: string;
}

const IMAGE_TTL_MS = 30 * 24 * 3_600_000;
const WIKI_API = 'https://commons.wikimedia.org/w/api.php';

export async function fetchCityImage(env: Env, name: string, lat: number, lng: number): Promise<CityImage | null> {
  const key = `img:${name.toLowerCase()}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
  const cached = await env.DB
    .prepare('SELECT payload FROM image_cache WHERE cache_key = ? AND expires_at > ?')
    .bind(key, Date.now())
    .first<{ payload: string }>();
  if (cached) {
    try {
      return JSON.parse(cached.payload) as CityImage;
    } catch {
      return null;
    }
  }
  const params = new URLSearchParams({
    action: 'query',
    generator: 'geosearch',
    ggscoord: `${lat}|${lng}`,
    ggsradius: '5000',
    ggslimit: '12',
    ggsnamespace: '6',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '1200',
    format: 'json',
  });
  try {
    const response = await fetch(`${WIKI_API}?${params.toString()}`, {
      headers: { 'User-Agent': 'PanPeryskopBot/1.0 (https://panperyskop.app; kontakt@panperyskop.app)' },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      query?: { pages?: Record<string, { title?: string; imageinfo?: { thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: { Artist?: { value?: string } } }[] }> };
    };
    const pages = Object.values(payload.query?.pages ?? {});
    const wants = name.toLowerCase();
    const scored = pages
      .map((page) => {
        const info = page.imageinfo?.[0];
        const title = (page.title ?? '').toLowerCase();
        if (!info || !/\.(jpe?g|png)$/i.test(info.thumburl ?? info.url ?? '')) return null;
        const score = title.includes(wants) ? 2 : 0;
        return { info, score };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.score - a.score);
    const best = scored[0]?.info;
    if (!best) return null;
    const image: CityImage = {
      url: best.thumburl ?? best.url ?? '',
      author: (best.extmetadata?.Artist?.value ?? 'Wikimedia').replace(/<[^>]+>/g, '').trim(),
      creditUrl: best.descriptionurl ?? '',
    };
    if (!image.url) return null;
    await env.DB
      .prepare('INSERT INTO image_cache (cache_key, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at')
      .bind(key, JSON.stringify(image), Date.now() + IMAGE_TTL_MS)
      .run()
      .catch(() => { /* best effort */ });
    return image;
  } catch {
    return null;
  }
}

export function directionsUrl(from: Point, to: Point, mode: TravelMode): string {
  const params = new URLSearchParams({
    api: '1',
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode: mode,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

const STAY22_API = 'https://www.stay22.com/api/booking';
const HOTELS_PER_CITY = 5;
const BBOX_DELTA_LAT = 0.2;
const BBOX_DELTA_LNG = 0.3;
const USD_PLN = 3.65;

export const ECONOMY_PRICE_DIVISOR = 15;

export function economyMaxNightlyUsd(costUsd: number): number {
  return Math.max(1, Math.round(costUsd / ECONOMY_PRICE_DIVISOR));
}

function nightsBetween(checkin: string, checkout: string): number {
  const nights = Math.round((Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / 86_400_000);
  return Math.max(1, nights);
}

interface Stay22Prices {
  total?: number;
  nightly?: number;
}

interface Stay22Data {
  name?: string;
  stars?: number | null;
  ratingOn10?: string | number;
  reviewCount?: number;
  type?: string;
  thumb?: string;
  urlDirect?: string;
}

interface Stay22Result {
  prices?: Stay22Prices;
  url?: string;
  latLng?: [number, number];
  data?: Stay22Data;
}

export interface HotelOffer {
  name: string;
  stars: number | null;
  score: number;
  reviews: number;
  type: string;
  total: number;
  perPerson: number;
  url: string;
  thumb: string | null;
  lat: number;
  lng: number;
}

export function toStayDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${Number(month)}/${Number(day)}/${year}`;
}

export function parseStay22(text: string): Stay22Result[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('stay22: bad body');
  const parsed = JSON.parse(text.slice(start, end + 1)) as { results?: Stay22Result[] };
  return parsed.results ?? [];
}

function parseHotel(result: Stay22Result): HotelOffer | null {
  const total = result.prices?.total;
  const data = result.data ?? {};
  const url = data.urlDirect ?? result.url;
  if (total == null || !data.name || !url) return null;
  const score = Number(data.ratingOn10 ?? NaN);
  const [lat, lng] = result.latLng ?? [0, 0];
  return {
    name: data.name,
    stars: typeof data.stars === 'number' ? data.stars : null,
    score: Number.isFinite(score) ? score : 0,
    reviews: data.reviewCount ?? 0,
    type: data.type ?? '',
    total: Math.round(total),
    perPerson: Math.round(total / 2),
    url,
    thumb: data.thumb ?? null,
    lat,
    lng,
  };
}

const STAY_TTL_MS = 6 * 3_600_000;

async function readStayCache(db: D1Database, key: string): Promise<HotelOffer[] | null> {
  const row = await db
    .prepare('SELECT payload FROM stay_cache WHERE cache_key = ? AND expires_at > ?')
    .bind(key, Date.now())
    .first<{ payload: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as HotelOffer[];
  } catch {
    return null;
  }
}

async function writeStayCache(db: D1Database, key: string, value: HotelOffer[]): Promise<void> {
  await db
    .prepare('INSERT INTO stay_cache (cache_key, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at')
    .bind(key, JSON.stringify(value), Date.now() + STAY_TTL_MS)
    .run()
    .catch(() => { /* best effort */ });
}

async function stay22Hotels(env: Env, point: Point, checkin: string, checkout: string): Promise<HotelOffer[]> {
  const cacheKey = `stay:${point.lat.toFixed(3)}:${point.lng.toFixed(3)}:${checkin}:${checkout}`;
  const cached = await readStayCache(env.DB, cacheKey);
  if (cached) return cached;
  const params = new URLSearchParams({
    centerlat: String(point.lat),
    centerlng: String(point.lng),
    nelat: String(point.lat + BBOX_DELTA_LAT),
    nelng: String(point.lng + BBOX_DELTA_LNG),
    swlat: String(point.lat - BBOX_DELTA_LAT),
    swlng: String(point.lng - BBOX_DELTA_LNG),
    width: '1400',
    height: '900',
    checkin: toStayDate(checkin),
    checkout: toStayDate(checkout),
    adults: '2',
    rooms: '1',
    currency: 'PLN',
    priceper: 'total',
    limit: '99',
    selectedHotelProvider: 'booking',
  });
  if (env.STAY22_AID) params.set('aid', env.STAY22_AID);
  try {
    const response = await fetch(`${STAY22_API}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return [];
    const hotels = parseStay22(await response.text())
      .map(parseHotel)
      .filter((hotel): hotel is HotelOffer => hotel !== null)
      .sort((a, b) => a.total - b.total);
    await writeStayCache(env.DB, cacheKey, hotels);
    return hotels;
  } catch {
    return [];
  }
}

export async function fetchCityHotels(
  env: Env, point: Point, checkin: string, checkout: string, maxNightlyUsd?: number,
): Promise<HotelOffer[]> {
  const nights = nightsBetween(checkin, checkout);
  const all = await stay22Hotels(env, point, checkin, checkout);
  const capPln = maxNightlyUsd ? maxNightlyUsd * USD_PLN : null;
  const within = capPln ? all.filter((hotel) => hotel.total / nights <= capPln) : all;
  const pool = within.length > 0 ? within : all;
  return pool.slice(0, HOTELS_PER_CITY);
}

const EVENT_TAGS = ['pilka-nozna', 'biegi'];
const EVENT_DELTA = 0.6;
const EVENTS_PER_CITY = 3;

interface EventRow {
  title: string;
  tag: string;
  start_ms: number;
  city: string;
  link: string | null;
  lat: number;
  lng: number;
  meta: string | null;
}

export interface EventOffer {
  title: string;
  tag: string;
  start: string;
  city: string;
  venue: string | null;
  link: string | null;
  lat: number;
  lng: number;
  km: number;
}

function venueFromMeta(meta: string | null): string | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as { venue?: unknown };
    return typeof parsed.venue === 'string' && parsed.venue ? parsed.venue : null;
  } catch {
    return null;
  }
}

export async function eventsInWindow(db: D1Database, point: Point, start: string, end: string): Promise<EventOffer[]> {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T23:59:59Z`);
  const tagSlots = EVENT_TAGS.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT title, tag, start_ms, city, link, lat, lng, meta FROM travel_events
       WHERE start_ms >= ? AND start_ms <= ? AND tag IN (${tagSlots})
       AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       ORDER BY start_ms LIMIT ?`,
    )
    .bind(
      startMs, endMs, ...EVENT_TAGS,
      point.lat - EVENT_DELTA, point.lat + EVENT_DELTA,
      point.lng - EVENT_DELTA, point.lng + EVENT_DELTA,
      EVENTS_PER_CITY,
    )
    .all<EventRow>();
  return (results ?? []).map((row) => ({
    title: row.title,
    tag: row.tag,
    start: new Date(row.start_ms).toISOString().slice(0, 10),
    city: row.city,
    venue: venueFromMeta(row.meta),
    link: row.link,
    lat: row.lat,
    lng: row.lng,
    km: Math.round(haversineKm(point.lat, point.lng, row.lat, row.lng)),
  }));
}

export interface Attraction {
  name: string;
  price: number | null;
  currency: string | null;
  rating: number | null;
  link: string;
  image: string | null;
  duration: number | null;
}

export async function fetchCityAttractions(env: Env, point: Point, day: string, limit = 3): Promise<Attraction[]> {
  const viatorEnv = env as unknown as ViatorEnv;
  if (!viatorConfigured(viatorEnv)) return [];
  try {
    const city = await viatorNearestCity(env.DB, point.lat, point.lng);
    if (!city) return [];
    const window = viatorWindowFor(day);
    const { places } = await viatorProductsForCity(env.DB, viatorEnv, city.destinationId, window, 0, limit);
    return places.map((product) => ({
      name: product.title,
      price: product.fromPrice,
      currency: product.currency,
      rating: product.rating,
      link: product.productUrl,
      image: product.imageUrl,
      duration: product.durationMinutes,
    }));
  } catch {
    return [];
  }
}