// Shared per-day candidate aggregation: several providers (ebilet segments, kupbilecik
// API rows) emit the SAME event-day-venue as several candidates — one per time slot or
// product. The app wants ONE post per event-day-venue carrying showtimes[] — never
// duplicate posts for the same event on the same day at the same venue.
import { SeedCandidate, ShowtimeBooking } from './types';
import { diacriticFold } from './match';
import { toWarsawIso } from './dates';

function hhmmOf(ms: number): string {
  return toWarsawIso(ms).slice(11, 16);
}

/** Merge candidates of the same event-day-venue (normalized title + venue + city).
 *  The earliest-start member stays canonical (its externalId/link/media); times are
 *  the sorted union, price the cheapest known, is_sold_out true only when every member
 *  is sold out. Per-showtime booking identities (cinema kinds AND the generic 'link'
 *  kind used by ebilet/kupbilecik) are UNIONED by time — each showtime keeps its own
 *  page/booking, so selecting a time in the app opens that time's link. */
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
    const bookings = new Map<string, ShowtimeBooking>();
    let price: number | null = null;
    for (const m of arr) {
      const list = m.times && m.times.length > 0 ? m.times : [hhmmOf(m.startMs)];
      for (const t of list) times.add(t);
      for (const b of m.showtimeBooking || []) {
        if (!bookings.has(b.time)) bookings.set(b.time, b);
        times.add(b.time);
      }
      if (typeof m.price === 'number' && (price === null || m.price < price)) price = m.price;
    }
    winner.times = [...times].sort();
    winner.showtimeBooking = [...bookings.values()].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    if (winner.showtimeBooking.length === 0) winner.showtimeBooking = undefined;
    winner.price = price;
    winner.isSoldOut = arr.every((m) => m.isSoldOut);
    out.push(winner);
  }
  return out;
}
