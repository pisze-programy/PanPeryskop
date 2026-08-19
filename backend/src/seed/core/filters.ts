// Separate pre/post dedupe filters — intentionally NOT part of dedupe().
//   dropCancelled   — pre-filter: an event whose title says "cancelled" is always
//                     removed (never becomes the canonical winner).
//   rescueRealShows — post-filter: re-keeps same-title+venue entries from trusted
//                     real sources (kupbilecik/going) whose hours are >= 2h apart —
//                     those are two separate shows (e.g. SKOLIM 17:00 + 20:00),
//                     not duplicates.
import { SeedCandidate, ProviderId } from './types';
import { toWarsawIso } from './dates';
import { diacriticFold, linkKey, containment, titleTokens, venuesClose } from './match';

const CANCELLED_MARKERS = ['cancelled', 'odwolany', 'odwolana', 'odwolane', 'anulowany', 'anulowana', 'anulowane'];

export function isCancelled(title: string): boolean {
  const t = diacriticFold(title);
  return CANCELLED_MARKERS.some((m) => t.includes(m));
}

export function dropCancelled(events: SeedCandidate[]): SeedCandidate[] {
  return events.filter((e) => !isCancelled(e.title));
}

// Only sources that list genuine, distinct shows can carry two entries of the
// same title+venue with a large hour gap and mean two real performances.
export const REAL_SOURCES = new Set<ProviderId>([ProviderId.KUPBILECIK, ProviderId.GOING]);
export const RESCUE_MIN_MS = 2 * 3_600_000;

const dayKey = (startMs: number): string => toWarsawIso(startMs).slice(0, 10);

export function rescueRealShows(input: SeedCandidate[], deduped: SeedCandidate[]): SeedCandidate[] {
  const kept = new Set(deduped);
  const rescued: SeedCandidate[] = [];
  for (const x of input) {
    if (kept.has(x)) continue;
    if (!REAL_SOURCES.has(x.source)) continue;
    for (const y of deduped) {
      if (!REAL_SOURCES.has(y.source)) continue;
      if (y === x) continue;
      if (x.source !== y.source) continue; // rescue only within ONE source — a
      // kupbilecik+going pair with different hours is a duplicate, not two shows
      // (two companies' forms are not trusted to be independently correct).
      if (dayKey(x.startMs) !== dayKey(y.startMs)) continue; // rescue stays within the same day
      if (Math.abs(x.startMs - y.startMs) < RESCUE_MIN_MS) continue;
      const lx = linkKey(x.link), ly = linkKey(y.link);
      if (lx && ly && lx === ly) continue; // same event page -> a real duplicate
      if (!venuesClose(x.venue, y.venue)) continue;
      if (!containment(titleTokens(x.title, x.venue), titleTokens(y.title, y.venue))) continue;
      rescued.push(x);
      break;
    }
  }
  return [...deduped, ...rescued];
}
