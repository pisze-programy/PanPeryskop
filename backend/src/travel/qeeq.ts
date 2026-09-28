import { CONFIG } from '../config/index';
import qeeqAirports from './data/qeeq-airports.json';
import qeeqPrices from './data/qeeq-prices.json';

interface QeeqAirport {
  landmark: number;
  city: number | null;
}

const airports = qeeqAirports as Record<string, QeeqAirport>;
const prices = qeeqPrices as Record<string, number>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function searchUrl(entry: QeeqAirport, from?: string, to?: string): string {
  const cfg = CONFIG.travel.carRental;
  const params = new URLSearchParams({ currency: cfg.currency });
  params.set('pickup_landmark', String(entry.landmark));
  params.set('dropoff_landmark', String(entry.landmark));
  if (entry.city !== null) {
    params.set('pickup_city', String(entry.city));
    params.set('dropoff_city', String(entry.city));
  }
  if (from && to && DAY.test(from) && DAY.test(to)) {
    params.set('from_date_0', from);
    params.set('from_date_1', cfg.pickupTime);
    params.set('to_date_0', to);
    params.set('to_date_1', cfg.dropoffTime);
  }
  return `${cfg.siteHost}${cfg.searchPath}?${params}`;
}

/** The banner price: the measured per-day rate for the airport, else the floor. */
export function carRentalPrice(iata: string): number {
  return prices[iata.toUpperCase()] ?? CONFIG.travel.carRental.defaultPrice;
}

export function carRentalUrl(iata: string, from?: string, to?: string): string {
  const cfg = CONFIG.travel.carRental;
  const entry = airports[iata.toUpperCase()];
  if (!entry) return `${cfg.siteHost}${cfg.searchPath}?${new URLSearchParams({ currency: cfg.currency })}`;
  return searchUrl(entry, from, to);
}
