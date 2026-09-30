import { CONFIG } from '../config/index';
import { diacriticFold } from '../seed/core/match';
import { airportCatalog } from './airports';
import cities from './data/cities.json';
import radicalCities from './data/radical-cities.json';
import radicalPrices from './data/radical-prices.json';

const SLUGS = radicalCities as Record<string, string>;
const PRICES = radicalPrices as Record<string, number>;

interface CityEntry {
  id: string;
  name: string;
  namePl?: string;
  country: string;
  airports: string[];
}

const BY_ID: Record<string, CityEntry> = Object.fromEntries(
  (cities as CityEntry[]).map((city) => [city.id, city])
);

const BY_NAME: Record<string, string> = {};
for (const city of cities as CityEntry[]) {
  for (const label of [city.name, city.namePl]) {
    if (label) BY_NAME[diacriticFold(label)] = city.id;
  }
}

/** The app knows the city by name and the city sheet by id. */
export function cityIdFor(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  if (BY_ID[key]) return key;
  return BY_NAME[diacriticFold(key)] ?? null;
}

const BY_IATA: Record<string, string> = {};
for (const airport of airportCatalog()) {
  const cityId = cityIdFor(airport.city);
  if (cityId && !BY_IATA[airport.iata]) BY_IATA[airport.iata] = cityId;
}
for (const city of cities as CityEntry[]) {
  for (const iata of city.airports) if (!BY_IATA[iata]) BY_IATA[iata] = city.id;
}

/** The city that serves an airport. A small town event points at the airport
 *  city, which is where the traveller lands and where the storage is. The
 *  carrier catalogue names the airport city, so it wins over a reachable list. */
export function cityForAirport(iata: string): string | null {
  return BY_IATA[iata.toUpperCase()] ?? null;
}

export function luggageSlug(cityId: string): string | null {
  return SLUGS[cityId] ?? null;
}

export function luggagePrice(cityId: string): number {
  return PRICES[cityId] ?? PRICES.default ?? CONFIG.travel.luggage.defaultPrice;
}

/** The link the app opens. The /pl/ site wants the Polish slug, a place hint
 *  and a date pair; the dates travel in the Warsaw offset, as the site writes
 *  them. Without a slug the city page is gone, so the home page keeps the dates. */
export function luggageUrl(
  cityId: string | null,
  from: string | undefined,
  to: string | undefined
): string {
  const cfg = CONFIG.travel.luggage;
  const target = new URL(`https://radicalstorage.com/${cfg.locale}`);
  const city = cityId ? BY_ID[cityId] : undefined;
  const slug = cityId ? luggageSlug(cityId) : null;
  if (slug) {
    target.pathname = `/${cfg.locale}/storage-list/${slug}`;
    target.searchParams.set('s', `${city?.namePl ?? city?.name ?? slug}, ${city?.country ?? ''}`.trim());
  }
  if (from) target.searchParams.set('dropOff', `${from}T11:00:00${warsawOffset(from)}`);
  if (to) target.searchParams.set('pickUp', `${to}T16:00:00${warsawOffset(to)}`);
  return tpMedia(target.toString());
}

function tpMedia(target: string): string {
  const cfg = CONFIG.travel.luggage;
  const url = new URL(cfg.tpBase);
  url.searchParams.set('campaign_id', cfg.campaignId);
  url.searchParams.set('marker', cfg.marker);
  url.searchParams.set('p', cfg.p);
  url.searchParams.set('trs', cfg.trs);
  url.searchParams.set('u', target);
  return url.toString();
}

/** Europe/Warsaw is +01:00 or +02:00 depending on the day. */
function warsawOffset(day: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${day}T12:00:00Z`));
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  return name.replace('GMT', '') || '+01:00';
}
