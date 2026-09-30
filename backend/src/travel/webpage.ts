import { addDaysWarsaw, todayWarsaw } from '../seed/core/dates';
import { destinationsFrom, foldCity, type Destination } from './airports';
import { fetchRyanairMonth, fetchWizzairMonth, type FlightCell } from './flightsApi';
import { staysWidgetUrl } from './stay22';
import { carRentalUrl } from './qeeq';
import {
  cityForAirport, cityPhotoByCity, cityZoom, directionsUrl, economyMaxNightlyUsd, eventsInWindow, fetchCityAttractions,
  fetchCityHotels, fetchCityImage,
  type Attraction, type CityPhoto, type EventOffer, type HotelOffer, type Point,
} from './citybreak';
import { mintRedirect } from '../analytics/redirect';
import { HUB_CSS, ORIGIN_CSS, SITE_CSS } from './pageStyles';

export interface OriginPage {
  id: string;
  name: string;
  genitive: string;
  slug: string;
  iata: string;
}

export const ORIGIN_PAGES: OriginPage[] = [
  { id: 'poznan', name: 'Poznań', genitive: 'Poznania', slug: 'tanie-loty-z-poznania', iata: 'POZ' },
  { id: 'warszawa', name: 'Warszawa', genitive: 'Warszawy', slug: 'tanie-loty-z-warszawy', iata: 'WAW' },
  { id: 'wroclaw', name: 'Wrocław', genitive: 'Wrocławia', slug: 'tanie-loty-z-wroclawia', iata: 'WRO' },
  { id: 'gdansk', name: 'Gdańsk', genitive: 'Gdańska', slug: 'tanie-loty-z-gdanska', iata: 'GDN' },
  { id: 'krakow', name: 'Kraków', genitive: 'Krakowa', slug: 'tanie-loty-z-krakowa', iata: 'KRK' },
  { id: 'katowice', name: 'Katowice', genitive: 'Katowic', slug: 'tanie-loty-z-katowic', iata: 'KTW' },
  { id: 'rzeszow', name: 'Rzeszów', genitive: 'Rzeszowa', slug: 'tanie-loty-z-rzeszowa', iata: 'RZE' },
  { id: 'bydgoszcz', name: 'Bydgoszcz', genitive: 'Bydgoszczy', slug: 'tanie-loty-z-bydgoszczy', iata: 'BZG' },
  { id: 'lodz', name: 'Łódź', genitive: 'Łodzi', slug: 'tanie-loty-z-lodzi', iata: 'LCJ' },
  { id: 'szczecin', name: 'Szczecin', genitive: 'Szczecina', slug: 'tanie-loty-z-szczecina', iata: 'SZZ' },
  { id: 'lublin', name: 'Lublin', genitive: 'Lublina', slug: 'tanie-loty-z-lublina', iata: 'LUZ' },
  { id: 'olsztyn', name: 'Olsztyn', genitive: 'Olsztyna', slug: 'tanie-loty-z-olsztyna', iata: 'SZY' },
];

export const PUBLIC_BASE = 'https://panperyskop.app';

export interface WeekendWindow {
  key: string;
  label: string;
  startOffset: number;
  endOffset: number;
  nights: number;
}

export const WEEKEND_WINDOWS: WeekendWindow[] = [
  { key: 'pt-ndz', label: 'PIĄTEK – NIEDZIELA', startOffset: 0, endOffset: 2, nights: 2 },
  { key: 'pt-pon', label: 'PIĄTEK – PONIEDZIAŁEK', startOffset: 0, endOffset: 3, nights: 3 },
  { key: 'czw-ndz', label: 'CZWARTEK – NIEDZIELA', startOffset: -1, endOffset: 2, nights: 3 },
  { key: 'czw-pon', label: 'CZWARTEK – PONIEDZIAŁEK', startOffset: -1, endOffset: 3, nights: 4 },
];

const WEEKENDS = 13;
const WEB_PROVIDER_PACE_MS = 300;
const PRICE_CAP = 800;
const PER_WINDOW = 12;
const MAX_OPTIONS_PER_PLACE = 6;
const MAX_ROUTES = 60;
const FETCH_CONCURRENCY = 2;

export function weekendAnchors(today: string, count: number): string[] {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const toFriday = (5 - day + 7) % 7;
  const first = addDaysWarsaw(today, toFriday);
  return Array.from({ length: count }, (_, i) => addDaysWarsaw(first, i * 7));
}

export function cheapestOn(cells: FlightCell[], date: string): number | null {
  let best: number | null = null;
  for (const cell of cells) {
    if (cell.date !== date || cell.price === null) continue;
    if (best === null || cell.price < best) best = cell.price;
  }
  return best;
}

export function routePrice(out: FlightCell[], back: FlightCell[], start: string, end: string): number | null {
  const legOut = cheapestOn(out, start);
  const legBack = cheapestOn(back, end);
  if (legOut === null || legBack === null) return null;
  return Math.round((legOut + legBack) * 100) / 100;
}

export function windowMonths(today: string, count = WEEKENDS): string[] {
  const months = new Set<string>();
  for (const friday of weekendAnchors(today, count)) {
    months.add(`${friday.slice(0, 7)}-01`);
    months.add(`${addDaysWarsaw(friday, 3).slice(0, 7)}-01`);
  }
  return [...months].sort();
}

export interface HotelPrice {
  name: string;
  total: number;
  perPerson: number;
  lat: number;
  lng: number;
  url: string;
  address: string | null;
  km: number;
  stars: number | null;
  score: number;
  reviews: number;
}

export interface Offer {
  city: string;
  cityPl: string | null;
  iata: string;
  carrier: string;
  window: string;
  start: string;
  end: string;
  nights: number;
  price: number;
  lat: number;
  lng: number;
  imageUrl: string | null;
  imageLargeUrl: string | null;
  imageCredit: CityPhoto['credit'];
  cityId?: string | null;
  cityNearby?: string[];
  cityLat?: number | null;
  cityLng?: number | null;
  flightUrl: string;
  stayUrl: string;
  carUrl: string;
  hotel: HotelPrice | null;
}

export interface WindowSection {
  window: WeekendWindow;
  groups: { start: string; end: string; offers: Offer[] }[];
}

interface RouteFares {
  destination: Destination;
  carrier: 'ryanair' | 'wizzair';
  out: FlightCell[];
  back: FlightCell[];
}

