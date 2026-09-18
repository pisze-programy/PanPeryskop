import { CONFIG } from '../config/index';
import { diacriticFold } from '../seed/core/match';
import ryanairAirportsJson from './data/ryanair-airports.json';
import ryanairConnectionsJson from './data/ryanair-connections.json';
import wizzairMapJson from './data/wizzair-airports-connections.json';

interface RyanairAirportRow {
  code: string;
  name: string;
  city: { name: string; code: string };
  region: { name: string; code: string };
  country: { code: string; name: string };
  coordinates: { latitude: number; longitude: number };
}
interface RyanairConnectionRow {
  iataCode: string;
  coordinates: { latitude: number; longitude: number };
  routes: string[];
  seasonalRoutes: string[];
}
interface WizzairCityRow {
  iata: string;
  shortName: string;
  countryName: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  isFakeStation: boolean;
  connections: Array<{ iata: string; isDirectFlight: boolean }>;
}

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
}

export interface Destination extends Airport {
  providers: Set<'ryanair' | 'wizzair'>;
}

export interface AirportRef {
  iata: string;
  lat: number;
  lng: number;
  name: string;
  country: string;
}

const ryanair = ryanairAirportsJson as RyanairAirportRow[];
const ryanairConn = ryanairConnectionsJson as RyanairConnectionRow[];
const wizzair = (wizzairMapJson as { cities: WizzairCityRow[] }).cities;

const catalog = new Map<string, Airport>();
for (const a of ryanair) {
  catalog.set(a.code, {
    iata: a.code, name: a.name, city: a.city.name, country: a.country.name,
    countryCode: a.country.code.toUpperCase(), lat: a.coordinates.latitude, lng: a.coordinates.longitude,
  });
}
for (const a of wizzair) {
  if (a.isFakeStation) continue;
  if (!catalog.has(a.iata)) {
    catalog.set(a.iata, {
      iata: a.iata, name: a.shortName, city: a.shortName, country: a.countryName,
      countryCode: a.countryCode, lat: a.latitude, lng: a.longitude,
    });
  }
}

export function airportCatalog(): Airport[] {
  return [...catalog.values()];
}

export function foldCity(city: string): string {
  return diacriticFold(city).replace(/[^a-z0-9]+/g, ' ');
}

// Fold each airport's city + name → its IATA. A multi-airport city averages its
// airports' coordinates so the geo fallback pins the city center, not an arbitrary
// member (London → STN would be a ~50 km error).
const byCity = new Map<string, AirportRef>();
const byToken = new Map<string, AirportRef>();

function index(ref: AirportRef, name: string): void {
  const key = diacriticFold(name);
  const existing = byCity.get(key);
  if (existing) {
    existing.lat = (existing.lat + ref.lat) / 2;
    existing.lng = (existing.lng + ref.lng) / 2;
  } else {
    byCity.set(key, { ...ref });
  }
  const STOP = new Set(['airport', 'international', 'central', 'city', 'all']);
  for (const t of new Set(diacriticFold(name).match(/[a-z0-9]+/g) ?? [])) {
    if (t.length >= 3 && !STOP.has(t) && !byToken.has(t)) byToken.set(t, ref);
  }
}

for (const a of catalog.values()) {
  const ref: AirportRef = { iata: a.iata, lat: a.lat, lng: a.lng, name: a.name, country: a.country };
  index(ref, a.city);
  index(ref, a.name);
}

export function airportForCity(city: string): AirportRef | null {
  const key = diacriticFold(city);
  return byCity.get(key) ?? byToken.get(key) ?? null;
}

export function keepEuropeanCityEvent(country: string, city: string): boolean {
  return CONFIG.travel.europe.countryNames.has(country) && airportForCity(city) !== null;
}

// ---- Routes ----
// A route exists only when the carrier lists the exact airport. The aggregate
// tokens (Ryanair city/region/country, Wizzair "(All Airports)") resolve to
// thousands of airports the carrier does not serve from that origin, so they are
// ignored. The explicit relation is symmetric in the data; we close it anyway.
const ryanairExplicit = new Map<string, Set<string>>();
for (const row of ryanairConn) {
  const dests = new Set<string>();
  for (const token of [...(row.routes ?? []), ...(row.seasonalRoutes ?? [])]) {
    const [type, value] = token.split(':');
    if (type === 'airport' && catalog.has(value)) dests.add(value);
  }
  ryanairExplicit.set(row.iataCode, dests);
}

const wizzairRealStations = new Set(wizzair.filter((c) => !c.isFakeStation).map((c) => c.iata));
const wizzairExplicit = new Map<string, Set<string>>();
for (const city of wizzair) {
  const dests = new Set<string>();
  for (const c of city.connections ?? []) {
    if (c.isDirectFlight && wizzairRealStations.has(c.iata)) dests.add(c.iata);
  }
  wizzairExplicit.set(city.iata, dests);
}

function withReverse(explicit: Map<string, Set<string>>, origin: string): Set<string> {
  const out = new Set(explicit.get(origin) ?? []);
  for (const [from, dests] of explicit) {
    if (from !== origin && dests.has(origin)) out.add(from);
  }
  return out;
}

function ryanairDestinations(iata: string): Set<string> {
  return withReverse(ryanairExplicit, iata);
}

function wizzairDestinations(iata: string): Set<string> {
  return withReverse(wizzairExplicit, iata);
}

/** Union of reachable airports from `origin` across both providers, with geo. */
export function destinationsFrom(origin: string): Destination[] {
  const byIata = new Map<string, Destination>();
  const add = (iata: string, provider: 'ryanair' | 'wizzair') => {
    if (iata === origin) return;
    const info = catalog.get(iata);
    if (!info) return;
    const existing = byIata.get(iata);
    if (existing) existing.providers.add(provider);
    else byIata.set(iata, { ...info, providers: new Set([provider]) });
  };
  for (const d of ryanairDestinations(origin)) add(d, 'ryanair');
  for (const d of wizzairDestinations(origin)) add(d, 'wizzair');
  return [...byIata.values()].sort((a, b) => a.city.localeCompare(b.city));
}

/** Folded city names reachable from `origin` — the event-city filter set. */
export function destinationCities(origin: string): Set<string> {
  return new Set(destinationsFrom(origin).map((d) => foldCity(d.city)));
}