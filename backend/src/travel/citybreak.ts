import { CITY_ENTRIES, type CityEntry, type ImageCredit } from './cities';
import { foldCity } from './airports';

export interface CityPhoto {
  id: string;
  name: string;
  namePl: string;
  lat: number;
  lng: number;
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
    imageUrl: entry.imageUrl,
    imageLargeUrl: entry.imageLargeUrl,
    credit: entry.imageCredit,
  };
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
const MIN_SCORE = 7.5;
const MIN_REVIEWS = 50;
const HOTELS_PER_CITY = 3;

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

function hotelFromResult(result: Stay22Result): HotelOffer | null {
  const total = result.prices?.total;
  const data = result.data ?? {};
  const score = Number(data.ratingOn10 ?? NaN);
  const reviews = data.reviewCount ?? 0;
  const url = data.urlDirect ?? result.url;
  if (total == null || !data.name || !url) return null;
  if (!Number.isFinite(score) || score < MIN_SCORE || reviews < MIN_REVIEWS) return null;
  const [lat, lng] = result.latLng ?? [0, 0];
  return {
    name: data.name,
    stars: typeof data.stars === 'number' ? data.stars : null,
    score,
    reviews,
    type: data.type ?? '',
    total: Math.round(total),
    perPerson: Math.round(total / 2),
    url,
    thumb: data.thumb ?? null,
    lat,
    lng,
  };
}

export async function fetchCityHotels(env: Env, point: Point, checkin: string, checkout: string): Promise<HotelOffer[]> {
  const params = new URLSearchParams({
    lat: String(point.lat),
    lng: String(point.lng),
    checkin: toStayDate(checkin),
    checkout: toStayDate(checkout),
    adults: '2',
    rooms: '1',
    currency: 'PLN',
    priceper: 'total',
    limit: '99',
    width: '1400',
    height: '900',
    selectedHotelProvider: 'booking',
  });
  if (env.STAY22_AID) params.set('aid', env.STAY22_AID);
  try {
    const response = await fetch(`${STAY22_API}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return [];
    const results = parseStay22(await response.text());
    return results
      .map(hotelFromResult)
      .filter((hotel): hotel is HotelOffer => hotel !== null)
      .sort((a, b) => a.total - b.total)
      .slice(0, HOTELS_PER_CITY);
  } catch {
    return [];
  }
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
  }));
}