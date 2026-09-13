import { GeoStore } from '../seed/core/geo';
import { todayWarsaw, addDaysWarsaw } from '../seed/core/dates';
import { TravelManifest, TravelEvent } from './store';
import { TravelRunType, TRAVEL_BACKFILL_DAYS, TRAVEL_REPLENISH_DAYS } from './constants';

/** A travel data source (ESPN soccer, worldsmarathons runs, …). One `fetchDay`
 *  call returns that day's events already mapped to `TravelEvent`. */
export interface TravelSource {
  id: string;
  fetchDay(day: string, opts: { store?: GeoStore }): Promise<TravelEvent[]>;
}

export interface TravelRunOptions {
  runType: TravelRunType;
  store?: GeoStore;
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
  const refresh = runType === 'replenish' ? TRAVEL_REPLENISH_DAYS - 1 : TRAVEL_BACKFILL_DAYS - 1;
  const out: string[] = [];
  for (let i = 0; i <= refresh; i++) out.push(addDaysWarsaw(today, i));
  if (runType === 'replenish' && coveredDays) {
    for (let i = TRAVEL_REPLENISH_DAYS; i < TRAVEL_BACKFILL_DAYS; i++) {
      const day = addDaysWarsaw(today, i);
      if (!coveredDays.has(day)) out.push(day);
    }
  }
  return out;
}

/** Fetch a source's travel window day-by-day, skipping already-covered days.
 *  Returns a manifest ready for POST /admin/travel/ingest. */
export async function runTravelProvider(source: TravelSource, opts: TravelRunOptions): Promise<TravelManifest> {
  const { runType, store, coveredDays } = opts;
  const days = travelDays(runType, coveredDays);
  const events: TravelEvent[] = [];
  const seen = new Set<string>();
  for (const day of days) {
    if (coveredDays?.has(day)) continue;
    for (const e of await source.fetchDay(day, { store })) {
      if (seen.has(e.externalId)) continue;
      seen.add(e.externalId);
      events.push(e);
    }
  }
  return { provider: source.id, runType, days, events };
}