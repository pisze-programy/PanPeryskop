import { CONFIG } from '../config/index';
import qeeqAirports from './data/qeeq-airports.json';

interface QeeqAirport {
  landmark: number;
  city: number | null;
}

const airports = qeeqAirports as Record<string, QeeqAirport>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function partnerLink(target: string): string {
  const cfg = CONFIG.travel.carRental;
  const params = new URLSearchParams({
    campaign_id: cfg.campaignId,
    marker: cfg.marker,
    p: cfg.programId,
    trs: cfg.trs,
    u: target,
  });
  return `${cfg.tpBase}?${params}`;
}

function searchTarget(entry: QeeqAirport, from: string, to: string): string {
  const cfg = CONFIG.travel.carRental;
  const params = new URLSearchParams({
    pickup_landmark: String(entry.landmark),
    dropoff_landmark: String(entry.landmark),
    from_date_0: from,
    from_date_1: cfg.pickupTime,
    to_date_0: to,
    to_date_1: cfg.dropoffTime,
    lang: cfg.locale,
  });
  if (entry.city !== null) {
    params.set('pickup_city', String(entry.city));
    params.set('dropoff_city', String(entry.city));
  }
  return `${cfg.siteHost}${cfg.searchPath}?${params}`;
}

function landingTarget(entry: QeeqAirport): string {
  const cfg = CONFIG.travel.carRental;
  const params = new URLSearchParams({ airport: String(entry.landmark), lang: cfg.locale });
  return `${cfg.siteHost}${cfg.dealsPath}?${params}`;
}

export function carRentalUrl(iata: string, from?: string, to?: string): string {
  const cfg = CONFIG.travel.carRental;
  const entry = airports[iata.toUpperCase()];
  if (!entry) return partnerLink(cfg.siteHost);
  if (from && to && DAY.test(from) && DAY.test(to)) return partnerLink(searchTarget(entry, from, to));
  return partnerLink(landingTarget(entry));
}
