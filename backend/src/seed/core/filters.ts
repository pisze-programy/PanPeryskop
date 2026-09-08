import { SeedCandidate, ProviderId } from './types';
import { toWarsawIso } from './dates';
import { diacriticFold, linkKey, containment, titleTokens, venuesClose } from './match';

const CANCELLED_MARKERS = ['cancelled', 'odwolany', 'odwolana', 'odwolane', 'anulowany', 'anulowana', 'anulowane'];
const GLOBAL_BAN_PATTERNS = [
    'KONCERTY FORTEPIANOWE PRZY ŚWIECACH',
    'Koncert przy świecach',
    'KONCERT PRZY ŚWIECACH',
    'Koncert Chopinowski w Sali Koncertowej Fryderyk',
    'Plac Defilad Warszawa w pigułce (ebilet)',
    'Kolejkowo Warszawa *',
    'Koncert przy świecach – ¡Viva España! – hiszpańska noc przy świecach',
    'Koncert przy świecach – Tango przy świecach',
    'Koncert przy świecach – Bridgertonowie',
    'I like Queen - piano',
    'Chopin & Friends - koncerty fortepianowe',
    'Chopin & Friends Concert By Candle Glow',
    'Grand Piano Trio Chopin & Friends By Candle Glow',
    'Queen Classic Concert By Candle Glow',
    'Royal Chopin Hall - Queen Classic Candlelight',
    'GENESIS – The Creation Light Show',
    'Koncert Przy Świecach w Sali Koncertowej Fryderyk',
    'Nastrojowy wieczór z muzyką Chopina',
];
const TOKEN_RE = /[a-z0-9]+/g;

export function isBannedGlobal(title: string): boolean {
  const set = new Set(diacriticFold(title).match(TOKEN_RE) ?? []);
  if (set.size === 0) return false;

  for (const pattern of GLOBAL_BAN_PATTERNS) {
    const tokens = diacriticFold(pattern).match(TOKEN_RE) ?? [];
    if (tokens.length > 0 && tokens.every((w) => set.has(w))) return true;
  }
  return false;
}

export function isCancelled(title: string): boolean {
    const t = diacriticFold(title);
    return CANCELLED_MARKERS.some((m) => t.includes(m));
}

export function dropCancelled(events: SeedCandidate[]): SeedCandidate[] {
  return events.filter((e) => !isCancelled(e.title));
}

export function dropBanned(events: SeedCandidate[]): SeedCandidate[] {
  return events.filter((e) => !isBannedGlobal(e.title));
}

export function dropBlocked(events: SeedCandidate[]): SeedCandidate[] {
  return dropBanned(dropCancelled(events));
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
