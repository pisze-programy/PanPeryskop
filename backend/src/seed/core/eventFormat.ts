// Event formatting/serialization helpers — the seed's shared "HH:MM" + description
// vocabulary. Deliberately LIGHT (imports only ./dates + ./types): it is used by the
// VPS bundle (256 MB Frog box) and must not pull in dedupe/match/registry graphs.
import { SeedCandidate } from './types';
import { toWarsawIso } from './dates';

// The seed description format — "Tytuł: HH:MM, Lokalizacja". Single source for BOTH
// the formatter (buildDescription) and every parser (admin UI, blacklist, VPS
// postToCandidate, liveness fallback).
//
// A title may ITSELF contain ": " ("Koncert przy świecach – La Notte Italiana:
// włoska noc przy świecach: 18:00, …"), so the separator is located from the END:
// the LAST ": " that is followed by "HH:MM, ". A lazy first-match would swallow
// the title's own colons into the time field.
const EVENT_DESCRIPTION_RE = /^([\s\S]+):\s*(\d{2}:\d{2}),\s*([\s\S]*)$/;

/** The LAST ": HH:MM, " in the string — the separator the formatter wrote. */
function separatorIndex(desc: string): number {
  const re = /:\s*\d{2}:\d{2},\s/g;
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc)) !== null) last = m.index;
  return last;
}

/** Build the description for a candidate: "Tytuł: HH:MM, Lokalizacja". Location
 *  is the place name + city (no street address). */
export function buildDescription(c: SeedCandidate): string {
  const hm = toWarsawIso(c.startMs).slice(11, 16); // HH:MM
  const venue = (c.venue || '').trim();
  const city = (c.city || '').trim();
  const loc = venue && city && !venue.toLowerCase().includes(city.toLowerCase())
    ? `${venue}, ${city}`
    : (venue || city);
  return `${c.title}: ${hm}, ${loc}`.slice(0, 130);
}

/** Split a seed description into { title, time, loc } — null when it is not in the
 *  "Tytuł: HH:MM, Lokalizacja" format. */
export function parseEventDescription(desc: string | undefined | null): { title: string; time: string | null; loc: string } | null {
  const s = desc || '';
  const m = EVENT_DESCRIPTION_RE.exec(s);
  if (!m) return null;
  // When the title carries its own ": HH:MM, " the regex above may split at the
  // first one — re-split at the last real separator so the title stays whole.
  const i = separatorIndex(s);
  if (i > 0) {
    const tail = s.slice(i + 1).match(/^\s*(\d{2}:\d{2}),\s*([\s\S]*)$/);
    if (tail) return { title: s.slice(0, i).trim(), time: tail[1], loc: tail[2].trim() };
  }
  return { title: (m[1] || '').trim(), time: m[2] || null, loc: (m[3] || '').trim() };
}

export function hhmm(ms: number | null | undefined): string | null {
  if (ms == null || Number.isNaN(ms)) return null;
  return toWarsawIso(ms).slice(11, 16);
}

// Structured showtimes for the post: the candidate's full list when present,
// otherwise a single entry from startMs. Array form (used by the VPS staged entry).
export function showtimesArray(c: SeedCandidate): string[] | null {
  if (c.times && c.times.length > 0) return c.times;
  const hm = hhmm(c.startMs);
  return hm ? [hm] : null;
}

// JSON form (used by the queue/manual ingest paths). Thin wrapper — same rule.
export function showtimesJson(c: SeedCandidate): string | null {
  const arr = showtimesArray(c);
  return arr ? JSON.stringify(arr) : null;
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

// Provider extras as a JSON string, or null when the candidate carries none.
export function metaJson(c: SeedCandidate): string | null {
  if (c.meta === undefined || c.meta === '') return null;
  return c.meta;
}