function carrierBookingUrl(carrier: string, origin: string, dest: string, out: string, back: string): string {
  if (carrier === 'wizzair') {
    return `https://wizzair.com/pl-pl/booking/select-flight/${origin}/${dest}/${out}/${back}`;
  }
  const params = new URLSearchParams({
    adults: '1', teens: '0', children: '0', infants: '0',
    dateOut: out, dateIn: back, isConnectedFlight: 'false', discount: '0', promoCode: '',
    isReturn: 'true', originIata: origin, destinationIata: dest,
    tpAdults: '1', tpTeens: '0', tpChildren: '0', tpInfants: '0',
    tpStartDate: out, tpEndDate: back, tpDiscount: '0', tpPromoCode: '',
    tpOriginIata: origin, tpDestinationIata: dest,
  });
  return `https://www.ryanair.com/pl/pl/trip/flights/select?${params.toString()}`;
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function routeFares(
  db: D1Database, origin: string, destination: Destination, carrier: 'ryanair' | 'wizzair', months: string[],
): Promise<RouteFares> {
  const out: FlightCell[] = [];
  const back: FlightCell[] = [];
  for (const month of months) {
    try {
      const window = carrier === 'ryanair'
        ? await fetchRyanairMonth(origin, destination.iata, month, db, WEB_PROVIDER_PACE_MS)
        : await fetchWizzairMonth(origin, destination.iata, month, db, WEB_PROVIDER_PACE_MS);
      out.push(...window.outbound);
      back.push(...window.returning);
    } catch {
      // A provider outage must not fail the whole page; other routes still render.
    }
  }
  return { destination, carrier, out, back };
}

interface DraftOffer {
  city: string;
  iata: string;
  carrier: 'ryanair' | 'wizzair';
  lat: number;
  lng: number;
  price: number;
}

async function toOffer(
  env: Env, origin: OriginPage, draft: DraftOffer, window: WeekendWindow, start: string, end: string,
): Promise<Offer> {
  const aid = env.STAY22_AID ?? '';
  const photo = cityForAirport(draft.city, draft.lat, draft.lng, draft.iata);
  return {
    city: photo?.name ?? draft.city,
    cityPl: photo?.namePl ?? null,
    iata: draft.iata,
    carrier: draft.carrier,
    window: window.key,
    start,
    end,
    nights: window.nights,
    price: draft.price,
    lat: draft.lat,
    lng: draft.lng,
    imageUrl: photo?.imageUrl ?? null,
    imageLargeUrl: photo?.imageLargeUrl ?? null,
    imageCredit: photo?.credit ?? null,
    cityId: photo?.id ?? null,
    cityNearby: photo?.nearby ?? [],
    cityLat: photo?.lat ?? null,
    cityLng: photo?.lng ?? null,
    flightUrl: await mintRedirect(env, 'flight', carrierBookingUrl(draft.carrier, origin.iata, draft.iata, start, end)),
    stayUrl: await mintRedirect(env, 'stay', staysWidgetUrl(aid, {
      lat: draft.lat, lng: draft.lng,
      checkin: start, checkout: end,
      theme: 'light', view: 'full', adults: 2,
    })),
    carUrl: await mintRedirect(env, 'car', carRentalUrl(draft.iata, start, end)),
    hotel: null,
  };
}

function pickCheapestPerCity(fares: RouteFares[], start: string, end: string): DraftOffer[] {
  const byCity = new Map<string, DraftOffer>();
  for (const fare of fares) {
    const price = routePrice(fare.out, fare.back, start, end);
    if (price === null || price > PRICE_CAP) continue;
    const key = foldCity(fare.destination.city);
    const current = byCity.get(key);
    if (current && current.price <= price) continue;
    byCity.set(key, {
      city: fare.destination.city,
      iata: fare.destination.iata,
      carrier: fare.carrier,
      lat: fare.destination.lat,
      lng: fare.destination.lng,
      price,
    });
  }
  return [...byCity.values()].sort((a, b) => a.price - b.price).slice(0, PER_WINDOW);
}

async function buildOffers(env: Env, origin: OriginPage): Promise<WindowSection[]> {
  const today = todayWarsaw();
  const months = windowMonths(today);
  const destinations = destinationsFrom(origin.iata).slice(0, MAX_ROUTES);
  const jobs: { destination: Destination; carrier: 'ryanair' | 'wizzair' }[] = [];
  for (const destination of destinations) {
    for (const carrier of destination.providers) jobs.push({ destination, carrier });
  }
  const fares = await mapLimit(jobs, FETCH_CONCURRENCY, (job) =>
    routeFares(env.DB, origin.iata, job.destination, job.carrier, months));
  const sections: WindowSection[] = [];
  for (const window of WEEKEND_WINDOWS) {
    const groups: { start: string; end: string; offers: Offer[] }[] = [];
    for (const friday of weekendAnchors(today, WEEKENDS)) {
      const start = addDaysWarsaw(friday, window.startOffset);
      const end = addDaysWarsaw(friday, window.endOffset);
      const drafts = pickCheapestPerCity(fares, start, end);
      const offers = await Promise.all(drafts.map((draft) => toOffer(env, origin, draft, window, start, end)));
      groups.push({ start, end, offers });
    }
    sections.push({ window, groups });
  }
  return sections;
}

export interface FeaturedDeal {
  offer: Offer;
  photo: CityPhoto | null;
  hotels: HotelOffer[];
  attractions: Attraction[];
  events: EventOffer[];
  directions: { label: string; url: string }[];
}

const ENRICH_CONCURRENCY = 1;
const HOTEL_BUDGET = 400;
const HOTEL_OPTIONS_PER_PLACE = MAX_OPTIONS_PER_PLACE;

function buildDirections(airport: Point, center: Point, hotels: HotelOffer[], events: EventOffer[]): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [
    { label: 'Lotnisko - centrum', url: directionsUrl(airport, center, 'transit') },
  ];
  const hotel = hotels[0];
  const event = events[0];
  if (hotel) links.push({ label: 'Lotnisko - hotel', url: directionsUrl(airport, hotel, 'transit') });
  if (event) links.push({ label: 'Lotnisko - wydarzenie', url: directionsUrl(airport, event, 'transit') });
  if (hotel && event) links.push({ label: 'Hotel - wydarzenie', url: directionsUrl(hotel, event, 'walking') });
  return links;
}

async function enrichPlace(env: Env, place: Place, budget: { left: number }): Promise<FeaturedDeal> {
  const photo = cityForAirport(place.city, place.lat, place.lng, place.iata);
  const airport: Point = { lat: place.lat, lng: place.lng };
  const center: Point = photo ? { lat: photo.lat, lng: photo.lng } : airport;
  if (!photo) {
    const wiki = await fetchCityImage(env, place.city, center.lat, center.lng);
    if (wiki) {
      const credit = { photoUrl: wiki.creditUrl, author: wiki.author, authorUrl: wiki.creditUrl };
      for (const option of place.options) {
        option.imageUrl = wiki.url;
        option.imageLargeUrl = wiki.url;
        option.imageCredit = credit;
      }
    }
  }
  const maxNightlyUsd = photo ? economyMaxNightlyUsd(photo.costUsd) : undefined;
  const zoom = cityZoom(photo?.population ?? 0);
  let firstHotel: HotelOffer | null = null;
  let placeHotels: HotelOffer[] = [];
  const takeBudget = () => (budget.left > 0 ? (budget.left--, true) : false);
  for (const option of place.options.slice(0, HOTEL_OPTIONS_PER_PLACE)) {
    if (budget.left <= 0) break;
    const hotels = await fetchCityHotels(env, center, option.start, option.end, zoom, maxNightlyUsd, takeBudget);
    const [hotel] = hotels;
    if (!hotel) continue;
    option.hotel = {
      name: hotel.name, total: hotel.total, perPerson: hotel.perPerson, lat: hotel.lat, lng: hotel.lng, url: hotel.url,
      address: hotel.address, km: hotel.km, stars: hotel.stars, score: hotel.score, reviews: hotel.reviews,
    };
    if (!firstHotel) firstHotel = hotel;
    if (placeHotels.length === 0) placeHotels = hotels;
  }
  const anchor = place.options[0];
  const events = await eventsInWindow(env.DB, center, anchor.start, anchor.end);
  const attractions = await fetchCityAttractions(env, center, anchor.start);
  return {
    offer: anchor,
    photo,
    hotels: placeHotels.length > 0 ? placeHotels : firstHotel ? [firstHotel] : [],
    attractions,
    events,
    directions: buildDirections(airport, center, firstHotel ? [firstHotel] : [], events),
  };
}

