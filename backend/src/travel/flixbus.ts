import { CONFIG } from '../config/index';
import { readFlightCache, writeFlightCache } from './flightsApi';

// FlixBus bus search. The endpoint is the same undocumented JSON API the
// flixbus.com site calls; it needs no key but no contract either, so every
// call is cached and a failure throws (the app shows retry, never a fake fare).

export interface BusCity {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  isNode: boolean;
}

export interface BusOffer {
  price: number;            // total, currency of CONFIG.travel.flixbus.currency
  hour: string;             // HH:MM local departure
  durationMinutes: number;
  transfers: number;
  departureCityId: string;
  arrivalCityId: string;
}

export interface BusWindow {
  offers: BusOffer[];
  from: BusCity | null;
  to: BusCity | null;
}

const cfg = CONFIG.travel.flixbus;

function ddMMyyyy(isoDay: string): string {
  const [y, m, d] = isoDay.split('-');
  return `${d}.${m}.${y}`;
}

/** Resolve a city name to a FlixBus city; cached per name. */
export async function resolveBusCity(db: D1Database, name: string): Promise<BusCity | null> {
  const key = `flix:city:${name.toLowerCase()}`;
  const cached = await readFlightCache(db, key);
  if (cached) return cached as BusCity | null;

  const url = `${cfg.apiHost}/search/autocomplete/cities?q=${encodeURIComponent(name)}&lang=${cfg.lang}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(cfg.timeoutMs) });
  if (!res.ok) throw new Error(`FlixBus autocomplete ${res.status}`);
  const rows = (await res.json()) as Array<{ id?: string; name?: string; location?: { lat?: number; lon?: number }; is_flixbus_city?: boolean }>;
  const match = rows.find((r) => r.is_flixbus_city && r.id) ?? null;
  const city: BusCity | null = match
    ? { id: String(match.id), name: String(match.name ?? name), lat: match.location?.lat ?? null, lng: match.location?.lon ?? null, isNode: true }
    : null;
  await writeFlightCache(db, key, city, cfg.autocompleteTtlMs);
  return city;
}

interface FlixResult {
  status?: string;
  transfer_type_key?: string;
  departure?: { date?: string };
  duration?: { hours?: number; minutes?: number };
  price?: { total?: number };
}

/** Pure mapping (unit-testable): v4 `results` object → bus offers. */
export function parseBusOffers(results: Record<string, FlixResult> | undefined | null): BusOffer[] {
  if (!results) return [];
  const offers: BusOffer[] = [];
  for (const r of Object.values(results)) {
    if (r?.status !== 'available') continue;
    const price = r.price?.total;
    if (typeof price !== 'number' || price <= 0) continue;
    const hourMatch = /T(\d{2}):(\d{2})/.exec(r.departure?.date ?? '');
    if (!hourMatch) continue;
    offers.push({
      price: Math.round(price),
      hour: `${hourMatch[1]}:${hourMatch[2]}`,
      durationMinutes: (r.duration?.hours ?? 0) * 60 + (r.duration?.minutes ?? 0),
      transfers: r.transfer_type_key === 'direct' ? 0 : 1,
      departureCityId: '',
      arrivalCityId: '',
    });
  }
  return offers.sort((a, b) => a.price - b.price);
}

/** One day's cheapest offers between two resolved cities; cached per route+day. */
export async function fetchBusDay(db: D1Database, fromId: string, toId: string, isoDay: string): Promise<BusOffer[]> {
  const key = `flix:search:${fromId}:${toId}:${isoDay}`;
  const cached = await readFlightCache(db, key);
  if (cached) return cached as BusOffer[];

  const params = new URLSearchParams({
    from_city_id: fromId,
    to_city_id: toId,
    departure_date: ddMMyyyy(isoDay),
    products: JSON.stringify({ adult: 1 }),
    currency: cfg.currency,
    locale: cfg.locale,
    search_by: 'cities',
    include_after_midnight_rides: '1',
  });
  const res = await fetch(`${cfg.apiHost}/search/service/v4/search?${params}`, { signal: AbortSignal.timeout(cfg.timeoutMs) });
  // 400 = unknown city id; the route simply does not exist.
  if (res.status === 400) {
    await writeFlightCache(db, key, [], cfg.failureTtlMs);
    return [];
  }
  if (!res.ok) throw new Error(`FlixBus search ${res.status}`);
  const body = (await res.json()) as { trips?: Array<{ results?: Record<string, FlixResult> }> };
  const offers = parseBusOffers(body.trips?.[0]?.results).map((o) => ({ ...o, departureCityId: fromId, arrivalCityId: toId }));
  await writeFlightCache(db, key, offers, cfg.priceTtlMs);
  return offers;
}

/** Booking deep link. Awin-wrapped only when the advertiser id exists. */
export function busBookingUrl(fromId: string, toId: string, isoDay: string): string {
  const shop = `${cfg.shopHost}/search?departureCity=${fromId}&arrivalCity=${toId}&rideDate=${ddMMyyyy(isoDay)}&adult=1&currency=${cfg.currency}&_locale=${cfg.lang}`;
  if (!cfg.awin.advertiserId) return shop;
  return `${cfg.awin.base}?awinmid=${cfg.awin.advertiserId}&awinaffid=${cfg.awin.publisherId}&ued=${encodeURIComponent(shop)}`;
}
