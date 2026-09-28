import { addDaysWarsaw, todayWarsaw } from '../seed/core/dates';
import { destinationsFrom, foldCity, type Destination } from './airports';
import { fetchRyanairMonth, fetchWizzairMonth, type FlightCell } from './flightsApi';
import { staysWidgetUrl } from './stay22';
import { carRentalUrl } from './qeeq';
import {
  cityPhotoByCity, directionsUrl, economyMaxNightlyUsd, eventsInWindow, fetchCityHotels,
  type CityPhoto, type EventOffer, type HotelOffer, type Point,
} from './citybreak';
import { mintRedirect } from '../analytics/redirect';

export interface OriginPage {
  id: string;
  name: string;
  genitive: string;
  iata: string;
}

export const ORIGIN_PAGES: OriginPage[] = [
  { id: 'poznan', name: 'Poznań', genitive: 'Poznania', iata: 'POZ' },
  { id: 'warszawa', name: 'Warszawa', genitive: 'Warszawy', iata: 'WAW' },
  { id: 'wroclaw', name: 'Wrocław', genitive: 'Wrocławia', iata: 'WRO' },
  { id: 'gdansk', name: 'Gdańsk', genitive: 'Gdańska', iata: 'GDN' },
  { id: 'krakow', name: 'Kraków', genitive: 'Krakowa', iata: 'KRK' },
  { id: 'katowice', name: 'Katowice', genitive: 'Katowic', iata: 'KTW' },
  { id: 'rzeszow', name: 'Rzeszów', genitive: 'Rzeszowa', iata: 'RZE' },
  { id: 'bydgoszcz', name: 'Bydgoszcz', genitive: 'Bydgoszczy', iata: 'BZG' },
  { id: 'lodz', name: 'Łódź', genitive: 'Łodzi', iata: 'LCJ' },
  { id: 'szczecin', name: 'Szczecin', genitive: 'Szczecina', iata: 'SZZ' },
  { id: 'lublin', name: 'Lublin', genitive: 'Lublina', iata: 'LUZ' },
  { id: 'olsztyn', name: 'Olsztyn', genitive: 'Olsztyna', iata: 'SZY' },
];

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

const WEEKENDS = 4;
const PRICE_CAP = 800;
const PER_WINDOW = 12;
const MAX_OPTIONS_PER_PLACE = 6;
const MAX_ROUTES = 90;
const FETCH_CONCURRENCY = 6;

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

export function windowMonths(today: string): string[] {
  const months = new Set<string>();
  for (const friday of weekendAnchors(today, WEEKENDS)) {
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
    const window = carrier === 'ryanair'
      ? await fetchRyanairMonth(origin, destination.iata, month, db)
      : await fetchWizzairMonth(origin, destination.iata, month, db);
    out.push(...window.outbound);
    back.push(...window.returning);
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
  const photo = cityPhotoByCity(draft.city);
  return {
    city: draft.city,
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
  events: EventOffer[];
  directions: { label: string; url: string }[];
}

const ENRICH_CONCURRENCY = 3;
const HOTEL_BUDGET = 40;
const HOTEL_OPTIONS_PER_PLACE = 2;

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
  const photo = cityPhotoByCity(place.city);
  const airport: Point = { lat: place.lat, lng: place.lng };
  const center: Point = photo ? { lat: photo.lat, lng: photo.lng } : airport;
  const maxNightlyUsd = photo ? economyMaxNightlyUsd(photo.costUsd) : undefined;
  let firstHotel: HotelOffer | null = null;
  for (const option of place.options.slice(0, HOTEL_OPTIONS_PER_PLACE)) {
    if (budget.left <= 0) break;
    budget.left--;
    const [hotel] = await fetchCityHotels(env, center, option.start, option.end, maxNightlyUsd);
    if (!hotel) continue;
    option.hotel = {
      name: hotel.name, total: hotel.total, perPerson: hotel.perPerson, lat: hotel.lat, lng: hotel.lng,
    };
    if (!firstHotel) firstHotel = hotel;
  }
  const anchor = place.options[0];
  const events = await eventsInWindow(env.DB, center, anchor.start, anchor.end);
  return {
    offer: anchor,
    photo,
    hotels: firstHotel ? [firstHotel] : [],
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

export interface Place {
  city: string;
  cityPl: string | null;
  iata: string;
  lat: number;
  lng: number;
  imageUrl: string | null;
  imageLargeUrl: string | null;
  imageCredit: CityPhoto['credit'];
  options: Offer[];
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
          options: [offer],
        });
      }
    }
  }
  for (const place of byCity.values()) {
    place.options = place.options.sort((a, b) => a.price - b.price).slice(0, MAX_OPTIONS_PER_PLACE);
  }
  return [...byCity.values()].sort((a, b) => a.options[0].price - b.options[0].price);
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

