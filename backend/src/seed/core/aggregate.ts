// Shared per-day candidate aggregation: several providers (ebilet segments, kupbilecik
// API rows) emit the SAME event-day-venue as several candidates — one per time slot or
// product. The app wants ONE post per event-day-venue carrying showtimes[] — never
// duplicate posts for the same event on the same day at the same venue.
import { SeedCandidate } from './types';
import { diacriticFold } from './match';
import { toWarsawIso } from './dates';

function hhmmOf(ms: number): string {
  return toWarsawIso(ms).slice(11, 16);
}

/** Merge candidates of the same event-day-venue (normalized title + venue + city).
 *  The earliest-start member stays canonical (its externalId/link/media); times are
 *  the sorted union, price the cheapest known, is_sold_out true only when every member
 *  is sold out. */
export function aggregateDayCandidates(cands: SeedCandidate[]): SeedCandidate[] {
  if (cands.length < 2) return cands;
  const groups = new Map<string, SeedCandidate[]>();
  for (const c of cands) {
    const key = `${diacriticFold(c.title)}\u0000${diacriticFold(c.venue)}\u0000${diacriticFold(c.city)}`;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }
  const out: SeedCandidate[] = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) { out.push(arr[0]); continue; }
    arr.sort((a, b) => a.startMs - b.startMs);
    const winner = arr[0];
    const times = new Set<string>();
    let price: number | null = null;
    for (const m of arr) {
      const list = m.times && m.times.length > 0 ? m.times : [hhmmOf(m.startMs)];
      for (const t of list) times.add(t);
      if (typeof m.price === 'number' && (price === null || m.price < price)) price = m.price;
    }
    winner.times = [...times].sort();
    winner.price = price;
    winner.isSoldOut = arr.every((m) => m.isSoldOut);
    out.push(winner);
  }
  return out;
}
