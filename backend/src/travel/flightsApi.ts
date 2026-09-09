// Flight availability — MOCK until the live airline APIs are integrated.
//
// Real integrations are documented in _internal/flights-apis.md (Ryanair v4
// availability needs client-version 3.213.0 + auth cookies; Wizzair timetable
// needs the Akamai KPSDK challenge). The mock returns deterministic prices
// seeded by (origin|dest|eventDay) so the iOS flight grid renders real-shaped
// data now and swaps to live when the proxies land.
import { addDaysWarsaw } from '../seed/core/dates';

export interface FlightCell {
  date: string;          // YYYY-MM-DD
  hour: string | null;   // HH:MM or null when no fare that day
  price: number | null;  // null = no fare that day
}

export interface FlightWindow {
  outbound: FlightCell[];
  returning: FlightCell[];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Mock price/ranges — named so the mock logic is readable, not magic.
const NO_FARE_MASK = 3;            // (r & 3) === 0 → no fare that day
const BASE_PRICE_MIN = 20;
const BASE_PRICE_RANGE = 180;
const PRICE_SPIKE_RANGE = 25;
const HOUR_START = 8;
const HOUR_RANGE = 11;
const OUTBOUND_WINDOW: [number, number] = [-3, -1];
const RETURN_WINDOW: [number, number] = [1, 3];
const FALLBACK_PRICE_MIN = 50;
const FALLBACK_PRICE_RANGE = 60;

function seededPrice(seed: number, dayOffset: number): number | null {
  // ~1 in 4 days have no fare — mirrors real sparse schedules.
  const r = (seed + dayOffset * 2654435761) >>> 0;
  if ((r & NO_FARE_MASK) === 0) return null;
  const base = BASE_PRICE_MIN + (r % BASE_PRICE_RANGE);
  const spike = (r >>> 8) % PRICE_SPIKE_RANGE;
  return Math.round((base + spike) * 100) / 100;
}

function mockHour(seed: number, dayOffset: number): string {
  const hour = HOUR_START + ((seed + dayOffset) % HOUR_RANGE);
  const minute = ((seed >>> 4) + dayOffset) % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dayCells(origin: string, dest: string, eventDay: string, range: [number, number]): FlightCell[] {
  const seed = hash(`${origin}|${dest}|${eventDay}`);
  const cells: FlightCell[] = [];
  for (let d = range[0]; d <= range[1]; d++) {
    const price = seededPrice(seed, d);
    cells.push({
      date: addDaysWarsaw(eventDay, d),
      hour: price === null ? null : mockHour(seed, d),
      price,
    });
  }
  // Guarantee at least one bookable day per direction (event-day adjacent is
  // cheapest) — otherwise the grid is all "brak" and no pair can be chosen.
  if (cells.every((c) => c.price === null)) {
    const last = cells[cells.length - 1];
    last.price = FALLBACK_PRICE_MIN + (seed % FALLBACK_PRICE_RANGE);
    last.hour = mockHour(seed, range[1]);
  }
  return cells;
}

/** Mock window: outbound = eventDay-3..eventDay-1, return = eventDay+1..eventDay+3. */
export function mockFlightWindow(origin: string, dest: string, eventDay: string): FlightWindow {
  return {
    outbound: dayCells(origin, dest, eventDay, OUTBOUND_WINDOW),
    returning: dayCells(origin, dest, eventDay, RETURN_WINDOW),
  };
}

export async function fetchRyanairWindow(origin: string, dest: string, eventDay: string): Promise<FlightWindow> {
  return mockFlightWindow(origin, dest, eventDay);
}

export async function fetchWizzairWindow(origin: string, dest: string, eventDay: string): Promise<FlightWindow> {
  return mockFlightWindow(origin, dest, eventDay);
}