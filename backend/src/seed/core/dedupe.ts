import { SeedCandidate, ProviderId } from './types';
import { toWarsawIso } from './dates';
import { priorityOf } from '../providers/registry';
import {
  titleTokens, linkKey, isUkrainian, venuesMatch, containment, isTba, isCinemaSource,
} from './match';

// Canonical-link preference: when several sources carry the same event, the one
// with the LOWEST rank wins — its link/geo becomes canonical. Lower is better.
// Rank lives in the provider registry (single source of truth).
const sourceRank = (s: ProviderId): number => priorityOf(s);

// Dedupe scope is the DAY (not the hour): "godzina może być różna" — providers
// list the same event at slightly different hours.
const dayKey = (startMs: number): string => toWarsawIso(startMs).slice(0, 10);

export function dedupe(events: SeedCandidate[]): SeedCandidate[] {
  // Cinema chains (multikino/cinemacity/helios) are NEVER deduped — show every
  // film the API returns (morning/evening showings, PL/UA, dubbing variants).
  // Their short venue names would also false-positive on the fuzzy venue ratio
  // and collapse distinct cinemas. Only non-cinema sources are deduped.
  const cinema: SeedCandidate[] = [];
  const rest: SeedCandidate[] = [];
  for (const e of events) (isCinemaSource(e.source) ? cinema : rest).push(e);

  const byDay = new Map<string, SeedCandidate[]>();
  for (const e of rest) {
    const k = dayKey(e.startMs);
    const arr = byDay.get(k);
    if (arr) arr.push(e);
    else byDay.set(k, [e]);
  }

  const out: SeedCandidate[] = [...cinema];
  for (const arr of byDay.values()) {
    const n = arr.length;
    const tokensOf = arr.map((e) => titleTokens(e.title, e.venue));

    const parent = arr.map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    // R1 — same event page (identical link) between non-cinema sources.
    const byLink = new Map<string, number[]>();
    arr.forEach((e, i) => {
      const k = linkKey(e.link);
      if (k) { const l = byLink.get(k) ?? []; l.push(i); byLink.set(k, l); }
    });
    for (const idx of byLink.values()) {
      for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
        const x = arr[idx[a]], y = arr[idx[b]];
        const bothKnown = !!x.venue.trim() && !!y.venue.trim() && !isTba(x.venue) && !isTba(y.venue);
        if (!bothKnown || venuesMatch(x, y)) union(idx[a], idx[b]);
      }
    }

    // R3 — title containment + venue match. Same-source pairs need IDENTICAL
    // tokens (1.0) — two real concerts of the "przy świecach" series share 0.8
    // and must stay separate.
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      if (find(a) === find(b)) continue;
      const minContainment = arr[a].source === arr[b].source ? 1.0 : 0.8;
      if (containment(tokensOf[a], tokensOf[b], minContainment) && venuesMatch(arr[a], arr[b])) union(a, b);
    }

    // Pick the canonical per group: lowest priority, then the non-UA version,
    // then the earliest start. Winner's hour = earliest in the group.
    const groups = new Map<number, number[]>();
    arr.forEach((_, i) => { const r = find(i); const l = groups.get(r) ?? []; l.push(i); groups.set(r, l); });
    for (const idx of groups.values()) {
      if (idx.length < 2) { out.push(arr[idx[0]]); continue; }
      const members = idx.map((i) => arr[i]).sort((x, y) =>
        sourceRank(x.source) - sourceRank(y.source) ||
        (isUkrainian(x.title) ? 1 : 0) - (isUkrainian(y.title) ? 1 : 0) ||
        x.startMs - y.startMs
      );
      const winner = members[0];
      winner.startMs = Math.min(...members.map((m) => m.startMs));
      out.push(winner);
    }
  }
  return out;
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

export function hhmm(ms: number | null | undefined): string | null {
  if (ms == null || Number.isNaN(ms)) return null;
  return toWarsawIso(ms).slice(11, 16);
}

// Structured showtimes for the post: the candidate's full list when present,
// otherwise a single entry from startMs. JSON array of "HH:MM" or null.
export function showtimesJson(c: SeedCandidate): string | null {
  if (c.times && c.times.length > 0) return JSON.stringify(c.times);
  const hm = hhmm(c.startMs);
  return hm ? JSON.stringify([hm]) : null;
}

// Per-showtime booking identity (cinema providers) — JSON array of
// {time, kind, params} or null when the candidate carries none.
export function showtimeBookingJson(c: SeedCandidate): string | null {
  if (c.showtimeBooking && c.showtimeBooking.length > 0) return JSON.stringify(c.showtimeBooking);
  return null;
}

// Canonical tags — JSON array of canonical tag ids or null when none.
export function tagsJson(c: SeedCandidate): string | null {
  if (c.tags && c.tags.length > 0) return JSON.stringify(c.tags);
  return null;
}