async function buildFeatured(env: Env, sections: WindowSection[]): Promise<FeaturedDeal[]> {
  const budget = { left: HOTEL_BUDGET };
  return mapLimit(groupPlaces(sections), ENRICH_CONCURRENCY, (place) => enrichPlace(env, place, budget));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function esc(url: string | null | undefined): string {
  return escapeHtml(url ?? '');
}

export interface Place {
  city: string;
  cityPl: string | null;
  iata: string;
  lat: number;
  lng: number;
  imageUrl: string | null;
  imageLargeUrl: string | null;
  imageCredit: CityPhoto['credit'];
  cityId: string | null;
  nearby: string[];
  cityLat: number;
  cityLng: number;
  options: Offer[];
}

export function offerTotal(offer: Offer): number {
  return offer.hotel ? Math.round(offer.price + offer.hotel.perPerson) : Math.round(offer.price);
}

export function groupPlaces(sections: WindowSection[]): Place[] {
  const byCity = new Map<string, Place>();
  for (const section of sections) {
    for (const group of section.groups) {
      for (const offer of group.offers) {
        const key = foldCity(offer.city);
        const place = byCity.get(key);
        if (place) place.options.push(offer);
        else byCity.set(key, {
          city: offer.city,
          cityPl: offer.cityPl,
          iata: offer.iata,
          lat: offer.lat,
          lng: offer.lng,
          imageUrl: offer.imageUrl,
          imageLargeUrl: offer.imageLargeUrl,
          imageCredit: offer.imageCredit,
          cityId: offer.cityId ?? null,
          nearby: offer.cityNearby ?? [],
          cityLat: offer.cityLat ?? offer.lat,
          cityLng: offer.cityLng ?? offer.lng,
          options: [offer],
        });
      }
    }
  }
  for (const place of byCity.values()) {
    const anyHotel = place.options.some((option) => option.hotel);
    const key = (option: Offer) => (anyHotel && !option.hotel ? Number.MAX_SAFE_INTEGER : offerTotal(option));
    place.options = place.options.sort((a, b) => key(a) - key(b)).slice(0, MAX_OPTIONS_PER_PLACE);
  }
  return [...byCity.values()].sort((a, b) => offerTotal(a.options[0]) - offerTotal(b.options[0]));
}

const MONTHS_GEN = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];
const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

function nightsLabel(nights: number): string {
  if (nights === 1) return '1 noc';
  const last = nights % 10;
  const lastTwo = nights % 100;
  const few = last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14);
  return `${nights} ${few ? 'noce' : 'nocy'}`;
}

export function formatRange(start: string, end: string, nights: number): string {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  const sameMonth = from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear();
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const left = sameMonth
    ? `${from.getUTCDate()}`
    : sameYear
      ? `${from.getUTCDate()} ${MONTHS_GEN[from.getUTCMonth()]}`
      : `${from.getUTCDate()} ${MONTHS_GEN[from.getUTCMonth()]} ${from.getUTCFullYear()}`;
  const right = sameYear
    ? `${to.getUTCDate()} ${MONTHS_GEN[to.getUTCMonth()]}`
    : `${to.getUTCDate()} ${MONTHS_GEN[to.getUTCMonth()]} ${to.getUTCFullYear()}`;
  return `${WEEKDAYS[from.getUTCDay()]} ${left} - ${WEEKDAYS[to.getUTCDay()]} ${right}, ${nightsLabel(nights)}`;
}

const MONTHS_ABBR = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTH_COLORS = [
  '#2F6E78', '#A33C7C', '#007F4A', '#3B4EA8', '#C41E85', '#8A6A00',
  '#00719E', '#A24E17', '#58624E', '#B23A12', '#795C46', '#0B213A',
];
export function monthColor(monthIndex: number): string {
  return MONTH_COLORS[((monthIndex % 12) + 12) % 12];
}
const MONTHS_NOM = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const MONTHS_LOC = ['styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu', 'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu'];

export function monthParts(month: string): { slug: string; nominative: string; locative: string; key: string } {
  const [year, mon] = month.split('-');
  const index = Number(mon) - 1;
  return {
    slug: `${slugify(MONTHS_NOM[index])}-${year}`,
    nominative: `${MONTHS_NOM[index]} ${year}`,
    locative: `${MONTHS_LOC[index]} ${year}`,
    key: `${year}-${mon}`,
  };
}

export function dealSlug(origin: OriginPage, place: Place, key: string): string {
  return `${destinationSlug(origin, place)}/${monthParts(key).slug}`;
}

export function monthOptions(place: Place, key: string): Offer[] {
  return place.options.filter((option) => option.start.slice(0, 7) === key);
}

export function formatRangeShort(start: string, end: string): string {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  const sameMonth = from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear();
  const left = `${from.getUTCDate()}`;
  const right = `${to.getUTCDate()} ${MONTHS_ABBR[to.getUTCMonth()]}`;
  return sameMonth ? `${left}-${right}` : `${from.getUTCDate()} ${MONTHS_ABBR[from.getUTCMonth()]} - ${right}`;
}

export function dateParts(start: string, end: string): { month: string; day: string; range: string } {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  const sameMonth = from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear();
  return {
    month: MONTHS_ABBR[from.getUTCMonth()],
    day: String(from.getUTCDate()),
    range: sameMonth ? `do ${to.getUTCDate()}` : `do ${to.getUTCDate()} ${MONTHS_ABBR[to.getUTCMonth()]}`,
  };
}