export function formatDay(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS_GEN[day.getUTCMonth()]}`;
}

function renderOption(offer: Offer): string {
  const hotel = offer.hotel;
  const total = hotel ? Math.round(offer.price + hotel.perPerson) : null;
  const headline = total !== null ? `od ${total} zł/os` : `od ${Math.round(offer.price)} zł/os`;
  const detail = hotel
    ? `lot ${Math.round(offer.price)} zł/os + hotel ${hotel.total} zł za 2 osoby, od ${hotel.perPerson} zł/os`
    : `lot ${Math.round(offer.price)} zł/os, sam lot`;
  return `          <li class="opt">
            <div class="opt__head"><a class="opt__date" href="${offer.flightUrl}" rel="nofollow sponsored noopener" target="_blank">${formatRange(offer.start, offer.end, offer.nights)}</a><span class="opt__total">${headline}</span></div>
            <div class="opt__detail">${detail}</div>
            <div class="opt__actions"><a href="${offer.flightUrl}" rel="nofollow sponsored noopener" target="_blank">Wybierz lot</a><a href="${offer.stayUrl}" rel="nofollow sponsored noopener" target="_blank">Noclegi na te daty</a><a href="${offer.carUrl}" rel="nofollow sponsored noopener" target="_blank">Auto na te daty</a></div>
          </li>`;
}

function renderEvent(event: EventOffer): string {
  const kind = event.tag === 'biegi' ? 'Bieg' : 'Mecz';
  const venue = event.venue ? ` - ${escapeHtml(event.venue)}` : '';
  const title = event.link
    ? `<a href="${event.link}" rel="nofollow noopener" target="_blank">${escapeHtml(event.title)}</a>`
    : escapeHtml(event.title);
  return `          <li>${kind}: ${title}<span class="muted"> ${formatDay(event.start)}${venue}</span></li>`;
}

function renderDirections(links: { label: string; url: string }[]): string {
  if (links.length === 0) return '';
  const items = links
    .map((link) => `<a href="${link.url}" rel="nofollow noopener" target="_blank">${escapeHtml(link.label)}</a>`)
    .join('');
  return `        <h4>Jak dojechać</h4>\n        <div class="directions">${items}</div>\n`;
}

const FALLBACK_TINTS = ['#4F55F1', '#2563EB', '#7A4FE0', '#0F766E', '#B45309'];

function fallbackPanel(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="place__ph" style="background:${FALLBACK_TINTS[hash % FALLBACK_TINTS.length]}">${escapeHtml(name)}</span>`;
}

