import { GeoStore } from '../seed/core/geo';
import { todayWarsaw, addDaysWarsaw } from '../seed/core/dates';
import { fetchEspnDay, EspnFetchOptions } from './espn';
import { TravelManifest } from './store';
import { TravelRunType, TRAVEL_BACKFILL_DAYS } from './constants';

export interface TravelRunOptions {
  runType: TravelRunType;
  store?: GeoStore;
  fetchOptions?: EspnFetchOptions;
  /** Days already covered (e.g. from a checkpoint) — skipped to close gaps. */
  coveredDays?: Set<string>;
}

/**
 * Days to fetch. Backfill: today..today+89. Replenish: refresh today..today+6 PLUS
 * any still-uncovered days beyond the window (up to +89), so the rolling frontier
 * keeps advancing each week instead of the far days going stale.
 */
function travelDays(runType: TravelRunType, coveredDays?: Set<string>): string[] {
  const today = todayWarsaw();
  const refresh = runType === 'replenish' ? 6 : TRAVEL_BACKFILL_DAYS - 1;
  const out: string[] = [];
  for (let i = 0; i <= refresh; i++) out.push(addDaysWarsaw(today, i));
  if (runType === 'replenish' && coveredDays) {
    for (let i = 7; i < TRAVEL_BACKFILL_DAYS; i++) {
      const day = addDaysWarsaw(today, i);
      if (!coveredDays.has(day)) out.push(day);
    }
  }
  return out;
}

/** Fetch the travel window day-by-day (one ESPN request per day), skipping
 *  already-covered days. Returns a manifest ready for POST /admin/travel/ingest. */
export async function runTravelProvider(opts: TravelRunOptions): Promise<TravelManifest> {
  const { runType, store, fetchOptions, coveredDays } = opts;
  const days = travelDays(runType, coveredDays);
  const events: import('./store').TravelEvent[] = [];
  const seen = new Set<string>();
  for (const day of days) {
    if (coveredDays?.has(day)) continue;
    for (const e of await fetchEspnDay(day, { ...fetchOptions, store })) {
      if (seen.has(e.externalId)) continue;
      seen.add(e.externalId);
      events.push(e);
    }
  }
  return { provider: 'espn', runType, days, events };
}