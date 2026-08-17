import { SeedCandidate, ProviderId } from './types';
import { toWarsawIso } from './dates';

function normVenue(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
// Normalized title tokens (len>=3, no diacritics) for fuzzy title matching.
function titleTokens(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}
// Fraction of title tokens of `a` that appear in `b` (both directions).
function titleOverlap(a: string, b: string): number {
  const A = titleTokens(a), B = titleTokens(b);
  if (!A.length || !B.length) return 0;
  const hits = A.filter((w) => B.includes(w)).length;
  return Math.max(hits / A.length, hits / B.length);
}

// Canonical-link preference: when several sources carry the same event (same hour
// + venue), the one with the LOWEST rank wins — its link/geo becomes canonical.
// Lower is better. Unknown sources rank last.
const SOURCE_PRIORITY: Record<ProviderId, number> = {
  // Cinema sources are primary (true) for showtimes — a film×cinema row they provide
  // wins over any aggregated copy. Among the aggregators: going > kupbilecik > dzisapp > eventylive.
  [ProviderId.MULTIKINO]: 0,
  [ProviderId.GOING]: 1,
  [ProviderId.KUPBILECIK]: 2,
  [ProviderId.DZISAPP]: 3,
  [ProviderId.EVENTYLIVE]: 4,
};
const sourceRank = (s: ProviderId): number => SOURCE_PRIORITY[s] ?? 99;

// Return whichever candidate is canonical for the two (same-key) candidates.
function preferCanonical(a: SeedCandidate, b: SeedCandidate): SeedCandidate {
  return sourceRank(a.source) <= sourceRank(b.source) ? a : b;
}

export function dedupe(events: SeedCandidate[]): SeedCandidate[] {
  const seen = new Map<string, SeedCandidate>();
  const out: SeedCandidate[] = [];
  for (const e of events) {
    const key = `${Math.floor(e.startMs / 3600000)}|${normVenue(e.venue)}`;
    const prev = seen.get(key);
    if (prev) {
      // Same hour + venue but a clearly different event (e.g. two distinct films
      // in the same cinema). Keep both by disambiguating the key with the title.
      if (titleOverlap(prev.title, e.title) < 0.5) {
        const tkey = `${key}|${titleTokens(e.title).sort().join(' ')}`;
        const tprev = seen.get(tkey);
        if (tprev) {
          const tw = preferCanonical(tprev, e);
          if (tw !== tprev) {
            const i = out.indexOf(tprev);
            out[i] = tw;
            seen.set(tkey, tw);
          }
          continue;
        }
        seen.set(tkey, e);
        out.push(e);
        continue;
      }
      const winner = preferCanonical(prev, e);
      if (winner !== prev) {
        const i = out.indexOf(prev);
        out[i] = winner;
        seen.set(key, winner);
      }
      continue;
    }
    seen.set(key, e);
    out.push(e);
  }

  // Pass 2: all-day events (startMs at city midnight, e.g. eventylive which has no
  // time) duplicate timed events from other sources by title+venue. Keep all-day
  // events only when they are NOT covered by a timed event of the same venue with
  // overlapping title.
  const isAllDay = (e: SeedCandidate) => {
    const hm = toWarsawIso(e.startMs).slice(11, 16);
    return hm === '00:00';
  };
  const timed = out.filter((e) => !isAllDay(e));
  const allDay = out.filter((e) => isAllDay(e));
  const covers = (e: SeedCandidate) => timed.some((t) => {
    if (t.venue && e.venue && normVenue(t.venue) !== normVenue(e.venue)) return false;
    return titleOverlap(t.title, e.title) >= 0.6;
  });
  const result = [...timed];
  const allDayAdded = new Set<string>();
  for (const e of allDay) {
    if (covers(e)) continue;
    const key = `${normVenue(e.venue)}|${titleTokens(e.title).sort().join(' ')}`;
    if (allDayAdded.has(key)) continue;
    allDayAdded.add(key);
    result.push(e);
  }
  return result;
}

export function buildDescription(c: SeedCandidate): string {
  const hm = toWarsawIso(c.startMs).slice(11, 16); // HH:MM
  const cityNorm = (c.city || '').trim().toLowerCase();
  const street = (c.address || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => !/^\d{2}-\d{3}$/.test(s))
    .filter((s) => s.toLowerCase() !== cityNorm)
    .join(', ');
  const loc = [c.venue, street].filter(Boolean).join(', ');
  return `${c.title}: ${hm}, ${loc}`.slice(0, 130);
}
