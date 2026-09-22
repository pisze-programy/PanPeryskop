// City-break seed. Sources: _internal/city-break-sources.md.
// Run: npx tsx backend/src/travel/gen-cities.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { airportCatalog, canonicalIata } from './airports';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'data', 'cities.json');
const CACHE = join(__dirname, '..', '..', '..', '_internal', 'nomads-cache');
const AGENT = 'PanPeryskop/1.0 (city seed; contact: dev@panperyskop.app)';
const BROWSER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const BAND_COUNT = 5;

const COUNTRY_CODES: Record<string, string> = {
  Albania: 'AL', Andorra: 'AD', Armenia: 'AM', Austria: 'AT', Azerbaijan: 'AZ',
  Belarus: 'BY', Belgium: 'BE', Bosnia: 'BA', 'Bosnia and Herzegovina': 'BA',
  Bulgaria: 'BG', Croatia: 'HR', Cyprus: 'CY', Czechia: 'CZ', Denmark: 'DK',
  Estonia: 'EE', Finland: 'FI', France: 'FR', Georgia: 'GE', Germany: 'DE',
  Gibraltar: 'GI', Greece: 'GR', Hungary: 'HU', Iceland: 'IS', Ireland: 'IE',
  Italy: 'IT', Jersey: 'JE', Kosovo: 'XK', Latvia: 'LV', Lithuania: 'LT',
  Luxembourg: 'LU', Malta: 'MT', Moldova: 'MD', Monaco: 'MC', Montenegro: 'ME',
  Netherlands: 'NL', 'North Macedonia': 'MK', Norway: 'NO', Poland: 'PL',
  Portugal: 'PT', Romania: 'RO', Russia: 'RU', Serbia: 'RS', Slovakia: 'SK',
  Slovenia: 'SI', Spain: 'ES', Sweden: 'SE', Switzerland: 'CH', Turkey: 'TR',
  Ukraine: 'UA', 'United Kingdom': 'GB', 'Vatican City': 'VA',
};

const NAME_OVERRIDES: Record<string, string> = {
  Rzeszow: 'Rzeszów',
  'Krivoy-Rog': 'Krzywy Róg',
  Cadiz: 'Kadyks',
  Klaipeda: 'Kłajpeda',
  Tromso: 'Tromsø',
  Iasi: 'Iași',
  Alesund: 'Ålesund',
  Jyvaskyla: 'Jyväskylä',
  Nizhny: 'Niżny Nowogród',
  'Saint Helier': 'Saint Helier',
  Comporta: 'Comporta',
  Arendal: 'Arendal',
  Javea: 'Javea',
  Cordoba: 'Kordoba',
  Kosice: 'Koszyce',
  Izmir: 'Izmir',
  'A Coruna': 'A Coruña',
};

const SETTLEMENT_TYPES = new Set([
  'Q486972', 'Q515', 'Q3957', 'Q532', 'Q1549591', 'Q1637706', 'Q15284',
  'Q902814', 'Q634', 'Q1777138', 'Q15239622', 'Q15303838',
]);

export interface CityFacts {
  costLocalUsd: number;
  internetMbps: number;
  tempNowC: number;
  humidityNow: number;
  airQualityNow: number;
  airQualityYear: number;
  safety: number | null;
  cleanliness: number | null;
  fun: number | null;
  nightlife: number | null;
  walkability: number | null;
  healthcare: number | null;
  english: number | null;
  lgbtFriendly: number | null;
  femaleFriendly: number | null;
  overall: number | null;
}

export interface ImageCredit {
  photoUrl: string;
  author: string;
  authorUrl: string;
}

export interface CityEntry {
  id: string;
  name: string;
  namePl: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  bandRank: number;
  costUsd: number;
  population: number;
  airports: string[];
  imageUrl: string;
  imageLargeUrl: string;
  imageCredit: ImageCredit | null;
  videoUrl: string | null;
  nearby: string[];
  next: string[];
  similar: string[];
  facts: CityFacts;
}

