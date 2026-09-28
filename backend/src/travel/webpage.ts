import { addDaysWarsaw, todayWarsaw } from '../seed/core/dates';
import { destinationsFrom, foldCity, type Destination } from './airports';
import { fetchRyanairMonth, fetchWizzairMonth, type FlightCell } from './flightsApi';
import { staysWidgetUrl } from './stay22';
import { mintRedirect } from '../analytics/redirect';

export interface OriginPage {
  id: string;
  name: string;
  iata: string;
}

export const ORIGIN_PAGES: OriginPage[] = [
  { id: 'poznan', name: 'Poznań', iata: 'POZ' },
  { id: 'warszawa', name: 'Warszawa', iata: 'WAW' },
  { id: 'wroclaw', name: 'Wrocław', iata: 'WRO' },
  { id: 'gdansk', name: 'Gdańsk', iata: 'GDN' },
  { id: 'krakow', name: 'Kraków', iata: 'KRK' },
  { id: 'katowice', name: 'Katowice', iata: 'KTW' },
  { id: 'rzeszow', name: 'Rzeszów', iata: 'RZE' },
  { id: 'bydgoszcz', name: 'Bydgoszcz', iata: 'BZG' },
  { id: 'lodz', name: 'Łódź', iata: 'LCJ' },
  { id: 'szczecin', name: 'Szczecin', iata: 'SZZ' },
  { id: 'lublin', name: 'Lublin', iata: 'LUZ' },
  { id: 'olsztyn', name: 'Olsztyn', iata: 'SZY' },
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

export interface Offer {
  city: string;
  iata: string;
  carrier: string;
  window: string;
  start: string;
  end: string;
  nights: number;
  price: number;
  flightUrl: string;
  stayUrl: string;
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
  const aid = env.STAY22_AID ?? '';
  const sections: WindowSection[] = [];
  for (const window of WEEKEND_WINDOWS) {
    const groups = weekendAnchors(today, WEEKENDS).map((friday) => ({
      start: addDaysWarsaw(friday, window.startOffset),
      end: addDaysWarsaw(friday, window.endOffset),
      offers: [] as Offer[],
    }));
    for (const group of groups) {
      const byCity = new Map<string, Offer>();
      for (const fare of fares) {
        const price = routePrice(fare.out, fare.back, group.start, group.end);
        if (price === null || price > PRICE_CAP) continue;
        const key = foldCity(fare.destination.city);
        const current = byCity.get(key);
        if (current && current.price <= price) continue;
        byCity.set(key, {
          city: fare.destination.city,
          iata: fare.destination.iata,
          carrier: fare.carrier,
          window: window.key,
          start: group.start,
          end: group.end,
          nights: window.nights,
          price,
          flightUrl: await mintRedirect(env, 'flight', carrierBookingUrl(fare.carrier, origin.iata, fare.destination.iata, group.start, group.end)),
          stayUrl: await mintRedirect(env, 'stay', staysWidgetUrl(aid, {
            lat: fare.destination.lat, lng: fare.destination.lng,
            checkin: group.start, checkout: group.end,
            theme: 'light', view: 'full', adults: 2,
          })),
        });
      }
      group.offers = [...byCity.values()].sort((a, b) => a.price - b.price).slice(0, PER_WINDOW);
    }
    sections.push({ window, groups });
  }
  return sections;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderOffer(offer: Offer): string {
  const dates = `${offer.start} – ${offer.end}`;
  return `      <li class="row">
        <span class="dest">${escapeHtml(offer.city)}<em>${offer.nights} noce</em></span>
        <span class="dates">${dates}</span>
        <span class="price">${Math.round(offer.price)} zł</span>
        <span class="links"><a href="${offer.flightUrl}" rel="nofollow sponsored" target="_blank">LOTY</a><a href="${offer.stayUrl}" rel="nofollow sponsored" target="_blank">NOCLEGI</a></span>
      </li>`;
}

function renderGroup(group: { start: string; end: string; offers: Offer[] }): string {
  if (group.offers.length === 0) return '';
  return `    <h3>${group.start} – ${group.end}</h3>
    <ul class="list">
${group.offers.map(renderOffer).join('\n')}
    </ul>`;
}

function renderSection(section: WindowSection): string {
  const body = section.groups.map(renderGroup).filter(Boolean).join('\n');
  if (!body) return '';
  return `  <section>
    <h2>${section.window.label}</h2>
${body}
  </section>`;
}

export function renderPage(origin: OriginPage, sections: WindowSection[], generatedAt: string): string {
  const content = sections.map(renderSection).filter(Boolean).join('\n');
  const title = `Tanie loty na weekendy z ${origin.name}`;
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | Pan Peryskop</title>
<meta name="description" content="Najtańsze loty na najbliższe weekendy z ${escapeHtml(origin.name)}. Ceny lotów i noclegów z linkami do rezerwacji.">
<link rel="canonical" href="https://panperyskop.app/plan/${origin.id}">
<style>
body{font-family:system-ui,Arial,sans-serif;color:#141414;margin:0;padding:24px 16px;max-width:840px;margin:0 auto}
h1{font-size:26px}h2{font-size:19px;margin-top:32px;border-bottom:1px solid #eee;padding-bottom:6px}h3{font-size:15px;color:#555}
.list{list-style:none;padding:0;margin:0}.row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f2f2f2}
.dest{flex:1;font-weight:600}.dest em{font-weight:400;color:#888;font-style:normal;font-size:13px;margin-left:6px}
.dates{color:#555;font-size:13px}.price{font-weight:700;white-space:nowrap}
.links a{margin-left:8px;color:#4F55F1;text-decoration:none;font-weight:600;font-size:13px}
.foot{margin-top:32px;color:#888;font-size:12px}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>Ceny biletów w obie strony. Kliknij LOTY, aby sprawdzić termin, oraz NOCLEGI, aby wybrać hotel.</p>
${content}
<p class="foot">Wygenerowano ${escapeHtml(generatedAt)}. Ceny są orientacyjne i mogą się zmienić u przewoźnika. Serwis korzysta z linków partnerskich.</p>
</body>
</html>`;
}

export function originById(id: string): OriginPage | null {
  return ORIGIN_PAGES.find((origin) => origin.id === id) ?? null;
}

export async function originPage(env: Env, id: string): Promise<string | null> {
  const origin = originById(id);
  if (!origin) return null;
  const sections = await buildOffers(env, origin);
  return renderPage(origin, sections, todayWarsaw());
}