export function formatDay(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS_GEN[day.getUTCMonth()]}`;
}

function kmBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

export interface OptionFlags {
  best: boolean;
}

function optionFlags(place: Place): Map<string, OptionFlags> {
  const byMonth = new Map<string, Offer>();
  for (const option of place.options) {
    const key = option.start.slice(0, 7);
    const current = byMonth.get(key);
    if (!current || offerTotal(option) <= offerTotal(current)) byMonth.set(key, option);
  }
  const best = new Set([...byMonth.values()].map((option) => option.start));
  const map = new Map<string, OptionFlags>();
  for (const option of place.options) map.set(option.start, { best: best.has(option.start) });
  return map;
}

function renderCalendar(start: string, end: string): string {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  const cal = (monthIndex: number, day: string) => `<span class="cal" aria-hidden="true"><span class="cal__top" style="background:${monthColor(monthIndex)}">${MONTHS_ABBR[monthIndex]}</span><span class="cal__day">${day}</span></span>`;
  return `${cal(from.getUTCMonth(), String(from.getUTCDate()))}<span class="cal__arrow">-&gt;</span>${cal(to.getUTCMonth(), String(to.getUTCDate()))}`;
}

function hotelMeta(hotel: HotelPrice): string {
  const parts: string[] = [];
  if (hotel.stars) parts.push(`${hotel.stars}*`);
  if (hotel.reviews > 0) parts.push(`${hotel.score.toFixed(1)}/10 z ${hotel.reviews} opinii`);
  if (hotel.km > 0) parts.push(`${hotel.km} km od centrum`);
  return parts.join(' - ');
}

function shortHotelName(name: string): string {
  return name.length > 42 ? `${name.slice(0, 40).trimEnd()}...` : name;
}

function renderOption(offer: Offer, flags: OptionFlags | undefined, originIata: string): string {
  const hotel = offer.hotel;
  const total = offerTotal(offer);
  const headline = `łącznie ${total} zł`;
  const full = formatRange(offer.start, offer.end, offer.nights);
  const cls = flags?.best ? 'opt opt--best' : 'opt';
  const badge = flags?.best ? '<span class="opt__badge">Dobra oferta</span>' : '';
  const flightRow = `<div class="opt__line"><span class="opt__ico">-</span><a class="opt__lbl" href="${esc(offer.flightUrl)}" rel="nofollow sponsored noopener" target="_blank">Lot ${originIata}-${offer.iata}</a><span class="opt__val">${Math.round(offer.price)} zł/os</span></div>`;
  const hotelRow = hotel
    ? `<div class="opt__line"><span class="opt__ico">-</span><a class="opt__lbl" href="${esc(hotel.url)}" rel="nofollow sponsored noopener" target="_blank">${escapeHtml(shortHotelName(hotel.name))}</a><span class="opt__val">${hotel.perPerson} zł/os</span></div>
            <div class="opt__hotelmeta">${escapeHtml(hotelMeta(hotel))}</div>`
    : `<div class="opt__line"><span class="opt__ico">-</span><span class="opt__lbl muted">bez hotelu - sam lot</span></div>`;
  return `          <li class="${cls}">
            ${badge}
            <div class="opt__head"><a class="opt__date" href="${esc(offer.flightUrl)}" rel="nofollow sponsored noopener" target="_blank" aria-label="${escapeHtml(full)}">${renderCalendar(offer.start, offer.end)}<span class="sr-only">${escapeHtml(full)}</span></a><span class="opt__right"><span class="opt__total">${headline}</span><span class="opt__nights">${nightsLabel(offer.nights)}, za osobę</span></span></div>
            <div class="opt__detail">${flightRow}${hotelRow}</div>
            <div class="opt__actions"><a href="${esc(offer.flightUrl)}" rel="nofollow sponsored noopener" target="_blank">Bilety lotnicze</a><a href="${esc(offer.stayUrl)}" rel="nofollow sponsored noopener" target="_blank">Noclegi (${nightsLabel(offer.nights)})</a><a href="${esc(offer.carUrl)}" rel="nofollow sponsored noopener" target="_blank">Auto od 49 zł/dzień</a></div>
          </li>`;
}

function renderAttraction(attraction: Attraction): string {
  const price = attraction.price != null ? `od ${Math.round(attraction.price)} zł` : '';
  const rating = attraction.rating ? ` - ${attraction.rating.toFixed(1)}/5` : '';
  const image = attraction.image
    ? `<img src="${esc(attraction.image)}" alt="${escapeHtml(attraction.name)}" loading="lazy" decoding="async" width="72" height="72">`
    : '';
  return `          <li class="acard"><a href="${esc(attraction.link)}" rel="nofollow sponsored noopener" target="_blank"><span class="acard__img">${image}</span><span class="acard__body"><span class="acard__name">${escapeHtml(attraction.name)}</span><span class="muted">${price}${rating}</span></span></a></li>`;
}

function renderEvent(event: EventOffer): string {
  const kind = event.tag === 'biegi' ? 'Bieg' : 'Mecz';
  const venue = event.venue ? ` - ${escapeHtml(event.venue)}` : '';
  const km = event.km ? ` - ${event.km} km` : '';
  const title = event.link
    ? `<a href="${esc(event.link)}" rel="nofollow noopener" target="_blank">${escapeHtml(event.title)}</a>`
    : escapeHtml(event.title);
  return `          <li>${kind}: ${title}<span class="muted"> ${formatDay(event.start)}${venue}${km}</span></li>`;
}

function renderDirections(links: { label: string; url: string }[]): string {
  if (links.length === 0) return '';
  const items = links
    .map((link) => `<a href="${esc(link.url)}" rel="nofollow noopener" target="_blank">${escapeHtml(link.label)}</a>`)
    .join('');
  return `        <h4>Jak dojechać</h4>\n        <div class="directions">${items}</div>\n`;
}

const FALLBACK_TINTS = ['#7a5cf0', '#2563EB', '#7A4FE0', '#0F766E', '#B45309'];

function fallbackPanel(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="place__ph" style="background:${FALLBACK_TINTS[hash % FALLBACK_TINTS.length]}">${escapeHtml(name)}</span>`;
}

function renderPlace(origin: OriginPage, place: Place, deal: FeaturedDeal | undefined, siblings: Place[]): string {
  const name = place.cityPl ?? place.city;
  const best = place.options[0];
  const source = place.imageCredit?.photoUrl.includes('wikimedia') ? 'Wikimedia Commons' : 'Unsplash';
  const credit = place.imageCredit?.author
    ? `<span class="credit">${escapeHtml(place.imageCredit.author)} / ${source}</span>`
    : '';
  const image = place.imageUrl
    ? `<img src="${esc(place.imageUrl)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async" width="240" height="200">`
    : fallbackPanel(name);
  const priced = place.options.filter((option) => option.hotel);
  const headline = priced.length > 0
    ? `od <strong>${Math.min(...priced.map((option) => Math.round(option.price + (option.hotel?.perPerson ?? 0))))} zł</strong>/os`
    : `od <strong>${Math.round(best.price)} zł</strong>/os`;
  const allPriced = priced.length === place.options.length;
  const note = allPriced ? 'za osobę, lot i nocleg' : priced.length > 0 ? 'za osobę, od: lot i nocleg' : 'za osobę, sam lot';
  const avg = Math.round(place.options.reduce((sum, option) => sum + option.price, 0) / place.options.length);
  const flags = optionFlags(place);
  const events = deal && deal.events.length
    ? `        <h4>Wydarzenia</h4>\n        <ul class="plain">\n${deal.events.map(renderEvent).join('\n')}\n        </ul>\n`
    : '';
  const attractions = deal && deal.attractions.length
    ? `        <h4>Atrakcje</h4>\n        <ul class="plain">\n${deal.attractions.map(renderAttraction).join('\n')}\n        </ul>\n`
    : '';
  const nearby = siblings
    .filter((other) => other.cityId !== null && place.nearby.includes(other.cityId) && other.city !== place.city)
    .slice(0, 8);
  const nearbyLinks = nearby.length > 0
    ? `        <h4>Miasta obok</h4>\n        <ul class="plain origins">${nearby.map((other) => `<li><a href="/${destinationSlug(origin, other)}">${escapeHtml(other.cityPl ?? other.city)} (${kmBetween(place.cityLat, place.cityLng, other.cityLat, other.cityLng)} km)</a></li>`).join('')}</ul>\n`
    : '';
  return `    <article class="place">
      <a class="place__img" href="${esc(best.flightUrl)}" rel="nofollow sponsored noopener" target="_blank">${image}${credit}</a>
      <div class="place__body">
        <h3><a href="/${destinationSlug(origin, place)}">${escapeHtml(name)}</a></h3>
        <p class="place__price">${headline} <span class="place__note">${note}</span> <span class="place__avg">średnio ${avg} zł za lot</span></p>
        <h4>Terminy</h4>
        <ul class="options">
${place.options.map((option) => renderOption(option, flags.get(option.start), origin.iata)).join('\n')}
        </ul>
${events}${attractions}${nearbyLinks}${renderDirections(deal?.directions ?? [])}      </div>
    </article>`;
}

function renderHotel(hotel: HotelOffer): string {
  const stars = hotel.stars ? `${hotel.stars}* - ` : '';
  const reviews = hotel.reviews > 0 ? `${hotel.score.toFixed(1)}/10 z ${hotel.reviews} opinii` : 'bez opinii';
  const km = hotel.km > 0 ? ` - ${hotel.km} km od centrum` : '';
  return `          <li class="hrow"><span class="opt__ico">-</span><a href="${esc(hotel.url)}" rel="nofollow sponsored noopener" target="_blank">${escapeHtml(shortHotelName(hotel.name))}</a><span class="opt__val">${hotel.perPerson} zł/os</span></li>
          <li class="hrrow-meta"><span class="muted">${stars}${reviews}${km}</span></li>`;
}