interface NomadsCity {
  name: string;
  country: string;
  short_slug: string;
  long_slug: string;
  latitude: number;
  longitude: number;
  region: string;
  population: number;
  cost_of_living_usd: number;
  air_quality: number;
  image: string;
  image_large: string;
}

interface NomadsFacts {
  slug: string;
  cost_for_local_usd_per_month: number;
  internet_mbps: number;
  temperature_c_now: number;
  humidity_now: number;
  air_quality_now: number;
  safety_score_0_to_5: number | null;
  cleanliness_score_0_to_5: number | null;
  fun_score_0_to_5: number | null;
  nightlife_score_0_to_5: number | null;
  walkability_score_0_to_5: number | null;
  healthcare_score_0_to_5: number | null;
  english_speaking_score_0_to_5: number | null;
  lgbt_friendly_score_0_to_5: number | null;
  female_friendly_score_0_to_5: number | null;
  overall_score: number | null;
}

function cachePath(name: string): string {
  mkdirSync(CACHE, { recursive: true });
  return join(CACHE, name);
}

async function cached<T>(name: string, url: string): Promise<T> {
  const file = cachePath(name);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T;
  const res = await fetch(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const body = (await res.json()) as T;
  writeFileSync(file, JSON.stringify(body));
  return body;
}

async function cachedHtml(name: string, url: string): Promise<string> {
  const file = cachePath(name);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_AGENT, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const body = await res.text();
  writeFileSync(file, body);
  return body;
}

function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
}

// The carriers name their own cities. The airport link comes from that name, not
// from a distance rule: a 150 km radius pairs Roosendaal with Brussels.
const CARRIER_AIRPORTS = new Map<string, string[]>();
for (const airport of airportCatalog()) {
  const key = fold(airport.city);
  const list = CARRIER_AIRPORTS.get(key) ?? [];
  const iata = canonicalIata(airport.iata);
  if (!list.includes(iata)) list.push(iata);
  CARRIER_AIRPORTS.set(key, list);
}

function carrierAirports(name: string): string[] {
  return CARRIER_AIRPORTS.get(fold(name)) ?? [];
}

const AIRPORT_RADIUS_KM = 150;

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function airportsNear(lat: number, lng: number): string[] {
  const codes = airportCatalog()
    .filter((a) => distanceKm(lat, lng, a.lat, a.lng) <= AIRPORT_RADIUS_KM)
    .sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng))
    .map((a) => canonicalIata(a.iata));
  return [...new Set(codes)];
}

/** Every airport that can serve the city: the carriers' own city name plus the
 *  airports within 150 km. The radius is what makes Milan reachable through
 *  Bergamo, which is the airport the carriers actually sell. Its known cost is a
 *  pair like Aachen → Charleroi; the plan accepts that trade. */
function cityAirports(name: string, lat: number, lng: number): string[] {
  return [...new Set([...carrierAirports(name), ...airportsNear(lat, lng)])];
}

function tabs(html: string): { near: string[]; next: string[]; similar: string[] } {
  const read = (name: string): string[] => {
    const start = html.indexOf(`tab tab-${name}`);
    if (start < 0) return [];
    const rest = html.slice(start + 10);
    const end = rest.indexOf('tab tab-');
    const body = end < 0 ? rest : rest.slice(0, end);
    return [...body.matchAll(/data-type="city"[^>]*data-slug="([^"]+)"/g)].map((m) => m[1]);
  };
  return { near: read('near'), next: read('next'), similar: read('similar') };
}