function renderPlace(place: Place, deal: FeaturedDeal | undefined): string {
  const name = place.cityPl ?? place.city;
  const best = place.options[0];
  const credit = place.imageCredit?.author
    ? `<span class="credit">${escapeHtml(place.imageCredit.author)} / Unsplash</span>`
    : '';
  const image = place.imageLargeUrl
    ? `<img src="${place.imageLargeUrl}" alt="${escapeHtml(name)}" loading="lazy">`
    : fallbackPanel(name);
  const priced = place.options.filter((option) => option.hotel);
  const headline = priced.length > 0
    ? `od <strong>${Math.min(...priced.map((option) => Math.round(option.price + (option.hotel?.perPerson ?? 0))))} zł</strong>/os`
    : `od <strong>${Math.round(best.price)} zł</strong>/os`;
  const note = priced.length > 0 ? 'za osobę, lot i nocleg' : 'za osobę, sam lot';
  const events = deal && deal.events.length
    ? `        <h4>Wydarzenia</h4>\n        <ul class="plain">\n${deal.events.map(renderEvent).join('\n')}\n        </ul>\n`
    : '';
  return `    <article class="place">
      <a class="place__img" href="${best.flightUrl}" rel="nofollow sponsored noopener" target="_blank">${image}${credit}</a>
      <div class="place__body">
        <h3><a href="${best.flightUrl}" rel="nofollow sponsored noopener" target="_blank">${escapeHtml(name)}</a></h3>
        <p class="place__price">${headline} <span class="place__note">${note}</span></p>
        <h4>Terminy</h4>
        <ul class="options">
${place.options.map(renderOption).join('\n')}
        </ul>
${events}${renderDirections(deal?.directions ?? [])}      </div>
    </article>`;
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

const LOGO_BASE = 'https://api.panperyskop.app/media/partners';

const PARTNERS: PartnerCard[] = [
  {
    id: 'revolut', title: 'Darmowa karta walutowa', subtitle: 'Kurs przed płatnością, bez opłat',
    url: 'https://api.panperyskop.app/r/revolut', logo: `${LOGO_BASE}/revolut.png`,
    background: 'linear-gradient(135deg,#fff 0%,#fff 50%,#E4E7FF 72%,#B7BDFB 100%)', chevron: '#4F55F1',
  },
  {
    id: 'airhelp', title: 'Opóźniony lub odwołany lot?', subtitle: 'Nawet 600 EUR odszkodowania',
    url: 'https://api.panperyskop.app/r/airhelp', logo: `${LOGO_BASE}/airhelp.png`,
    background: 'linear-gradient(135deg,#fff 0%,#fff 50%,#F2DCE3 72%,#DDA9BA 100%)', chevron: '#B3516E',
  },
  {
    id: 'saily', title: 'Karta eSIM bez limitu w Europie', subtitle: 'Od 16 zł na wyjazd',
    url: 'https://api.panperyskop.app/r/saily', logo: `${LOGO_BASE}/saily.png`,
    background: 'linear-gradient(135deg,#fff 0%,#fff 50%,#FFF7A8 72%,#FFF500 100%)', chevron: '#C7B000',
  },
];

function renderPartnerCard(card: PartnerCard): string {
  return `      <a class="pcard" href="${card.url}" rel="nofollow sponsored" target="_blank" style="background:${card.background}">
        <img class="pcard__logo" src="${card.logo}" alt="" loading="lazy">
        <span class="pcard__body"><span class="pcard__title">${escapeHtml(card.title)}</span><span class="pcard__sub">${escapeHtml(card.subtitle)}</span></span>
        <span class="pcard__chev" style="color:${card.chevron}">&gt;</span>
      </a>`;
}

function renderCarCard(place: Place | undefined): string {
  const carUrl = place?.options[0]?.carUrl;
  if (!carUrl) return '';
  return `      <a class="pcard" href="${carUrl}" rel="nofollow sponsored" target="_blank" style="background:linear-gradient(135deg,#fff 0%,#fff 50%,#DCE9FF 72%,#A8C6FF 100%)">
        <img class="pcard__logo" src="${LOGO_BASE}/qeeq.png" alt="" loading="lazy">
        <span class="pcard__body"><span class="pcard__title">Wynajmij auto przy lotnisku</span><span class="pcard__sub">Od 49 zł/dzień, bezpłatne odwołanie</span></span>
        <span class="pcard__chev" style="color:#3570E6">&gt;</span>
      </a>`;
}

function renderHeader(origin: OriginPage): string {
  const links = ORIGIN_PAGES
    .filter((page) => page.id !== origin.id)
    .map((page) => `<a href="/plan/${page.id}">${escapeHtml(page.name)}</a>`)
    .join('');
  return `  <header class="site">
    <a class="brand" href="https://panperyskop.app">Pan Peryskop</a>
    <nav class="origins"><span class="origins__label">Loty z:</span>${links}</nav>
  </header>`;
}

function renderPartners(places: Place[]): string {
  return `  <section class="partners">
    <h2>Partnerzy</h2>
${renderPartnerCard(PARTNERS[0])}
${renderCarCard(places[0])}
${PARTNERS.slice(1).map(renderPartnerCard).join('\n')}
  </section>`;
}

function buildJsonLd(origin: OriginPage, sections: WindowSection[]): string {
  const offers = sections.flatMap((section) => section.groups.flatMap((group) =>
    group.offers.map((offer) => ({
      '@type': 'Offer',
      name: `${origin.name} – ${offer.city}`,
      price: offer.price,
      priceCurrency: 'PLN',
      url: offer.flightUrl,
      availability: 'https://schema.org/InStock',
      validFrom: group.start,
    }))));
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Tanie loty na weekendy z ${origin.genitive}`,
    numberOfItems: offers.length,
    itemListElement: offers.map((offer, index) => ({ '@type': 'ListItem', position: index + 1, item: offer })),
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function renderPage(data: OriginData): string {
  const { origin, sections, featured, generatedAt } = data;
  const places = groupPlaces(sections);
  const dealByCity = new Map(featured.map((deal) => [foldCity(deal.offer.city), deal]));
  const title = `Tanie loty na weekendy z ${origin.genitive}`;
  const description = `Najtańsze loty na najbliższe weekendy z ${origin.genitive}. Terminy, hotele i wydarzenia (biegi, mecze) z linkami do rezerwacji.`;
  const canonical = `https://api.panperyskop.app/plan/${origin.id}`;
  const heroImage = places.find((place) => place.imageLargeUrl)?.imageLargeUrl;
  const content = places.map((place) => renderPlace(place, dealByCity.get(foldCity(place.city)))).join('\n');
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | Pan Peryskop</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="pl_PL">
${heroImage ? `<meta property="og:image" content="${heroImage}">` : ''}
<link rel="icon" href="https://panperyskop.app/icon.png">
<script type="application/ld+json">${buildJsonLd(origin, sections)}</script>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,Arial,sans-serif;color:#141414;margin:0 auto;padding:0 16px 48px;max-width:880px}
.site{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid #eee;margin-bottom:8px;flex-wrap:wrap}
.brand{font-weight:800;font-size:18px;color:#141414;text-decoration:none}
.origins{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px}
.origins__label{color:#888}
.origins a{color:#4F55F1;text-decoration:none;font-weight:600}
h1{font-size:28px;margin:16px 0 4px}
.lead{color:#555;margin:0 0 20px}
h2{font-size:19px;margin-top:34px;border-bottom:1px solid #eee;padding-bottom:6px}
.place{display:grid;grid-template-columns:240px 1fr;gap:0;border:1px solid #eee;border-radius:12px;overflow:hidden;margin:16px 0;align-items:stretch}
.place__img{position:relative;display:block;height:100%;min-height:200px;overflow:hidden;background:#eef0f7;text-decoration:none}
.place__img img{width:100%;height:100%;object-fit:cover;display:block}
.place__ph{display:flex;align-items:center;justify-content:center;height:100%;min-height:200px;padding:16px;text-align:center;font-size:20px;font-weight:700;color:#fff}
.credit{position:absolute;right:6px;bottom:4px;font-size:10px;color:#fff;background:rgba(0,0,0,.5);padding:1px 5px;border-radius:4px}
.place__body{padding:16px 18px 18px}
.place__body h3{margin:0 0 2px;font-size:21px}
.place__body h3 a{color:#141414;text-decoration:none}
.place__price{margin:0 0 14px;font-size:22px;font-weight:800;color:#141414}
.place__note{font-size:13px;font-weight:400;color:#6B7280}
.place__body h4{margin:22px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6B7280;border:0}
.options{list-style:none;padding:0;margin:0}
.opt{border:1px solid #eee;border-radius:10px;padding:12px;margin:10px 0}
.opt__head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.opt__date{color:#141414;text-decoration:none;font-weight:600;font-size:15px}
.opt__total{font-weight:700;white-space:nowrap;font-size:15px}
.opt__detail{margin-top:4px;color:#6B7280;font-size:13px}
.opt__actions{margin-top:10px;padding-top:10px;border-top:1px solid #f2f2f2}
.opt__actions a{display:inline-block;margin-right:16px;padding:4px 0;color:#4F55F1;text-decoration:none;font-weight:600;font-size:13px}
.plain{list-style:none;padding:0;margin:0;font-size:14px}
.plain li{padding:4px 0;border-bottom:1px solid #f4f4f4}
.directions a{display:inline-block;margin:2px 12px 2px 0;color:#4F55F1;text-decoration:none;font-weight:600;font-size:13px}
.muted{color:#6B7280}
.pcard{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;margin:8px 0;text-decoration:none;color:#141414}
.pcard__logo{width:40px;height:40px;flex:none;border-radius:9px;background:#fff;object-fit:contain;padding:5px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.pcard__body{flex:1;display:flex;flex-direction:column}
.pcard__title{font-weight:600;font-size:15px}
.pcard__sub{font-size:12px;opacity:.75}
.pcard__chev{font-size:20px;font-weight:700}
.foot{margin-top:34px;color:#888;font-size:12px}
@media(max-width:640px){.place{grid-template-columns:1fr}}
</style>
</head>
<body>
${renderHeader(origin)}
<h1>${escapeHtml(title)}</h1>
<p class="lead">Miejsca, terminy i hotele. Ceny za osobę.</p>
${content}
${renderPartners(places)}
<p class="foot">Wygenerowano ${escapeHtml(generatedAt)}. Ceny są orientacyjne i mogą się zmienić u przewoźnika. Serwis korzysta z linków partnerskich.</p>
</body>
</html>`;
}

export function originById(id: string): OriginPage | null {
  return ORIGIN_PAGES.find((origin) => origin.id === id) ?? null;
}

export interface OriginData {
  origin: OriginPage;
  sections: WindowSection[];
  featured: FeaturedDeal[];
  generatedAt: string;
}

const PAGE_TTL_MS = 20 * 60_000;
const pageCache = new Map<string, { at: number; data: OriginData }>();

export async function originData(env: Env, id: string): Promise<OriginData | null> {
  const cached = pageCache.get(id);
  if (cached && Date.now() - cached.at < PAGE_TTL_MS) return cached.data;
  const origin = originById(id);
  if (!origin) return null;
  const sections = await buildOffers(env, origin);
  const featured = await buildFeatured(env, sections);
  const data = { origin, sections, featured, generatedAt: todayWarsaw() };
  pageCache.set(id, { at: Date.now(), data });
  return data;
}

export async function originPage(env: Env, id: string): Promise<string | null> {
  const data = await originData(env, id);
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
        directions: deal?.directions ?? [],
      };
    }),
  });
}

export function sitemapUrls(base: string): string[] {
  return ORIGIN_PAGES.map((origin) => `${base}/plan/${origin.id}`);
}