export function slugify(text: string): string {
  const map: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
  return text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => map[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function destinationSlug(origin: OriginPage, place: Place): string {
  const citySlug = origin.slug.replace('tanie-loty-z-', '');
  return `tanie-loty-do-${slugify(place.cityPl ?? place.city)}-z-${citySlug}`;
}

function destinationSlugFor(origin: OriginPage, cityPlOrName: string): string {
  const citySlug = origin.slug.replace('tanie-loty-z-', '');
  return `tanie-loty-do-${slugify(cityPlOrName)}-z-${citySlug}`;
}

function destinationFaq(origin: OriginPage, name: string): { q: string; a: string }[] {
  return [
    { q: `Ile kosztuje lot z ${origin.genitive}?`, a: `Ceny w obie strony do kierunku ${name} są na liście terminów. Cena łączna dolicza połowę kosztu noclegu za dwie osoby.` },
    { q: `Kiedy lecieć z ${origin.genitive}?`, a: 'Najtaniej wypadają weekendy poza szczytem sezonu. Lista pokazuje najbliższe opcje.' },
    { q: 'Jak dojechać z lotniska do centrum?', a: 'W sekcji "Jak dojechać" są linki do nawigacji.' },
  ];
}

export function renderDestinationPage(
  origin: OriginPage, place: Place, deal: FeaturedDeal | undefined, siblings: Place[], generatedAt: string,
): string {
  const name = place.cityPl ?? place.city;
  const best = place.options[0];
  const priced = place.options.filter((option) => option.hotel);
  const headline = priced.length > 0
    ? Math.min(...priced.map((option) => Math.round(option.price + (option.hotel?.perPerson ?? 0))))
    : Math.round(best.price);
  const url = `${PUBLIC_BASE}/${destinationSlug(origin, place)}`;
  const title = `${name} - tanie loty z ${origin.genitive}`;
  const description = `${name}: tanie loty z ${origin.genitive} - najtańsze weekendy, ceny w obie strony, noclegi i wydarzenia. Od ${headline} zł/os.`;
  const heroImage = place.imageLargeUrl;
  const flags = optionFlags(place);
  const avg = Math.round(place.options.reduce((sum, option) => sum + option.price, 0) / place.options.length);
  const options = place.options.map((option) => renderOption(option, flags.get(option.start), origin.iata)).join('\n');
  const hotels = deal && deal.hotels.length
    ? `<h2>Noclegi</h2>\n<ul class="plain">${deal.hotels.map(renderHotel).join('')}</ul>`
    : '';
  const attractions = deal && deal.attractions.length
    ? `<h2>Atrakcje</h2>\n<ul class="plain">${deal.attractions.map(renderAttraction).join('')}</ul>`
    : '';
  const events = deal && deal.events.length
    ? `<h2>Wydarzenia</h2>\n<ul class="plain">${deal.events.map(renderEvent).join('')}</ul>`
    : '';
  const directions = deal && deal.directions.length
    ? `<h2>Jak dojechać</h2>\n<div class="directions">${deal.directions.map((link) => `<a href="${esc(link.url)}" rel="nofollow noopener" target="_blank">${escapeHtml(link.label)}</a>`).join('')}</div>`
    : '';
  const faq = destinationFaq(origin, name);
  const faqHtml = faq.map((entry) => `<h3 class="faq__q">${escapeHtml(entry.q)}</h3><p class="faq__a">${escapeHtml(entry.a)}</p>`).join('');
  const links = siblings
    .filter((other) => other.city !== place.city)
    .slice(0, 12)
    .map((other) => `<li><a href="/${destinationSlug(origin, other)}">${escapeHtml(other.cityPl ?? other.city)} (${kmBetween(place.cityLat, place.cityLng, other.cityLat, other.cityLng)} km)</a></li>`)
    .join('');
  const monthKeys = [...new Set(place.options.map((option) => option.start.slice(0, 7)))].sort();
  const monthLinks = monthKeys
    .map((key) => `<a href="/${dealSlug(origin, place, key)}">${escapeHtml(monthParts(key).nominative)}</a>`)
    .join('');
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${url}#page`, url, name: title, inLanguage: 'pl-PL', image: heroImage },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Pan Peryskop', item: PUBLIC_BASE },
        { '@type': 'ListItem', position: 2, name: `Loty z ${origin.genitive}`, item: `${PUBLIC_BASE}/${origin.slug}` },
        { '@type': 'ListItem', position: 3, name: `${name}`, item: url },
      ] },
      { '@type': 'FAQPage', mainEntity: faq.map((entry) => ({ '@type': 'Question', name: entry.q, acceptedAnswer: { '@type': 'Answer', text: entry.a } })) },
    ],
  };
  const jsonLd = JSON.stringify(graph).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - od ${headline} zł/os | Pan Peryskop</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="pl_PL">
${heroImage ? `<meta property="og:image" content="${heroImage}">` : ''}
<script type="application/ld+json">${jsonLd}</script>
<style>${SITE_CSS}${ORIGIN_CSS}</style>
</head>
<body>
${renderHeader(origin)}
<h1>${escapeHtml(title)}</h1>
<p class="lead">Kierunek ${escapeHtml(name)}: najtańsze weekendy z ${escapeHtml(origin.genitive)}. Od ${headline} zł/os. Cena za osobę; lot w obie strony, a nocleg gdy podany.</p>
${heroImage ? `<img class="hero" src="${esc(heroImage)}" alt="${escapeHtml(name)}" fetchpriority="high" decoding="async" width="1000" height="500">` : ''}
<h2>Terminy i ceny</h2>
<p class="muted">Średnia cena lotu: ${avg} zł/os.</p>
<ul class="options">
${options}
</ul>
${hotels}
${attractions}
${events}
${directions}
<h2>Częste pytania</h2>
${faqHtml}
${monthLinks ? `<h2>Terminy miesięczne</h2><ul class="plain origins">${monthLinks}</ul>` : ''}
${links ? `<h2>Inne kierunki z ${escapeHtml(origin.genitive)}</h2><ul class="plain origins">${links}</ul>` : ''}
${renderFooter()}
<p class="foot">Wygenerowano ${escapeHtml(generatedAt)}. Ceny są orientacyjne. Serwis korzysta z linków partnerskich.</p>
</body>
</html>`;
}


function docHead(title: string, description: string, url: string, image: string | null, jsonLd: string, noindex = false): string {
  const robots = noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large';
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | Pan Peryskop</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="pl_PL">
<meta name="twitter:card" content="summary_large_image">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<script type="application/ld+json">${jsonLd}</script>
<style>${SITE_CSS}${ORIGIN_CSS}</style>
</head>
<body>`;
}

export function renderMonthPage(origin: OriginPage, places: Place[], featured: FeaturedDeal[], key: string, generatedAt: string): string {
  const mp = monthParts(key);
  const rows = places.map((place) => {
    const opts = monthOptions(place, key);
    if (opts.length === 0) return '';
    const best = opts.reduce((a, b) => (b.price < a.price ? b : a), opts[0]);
    const total = best.hotel ? Math.round(best.price + best.hotel.perPerson) : Math.round(best.price);
    return `      <li><a href="/${dealSlug(origin, place, key)}">${escapeHtml(place.cityPl ?? place.city)}</a><span class="muted"> od ${total} zł/os - ${formatRangeShort(best.start, best.end)}, ${nightsLabel(best.nights)}</span></li>`;
  }).filter(Boolean).join('\n');
  const events = featured.flatMap((deal) => deal.events).filter((event) => event.start.slice(0, 7) === key);
  const eventsHtml = events.length
    ? `<h2>Wydarzenia</h2>\n<ul class="plain">${events.slice(0, 12).map(renderEvent).join('')}</ul>`
    : '';
  const attractions = featured.flatMap((deal) => deal.attractions).slice(0, 6);
  const attractionsHtml = attractions.length
    ? `<h2>Atrakcje</h2>\n<ul class="plain">${attractions.map(renderAttraction).join('')}</ul>`
    : '';
  const title = `Tanie loty z ${origin.genitive} - ${mp.nominative}`;
  const url = `${PUBLIC_BASE}/${origin.slug}/${mp.slug}`;
  const graph = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url, inLanguage: 'pl-PL' };
  const past = key < new Date().toISOString().slice(0, 7);
  return `${docHead(title, `${title}. Najtańsze kierunki, wydarzenia i atrakcje. Ceny za osobę.`, url, null, JSON.stringify(graph).replace(/</g, '\\u003c'), past)}
${renderHeader(origin)}
<main>
<h1>${escapeHtml(title)}</h1>
<p class="muted">Najtańsze kierunki w tym miesiącu. Ceny za osobę.</p>
<h2>Kierunki</h2>
<ul class="plain rows">
${rows}
</ul>
${eventsHtml}
${attractionsHtml}
</main>
${renderFooter()}
<p class="muted">Wygenerowano ${escapeHtml(generatedAt)}. Ceny są orientacyjne.</p>
</body>
</html>`;
}