/** The Unsplash credit block the city page carries for its hero photo. */
function credit(html: string): ImageCredit | null {
  const start = html.indexOf('mediaCredits');
  if (start < 0) return null;
  const block = html.slice(start, start + 1200);
  const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const photoUrl = hrefs.find((href) => href.includes('unsplash.com/photos/'));
  if (!photoUrl) return null;
  const authorUrl = hrefs.find((href) => href.includes('unsplash.com/@'));
  const nameMatch = block.match(/unsplash\.com\/@[^"]*"[^>]*>([^<]+)</);
  return {
    photoUrl,
    author: nameMatch?.[1]?.trim() ?? '',
    authorUrl: authorUrl ?? '',
  };
}

async function cityPage(shortSlug: string): Promise<{ html: string }> {
  try {
    return { html: await cachedHtml(`near-${shortSlug}.html`, `https://nomads.com/near/${shortSlug}`) };
  } catch (error) {
    console.log(`no page for ${shortSlug}: ${(error as Error).message}`);
    return { html: '' };
  }
}

async function polishNames(names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const batchSize = 50;
  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize);
    const titles = batch.map((n) => encodeURIComponent(n)).join('|');
    const url = 'https://www.wikidata.org/w/api.php?action=wbgetentities'
      + `&sites=enwiki&titles=${titles}&props=labels|sitelinks&languages=pl&format=json&redirects=yes`;
    const body = await cached<{
      entities?: Record<string, {
        labels?: { pl?: { value: string } };
        sitelinks?: { enwiki?: { title: string } };
      }>;
    }>(`enwiki-${fold(batch[0])}-${batch.length}.json`, url);
    for (const entity of Object.values(body.entities ?? {})) {
      const en = entity.sitelinks?.enwiki?.title;
      const pl = entity.labels?.pl?.value;
      if (!en || !pl) continue;
      out.set(en.toLowerCase(), pl);
      out.set(fold(en), pl);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return out;
}

async function qidForPolishTitle(title: string): Promise<string | null> {
  const url = 'https://pl.wikipedia.org/w/api.php?action=query&format=json&redirects=1'
    + `&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(title)}`;
  const body = await cached<{
    query?: { pages?: Record<string, { pageprops?: { wikibase_item?: string } }> };
  }>(`plwiki-${fold(title)}.json`, url);
  const pages = Object.values(body.query?.pages ?? {});
  return pages[0]?.pageprops?.wikibase_item ?? null;
}

async function isSettlement(qid: string): Promise<boolean> {
  const url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json'
    + `&ids=${qid}&props=claims`;
  const body = await cached<{
    entities?: Record<string, {
      claims?: Record<string, { mainsnak?: { datavalue?: { value?: { id?: string } } } }[]>;
    }>;
  }>(`qid-${qid}.json`, url);
  const types = body.entities?.[qid]?.claims?.P31 ?? [];
  return types.some((c) => SETTLEMENT_TYPES.has(c.mainsnak?.datavalue?.value?.id ?? ''));
}

// Hannover is Hanower and Padova is Padwa, so the English title is not enough.
async function polishNameFromWikipedia(name: string): Promise<string | null> {
  const url = 'https://pl.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5'
    + `&search=${encodeURIComponent(name)}`;
  const body = await cached<[string, string[]]>(`plsearch-${fold(name)}.json`, url);
  for (const title of body[1] ?? []) {
    const qid = await qidForPolishTitle(title);
    if (qid && await isSettlement(qid)) return title;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return null;
}

function bandEdges(costs: number[]): number[] {
  const sorted = [...costs].sort((a, b) => a - b);
  const edges: number[] = [];
  for (let i = 1; i < BAND_COUNT; i += 1) {
    edges.push(sorted[Math.floor((sorted.length * i) / BAND_COUNT)]);
  }
  return edges;
}

function bandRank(cost: number, edges: number[]): number {
  let below = 0;
  for (const edge of edges) if (cost >= edge) below += 1;
  return BAND_COUNT - below;
}

function report(entries: CityEntry[], edges: number[]): void {
  console.log(`cities: ${entries.length}. cost bands (${BAND_COUNT}), USD/month. edges: ${edges.join(' | ')}`);
  for (let rank = 1; rank <= BAND_COUNT; rank += 1) {
    const inBand = entries.filter((e) => e.bandRank === rank);
    const names = inBand.slice(0, 6).map((e) => `${e.namePl} (${e.costUsd})`).join(', ');
    console.log(`  ${rank}: ${inBand.length} — ${names}`);
  }
  const countries = new Map<string, number>();
  for (const e of entries) countries.set(e.country, (countries.get(e.country) ?? 0) + 1);
  console.log(`countries (${countries.size}): ${[...countries.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}=${n}`).join(', ')}`);
}

async function main(): Promise<void> {
  const all = await cached<{ cities: NomadsCity[] }>('cities.json', 'https://nomads.com/api/cities');
  const europe = all.cities.filter((c) => c.region === 'Europe');

  const facts = new Map<string, NomadsFacts>();
  for (const country of [...new Set(europe.map((c) => c.country))]) {
    const name = `country-${country.toLowerCase().replace(/[^a-z]+/g, '-')}.json`;
    const url = `https://nomads.com/api/search?country=${encodeURIComponent(country)}&limit=100`;
    const rows = await cached<{ cities: NomadsFacts[] }>(name, url);
    for (const row of rows.cities) facts.set(row.slug, row);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const matched = europe.filter((c) => facts.has(c.long_slug));
  const costs = matched.map((c) => facts.get(c.long_slug)?.cost_for_local_usd_per_month ?? c.cost_of_living_usd);
  const edges = bandEdges(costs);
  const names = await polishNames([...new Set(matched.map((c) => c.name))]);
  for (const city of matched) {
    if (names.has(city.name.toLowerCase()) || names.has(fold(city.name))) continue;
    const pl = await polishNameFromWikipedia(city.name);
    if (pl) names.set(fold(city.name), pl);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const entries: CityEntry[] = [];
  for (const city of matched) {
    const row = facts.get(city.long_slug) as NomadsFacts;
    const cost = row.cost_for_local_usd_per_month || city.cost_of_living_usd;
    const namePl = names.get(city.name.toLowerCase()) ?? names.get(fold(city.name))
      ?? NAME_OVERRIDES[city.name];
    if (!namePl) console.log(`no Polish name: ${city.name}`);
    const page = await cityPage(city.short_slug);
    const links = tabs(page.html);
    entries.push({
      id: city.long_slug,
      name: city.name,
      namePl: namePl ?? city.name,
      country: city.country,
      countryCode: COUNTRY_CODES[city.country] ?? '',
      lat: city.latitude,
      lng: city.longitude,
      bandRank: bandRank(cost, edges),
      costUsd: cost,
      population: city.population,
      airports: cityAirports(city.name, city.latitude, city.longitude),
      imageUrl: city.image,
      imageLargeUrl: city.image_large,
      imageCredit: credit(page.html),
      videoUrl: null,
      nearby: links.near,
      next: links.next,
      similar: links.similar,
      facts: {
        costLocalUsd: cost,
        internetMbps: row.internet_mbps,
        tempNowC: row.temperature_c_now,
        humidityNow: row.humidity_now,
        airQualityNow: row.air_quality_now,
        airQualityYear: city.air_quality,
        safety: row.safety_score_0_to_5,
        cleanliness: row.cleanliness_score_0_to_5,
        fun: row.fun_score_0_to_5,
        nightlife: row.nightlife_score_0_to_5,
        walkability: row.walkability_score_0_to_5,
        healthcare: row.healthcare_score_0_to_5,
        english: row.english_speaking_score_0_to_5,
        lgbtFriendly: row.lgbt_friendly_score_0_to_5,
        femaleFriendly: row.female_friendly_score_0_to_5,
        overall: row.overall_score,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  entries.sort((a, b) => b.costUsd - a.costUsd);
  report(entries, edges);
  writeFileSync(OUT, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`wrote ${OUT}`);
}

void main();