export function renderDealPage(origin: OriginPage, place: Place, deal: FeaturedDeal | undefined, key: string, generatedAt: string): string {
  const opts = monthOptions(place, key);
  if (opts.length === 0) return '';
  const option = opts.reduce((a, b) => (b.price < a.price ? b : a), opts[0]);
  const mp = monthParts(key);
  const name = place.cityPl ?? place.city;
  const title = `${name} - tani weekend w ${mp.locative}`;
  const url = `${PUBLIC_BASE}/${dealSlug(origin, place, key)}`;
  const hotels = deal && deal.hotels.length ? `<h2>Noclegi</h2>\n<ul class="plain">${deal.hotels.map(renderHotel).join('')}</ul>` : '';
  const attractions = deal && deal.attractions.length ? `<h2>Atrakcje</h2>\n<ul class="plain">${deal.attractions.map(renderAttraction).join('')}</ul>` : '';
  const events = deal && deal.events.length ? `<h2>Wydarzenia</h2>\n<ul class="plain">${deal.events.map(renderEvent).join('')}</ul>` : '';
  const directions = deal && deal.directions.length ? `<h2>Jak dojechać</h2>\n<div>${deal.directions.map((link) => `<a href="${esc(link.url)}" rel="nofollow noopener" target="_blank">${escapeHtml(link.label)}</a>`).join(' ')}</div>` : '';
  const graph = { '@context': 'https://schema.org', '@type': 'WebPage', name: title, url, inLanguage: 'pl-PL' };
  return `${docHead(title, `${title}. Lot, hotel i atrakcje. Cena za osobę.`, url, place.imageLargeUrl, JSON.stringify(graph).replace(/</g, '\\u003c'), true)}
${renderHeader(origin)}
<h1>${escapeHtml(title)}</h1>
<p class="muted">Najtańszy termin w tym miesiącu. Cena łączna to lot plus połowa noclegu za dwie osoby.</p>
<ul class="options">
${renderOption(option, { best: true }, origin.iata)}
</ul>
${hotels}
${attractions}
${events}
${directions}
<p><a href="/${destinationSlug(origin, place)}">Wszystkie terminy: ${escapeHtml(name)}</a> - <a href="/${origin.slug}/${mp.slug}">Cały ${escapeHtml(mp.nominative)}</a></p>
${renderFooter()}
<p class="muted">Wygenerowano ${escapeHtml(generatedAt)}.</p>
</body>
</html>`;
}

export function renderConnectionsPage(origin: OriginPage, places: Place[], generatedAt: string, extra: { slug: string; label: string }[] = []): string {
  const rows = places.map((place) => {
    const best = place.options[0];
    return `      <li><a href="/${destinationSlug(origin, place)}">${escapeHtml(place.cityPl ?? place.city)}</a><span class="muted"> od ${Math.round(best.price)} zł/os za lot (${best.iata} ${best.carrier})</span></li>`;
  }).join('\n');
  const known = new Set(places.map((place) => destinationSlug(origin, place)));
  const extras = extra
    .filter((item) => !known.has(item.slug))
    .map((item) => `      <li><a href="/${item.slug}">${escapeHtml(item.label)}</a></li>`)
    .join('\n');
  const title = `Wszystkie połączenia z ${origin.genitive}`;
  const url = `${PUBLIC_BASE}/${origin.slug}/polaczenia`;
  const graph = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url, inLanguage: 'pl-PL' };
  return `${docHead(title, `${title}. Ceny lotów w obie strony za osobę.`, url, null, JSON.stringify(graph).replace(/</g, '\\u003c'))}
${renderHeader(origin)}
<h1>${escapeHtml(title)}</h1>
<p class="muted">Wszystkie kierunki i najtańsze ceny lotów za osobę.</p>
<ul class="plain rows">
${rows}
${extras}
</ul>
${renderFooter()}
<p class="muted">Wygenerowano ${escapeHtml(generatedAt)}.</p>
</body>
</html>`;
}

export function renderIndexPage(generatedAt: string): string {
  const links = ORIGIN_PAGES
    .map((origin) => `<li><a href="/${origin.slug}">Tanie loty z ${escapeHtml(origin.genitive)}</a></li>`)
    .join('');
  const url = `${PUBLIC_BASE}/tanie-loty`;
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tanie loty i weekendy z 12 polskich lotnisk | Pan Peryskop</title>
<meta name="description" content="Najtańsze weekendy z 12 polskich lotnisk. Lot, hotel i wydarzenia. Wybierz miasto wylotu.">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="Tanie loty i weekendy z polskich lotnisk">
<meta property="og:description" content="Wybierz miasto wylotu. Najtańsze kierunki, terminy, noclegi i wydarzenia.">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="pl_PL">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="https://panperyskop.app/icon.png">
<style>${SITE_CSS}${HUB_CSS}</style>
</head>
<body>
  <header class="site">
    <a class="brand" href="/">Pan<span class="grad-text">Peryskop</span></a>
    <a class="crumb" href="/">Strona główna</a>
    <a class="btn" href="https://apps.apple.com/pl/app/pan-peryskop/id6803138750" rel="noopener">Pobierz</a>
  </header>
<h1>Tanie loty i weekendy z polskich lotnisk</h1>
<p class="lead">12 lotnisk wylotu w Polsce. Wybierz swoje i zobacz najtańsze kierunki oraz terminy.</p>
<div class="hub"><ul class="plain">${links}</ul></div>
${renderFooter()}
<p class="foot">Wygenerowano ${escapeHtml(generatedAt)}. Ceny są orientacyjne.</p>
</body>
</html>`;
}

interface PartnerCard {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  logo: string;
  background: string;
  chevron: string;
}

const LOGO_BASE = '/media/partners';

const PARTNERS: PartnerCard[] = [
  {
    id: 'revolut', title: 'Darmowa karta walutowa', subtitle: 'Kurs przed płatnością, bez opłat',
    url: '/r/revolut', logo: `${LOGO_BASE}/revolut.png`,
    background: 'linear-gradient(135deg,#fff 0%,#fff 50%,#E4E7FF 72%,#B7BDFB 100%)', chevron: '#7a5cf0',
  },
  {
    id: 'airhelp', title: 'Opóźniony lub odwołany lot?', subtitle: 'Nawet 600 EUR odszkodowania',
    url: '/r/airhelp', logo: `${LOGO_BASE}/airhelp.png`,
    background: 'linear-gradient(135deg,#fff 0%,#fff 50%,#F2DCE3 72%,#DDA9BA 100%)', chevron: '#B3516E',
  },
  {
    id: 'saily', title: 'Karta eSIM bez limitu w Europie', subtitle: 'Od 16 zł na wyjazd',
    url: '/r/saily', logo: `${LOGO_BASE}/saily.png`,
    background: 'linear-gradient(135deg,#fff 0%,#fff 50%,#FFF7A8 72%,#FFF500 100%)', chevron: '#C7B000',
  },
];

function renderPartnerCard(card: PartnerCard): string {
  return `      <a class="pcard" href="${esc(card.url)}" rel="nofollow sponsored" target="_blank" style="background:${card.background}">
        <img class="pcard__logo" src="${esc(card.logo)}" alt="" loading="lazy" decoding="async" width="40" height="40">
        <span class="pcard__body"><span class="pcard__title">${escapeHtml(card.title)}</span><span class="pcard__sub">${escapeHtml(card.subtitle)}</span></span>
        <span class="pcard__chev" style="color:${card.chevron}">&gt;</span>
      </a>`;
}

function renderCarCard(place: Place | undefined): string {
  const carUrl = place?.options[0]?.carUrl;
  if (!carUrl) return '';
  return `      <a class="pcard" href="${esc(carUrl)}" rel="nofollow sponsored" target="_blank" style="background:linear-gradient(135deg,#fff 0%,#fff 50%,#DCE9FF 72%,#A8C6FF 100%)">
        <img class="pcard__logo" src="${LOGO_BASE}/qeeq.png" alt="" loading="lazy" decoding="async" width="40" height="40">
        <span class="pcard__body"><span class="pcard__title">Wynajmij auto przy lotnisku</span><span class="pcard__sub">Od 49 zł/dzień, bezpłatne odwołanie</span></span>
        <span class="pcard__chev" style="color:#3570E6">&gt;</span>
      </a>`;
}

function renderHeader(origin: OriginPage): string {
  const links = ORIGIN_PAGES
    .filter((page) => page.id !== origin.id)
    .map((page) => `<li><a href="/${page.slug}">${escapeHtml(page.name)}</a></li>`)
    .join('');
  return `  <header class="site">
    <a class="brand" href="/">Pan<span class="grad-text">Peryskop</span></a>
    <a class="crumb" href="/tanie-loty">Tanie loty</a>
    <a class="btn" href="https://apps.apple.com/pl/app/pan-peryskop/id6803138750" rel="noopener">Pobierz</a>
    <nav class="origins" aria-label="Loty z innych miast"><span class="origins__label">Loty z:</span><ul class="plain origins">${links}</ul></nav>
  </header>`;
}

function renderFooter(): string {
  const links = ORIGIN_PAGES
    .map((origin) => `<li><a href="/${origin.slug}">${escapeHtml(origin.name)}</a></li>`)
    .join('');
  return `  <footer class="site-foot">
    <nav class="origins" aria-label="Lotniska"><ul class="plain origins">${links}</ul></nav>
    <p class="foot-links"><a href="/tanie-loty">Wszystkie lotniska</a> - <a href="/sitemap.xml">Mapa strony</a> - <a href="/llms.txt">Dla AI</a></p>
  </footer>`;
}

function renderPartners(places: Place[]): string {
  return `  <section class="partners">
    <h2>Partnerzy</h2>
${renderPartnerCard(PARTNERS[0])}
${renderCarCard(places[0])}
${PARTNERS.slice(1).map(renderPartnerCard).join('\n')}
  </section>`;
}

export function faqFor(origin: OriginPage): { q: string; a: string }[] {
  return [
    {
      q: `Kiedy loty z ${origin.genitive} są najtańsze?`,
      a: 'Lista pokazuje najtańsze weekendy w najbliższych miesiącach. Poza sezonem jest zwykle taniej.',
    },
    {
      q: `Jak zarezerwować lot z ${origin.genitive}?`,
      a: 'Wybierz termin z listy i kliknij "Bilety lotnicze". Bilet kupujesz u przewoźnika. Ceny są za osobę, w obie strony.',
    },
    {
      q: 'Czy cena zawiera nocleg?',
      a: 'Cena "od ... zł/os" to sam lot. Cena łączna dolicza połowę kosztu noclegu za dwie osoby.',
    },
    {
      q: `Z jakiego lotniska są loty z ${origin.genitive}?`,
      a: `Z lotniska ${origin.iata} w ${origin.name}. Obsługiwane kierunki są na liście powyżej.`,
    },
  ];
}

function buildJsonLd(origin: OriginPage, sections: WindowSection[], places: Place[]): string {
  const url = `${PUBLIC_BASE}/${origin.slug}`;
  const items = places.flatMap((place) => place.options.map((offer) => ({
    '@type': 'Offer',
    name: `${origin.name} - ${offer.city}, ${nightsLabel(offer.nights)}`,
    price: offer.hotel ? Math.round(offer.price + offer.hotel.perPerson) : Math.round(offer.price),
    priceCurrency: 'PLN',
    url: `${PUBLIC_BASE}/${destinationSlugFor(origin, place.city)}`,
    priceValidUntil: offer.end,
    availability: 'https://schema.org/InStock',
    validFrom: offer.start,
    description: offer.hotel ? 'Cena za osobę, lot i nocleg' : 'Cena za osobę, sam lot',
  })));
  const graph = [
    {
      '@type': 'WebPage',
      '@id': `${url}#page`,
      url,
      name: `Tanie loty z ${origin.genitive}`,
      inLanguage: 'pl-PL',
      isPartOf: { '@type': 'WebSite', name: 'Pan Peryskop', url: PUBLIC_BASE },
      image: places.find((place) => place.imageLargeUrl)?.imageLargeUrl,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Pan Peryskop', item: PUBLIC_BASE },
        { '@type': 'ListItem', position: 2, name: `Loty z ${origin.genitive}`, item: url },
      ],
    },
    {
      '@type': 'ItemList',
      name: `Tanie weekendy z ${origin.genitive}`,
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, item })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqFor(origin).map((entry) => ({
        '@type': 'Question',
        name: entry.q,
        acceptedAnswer: { '@type': 'Answer', text: entry.a },
      })),
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

const TIPS = [
  'Sprawdź kilka weekendów, nie tylko jeden. Ceny zmieniają się z dnia na dzień.',
  'Sprawdzaj cały miesiąc, nie jeden dzień.',
  'Poza sezonem jest zwykle taniej niż w wakacje i ferie.',
  'Z bagażem podręcznym sprawdź limity przewoźnika przed zakupem.',
];

const ADVICE = [
  'Bagaż: linie niskokosztowe mają własne limity. Sprawdź je przed zakupem.',
  'Dokumenty: sprawdź ważność dowodu lub paszportu. Część krajów wymaga wizy.',
  'Ubezpieczenie: warto wykupić polisę podróżną, szczególnie na wyjazd zagraniczny.',
];

function renderList(items: string[]): string {
  return `<ul class="plain">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderPopular(origin: OriginPage, places: Place[]): string {
  if (places.length === 0) return '';
  const items = places.slice(0, 6).map((place) => {
    const name = place.cityPl ?? place.city;
    const priced = place.options.filter((option) => option.hotel);
    const best = place.options[0];
    const price = priced.length > 0
      ? Math.min(...priced.map((option) => Math.round(option.price + (option.hotel?.perPerson ?? 0))))
      : Math.round(best.price);
    return `<li><a href="${esc(best.flightUrl)}" rel="nofollow sponsored noopener" target="_blank">${escapeHtml(name)}</a><span class="muted"> od ${price} zł/os</span></li>`;
  }).join('');
  return `  <section class="editorial">
    <h2>Popularne kierunki z ${escapeHtml(origin.genitive)}</h2>
    <ul class="plain rows">${items}</ul>
  </section>`;
}

function renderFaq(origin: OriginPage): string {
  const items = faqFor(origin)
    .map((entry) => `<h3 class="faq__q">${escapeHtml(entry.q)}</h3><p class="faq__a">${escapeHtml(entry.a)}</p>`)
    .join('');
  return `  <section class="editorial">
    <h2>Częste pytania o loty z ${escapeHtml(origin.genitive)}</h2>
    ${items}
  </section>`;
}

function renderEditorial(origin: OriginPage, places: Place[]): string {
  const about = `  <section class="editorial">
    <h2>O tym zestawieniu</h2>
    <p>Zestawienie pokazuje najtańsze weekendy z ${escapeHtml(origin.genitive)}. Ceny lotów pochodzą z Ryanair i Wizzair i są za osobę w obie strony. Cena łączna dolicza nocleg dla dwóch osób, gdy jest dostępny. Wydarzenia to mecze i biegi w okolicy. Ceny zmieniają się u przewoźnika.</p>
  </section>`;
  const popular = renderPopular(origin, places);
  const tips = `  <section class="editorial">
    <h2>Jak znaleźć najtańsze loty z ${escapeHtml(origin.genitive)}</h2>
    ${renderList(TIPS)}
  </section>`;
  const advice = `  <section class="editorial">
    <h2>Porady przed wyjazdem</h2>
    ${renderList(ADVICE)}
  </section>`;
  return `${about}\n${popular}\n${tips}\n${advice}\n${renderFaq(origin)}`;
}

export function renderPage(data: OriginData): string {
  const { origin, sections, featured, generatedAt } = data;
  const places = groupPlaces(sections);
  const dealByCity = new Map(featured.map((deal) => [foldCity(deal.offer.city), deal]));
  const title = `Tanie loty z ${origin.genitive}`;
  const description = `Tanie loty z ${origin.genitive}. Najtańsze weekendy, ceny lotów, hotele i wydarzenia (biegi, mecze). Sprawdź terminy i ceny.`;
  const url = `${PUBLIC_BASE}/${origin.slug}`;
  const heroImage = places.find((place) => place.imageLargeUrl)?.imageLargeUrl;
  const cards = places.map((place) => renderPlace(origin, place, dealByCity.get(foldCity(place.city)), places)).join('\n');
  const others = ORIGIN_PAGES
    .filter((page) => page.id !== origin.id)
    .map((page) => `<li><a href="/${page.slug}">${escapeHtml(page.name)}</a></li>`)
    .join('');
  const monthKeys = [...new Set(places.flatMap((place) => place.options.map((option) => option.start.slice(0, 7))))].sort();
  const monthLinks = monthKeys
    .map((key) => `<li><a href="/${origin.slug}/${monthParts(key).slug}">${escapeHtml(monthParts(key).nominative)}</a></li>`)
    .join('');
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - weekendy, hotele i wydarzenia | Pan Peryskop</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="pl_PL">
${heroImage ? `<meta property="og:image" content="${heroImage}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="https://panperyskop.app/icon.png">
<script type="application/ld+json">${buildJsonLd(origin, sections, places)}</script>
<style>${SITE_CSS}${ORIGIN_CSS}</style>
</head>
<body>
${renderHeader(origin)}
<h1>${escapeHtml(title)}</h1>
<p class="lead">Loty, hotele i wydarzenia na najbliższe weekendy. Ceny podajemy za osobę.</p>
<h2>Kierunki i terminy</h2>
${cards}
${renderEditorial(origin, places)}
${renderPartners(places)}
<section class="editorial"><h2>Miesięczne zestawienia</h2><ul class="plain origins">${monthLinks}</ul><p class="foot-links"><a href="/${origin.slug}/polaczenia">Wszystkie połączenia z ${escapeHtml(origin.genitive)}</a></p></section>
<section class="editorial"><h2>Tanie loty z innych miast</h2><ul class="plain origins">${others}</ul></section>
${renderFooter()}
<p class="foot">Wygenerowano ${escapeHtml(generatedAt)}. Ceny są orientacyjne i mogą się zmienić u przewoźnika lub w hotelu. Serwis korzysta z linków partnerskich.</p>
</body>
</html>`;
}

export function originById(id: string): OriginPage | null {
  return ORIGIN_PAGES.find((origin) => origin.id === id) ?? null;
}

export function originBySlug(slug: string): OriginPage | null {
  return ORIGIN_PAGES.find((origin) => origin.slug === slug) ?? null;
}

export interface OriginData {
  origin: OriginPage;
  sections: WindowSection[];
  featured: FeaturedDeal[];
  generatedAt: string;
}

const PAGE_TTL_MS = 20 * 60_000;
const pageCache = new Map<string, { at: number; data: OriginData }>();

export async function originData(env: Env, id: string, force = false): Promise<OriginData | null> {
  const cached = pageCache.get(id);
  if (!force && cached && Date.now() - cached.at < PAGE_TTL_MS) return cached.data;
  const origin = originById(id);
  if (!origin) return null;
  const sections = await buildOffers(env, origin);
  const featured = await buildFeatured(env, sections);
  const data = { origin, sections, featured, generatedAt: todayWarsaw() };
  pageCache.set(id, { at: Date.now(), data });
  return data;
}

export async function originPage(env: Env, id: string, force = false): Promise<string | null> {
  const data = await originData(env, id, force);
  return data ? renderPage(data) : null;
}

export function renderJson(data: OriginData): string {
  const places = groupPlaces(data.sections);
  const dealByCity = new Map(data.featured.map((deal) => [foldCity(deal.offer.city), deal]));
  return JSON.stringify({
    origin: { id: data.origin.id, name: data.origin.name, iata: data.origin.iata },
    generatedAt: data.generatedAt,
    priceNote: 'Ceny za osobę. Cena łączna to lot plus połowa ceny noclegu za 2 osoby.',
    places: places.map((place) => {
      const deal = dealByCity.get(foldCity(place.city));
      const best = place.options[0];
      const priced = place.options.filter((option) => option.hotel);
      const total = priced.length > 0
        ? Math.min(...priced.map((option) => Math.round(option.price + (option.hotel?.perPerson ?? 0))))
        : null;
      return {
        city: place.city,
        cityPl: place.cityPl,
        iata: place.iata,
        image: place.imageLargeUrl,
        imageCredit: place.imageCredit,
        priceFrom: { flight: best.price, total, currency: 'PLN', perPerson: true },
        options: place.options.map((offer) => ({
          start: offer.start,
          end: offer.end,
          nights: offer.nights,
          flightPrice: offer.price,
          hotelTotal: offer.hotel?.total ?? null,
          hotelName: offer.hotel?.name ?? null,
          totalPerPerson: offer.hotel ? Math.round(offer.price + offer.hotel.perPerson) : null,
          flightUrl: offer.flightUrl,
          stayUrl: offer.stayUrl,
          carUrl: offer.carUrl,
        })),
        hotels: (deal?.hotels ?? []).map((hotel) => ({
          name: hotel.name,
          stars: hotel.stars,
          score: hotel.score,
          reviews: hotel.reviews,
          perPerson: hotel.perPerson,
          url: hotel.url,
          lat: hotel.lat,
          lng: hotel.lng,
        })),
        events: (deal?.events ?? []).map((event) => ({
          title: event.title,
          tag: event.tag,
          start: event.start,
          venue: event.venue,
          link: event.link,
          lat: event.lat,
          lng: event.lng,
        })),
        attractions: (deal?.attractions ?? []).map((attraction) => ({
          name: attraction.name,
          price: attraction.price,
          currency: attraction.currency,
          rating: attraction.rating,
          link: attraction.link,
        })),
        directions: deal?.directions ?? [],
      };
    }),
  });
}

export function sitemapUrls(base: string): string[] {
  return ORIGIN_PAGES.map((origin) => `${base}/${origin.slug}`);
}
