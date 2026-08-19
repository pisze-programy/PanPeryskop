// Shared dedupe matching primitives. Extracted so core/dedupe and the separate
// pre/post filters (core/filters) use the exact same normalization and similarity.
// Normalization is Cyrillic-safe (PL/UA titles never collapse) and folds Latin
// diacritics ("André" == "Andre").
import { ProviderId } from './types';

const TOKEN_RE = /[a-z0-9\u0430-\u044f\u0456\u0454\u0491]+/g;

export function diacriticFold(s: string): string {
  return (s || '')
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('ł', 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Stop words + venue/city noise that never distinguish events.
const STOP = new Set([
  'w', 'i', 'na', 'z', 'do', 'o', 'a', 'the', 'and', 'or', 'vs',
  '2026', '2025', '2024', 'poznan', 'warszawa', 'poland', 'polska',
  'bilety', 'bilet', 'jest', 'tak', 'nie', 'sala', 'hala', 'pozn', 'kino', 'nad',
  'seans', 'seansy', 'premiera', 'dnia', 'czesc',
]);
// Version/format noise: PL vs UA dubbing, 2D/3D etc. of the SAME film.
const NOISE = new Set([
  'ukrainski', 'ukrainska', 'ukrainskie', 'ukrainskiej', 'ukrainian',
  'dubbing', 'napisy', 'lektor', 'oryginalny', 'oryginalna', 'oryginalnej',
  '2d', '3d', '4d', 'imax', 'xd', 'dts', 'vr', 'ukr',
  'wersji', 'wersja', 'wersje', 'rozszerzone', 'rozszerzona', 'rozszerzonej',
]);

/** Title tokens (length>=3, no stop/noise, venue-name tokens subtracted). */
export function titleTokens(title: string, venue?: string): Set<string> {
  const words = diacriticFold(title).match(TOKEN_RE) ?? [];
  const sub = venue ? new Set(diacriticFold(venue).match(TOKEN_RE) ?? []) : new Set<string>();
  const out = new Set<string>();
  for (const w of words) {
    if (w.length >= 3 && !STOP.has(w) && !NOISE.has(w) && !sub.has(w)) out.add(w);
  }
  return out;
}

/** Folded, token-joined normalization for similarity ("Teatr Capitol, ul. X"). */
export function flatNorm(s: string): string {
  return (diacriticFold(s).match(TOKEN_RE) ?? []).join(' ');
}

/** LCS-based sequence ratio in [0,1] — mirrors difflib.SequenceMatcher.ratio(). */
export function seqRatio(a: string, b: string): number {
  const A = flatNorm(a), B = flatNorm(b);
  if (A.length === 0 && B.length === 0) return 1;
  if (A.length === 0 || B.length === 0) return 0;
  const n = A.length, m = B.length;
  const dp = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    let prevDiag = 0;
    for (let j = 1; j <= m; j++) {
      const save = dp[j];
      dp[j] = A[i - 1] === B[j - 1] ? prevDiag + 1 : Math.max(dp[j], dp[j - 1]);
      prevDiag = save;
    }
  }
  return (2 * dp[m]) / (n + m);
}

// TBA / ambiguous venue markers — geo is the only usable signal for these.
const TBA_MARKERS = [
  'rozne lokalizacje', 'roznych lokalizacji', 'tba', 'tbd', 'miejsce',
  'do ustalenia', 'wkrotce', 'zapowiedz', 'to be announced', '- 0',
];
export function isTba(venue: string): boolean {
  const v = diacriticFold(venue);
  if (!v.trim()) return true;
  return TBA_MARKERS.some((m) => v.includes(m));
}

export function distKm(la: number, lo: number, lb: number, lo2: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lb - la);
  const dLng = rad(lo2 - lo);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(la)) * Math.cos(rad(lb)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface GeoVenue {
  venue: string;
  lat: number | null;
  lng: number | null;
}

// Venue must MATCH for a dedupe (ratio>=0.8). When one side has no venue/TBA,
// geo (<1.5km) is used instead — geo is confirmatory, never minusowy.
export function venuesMatch(a: GeoVenue, b: GeoVenue): boolean {
  const va = flatNorm(a.venue).trim(), vb = flatNorm(b.venue).trim();
  const aTba = isTba(a.venue), bTba = isTba(b.venue);
  if (!aTba && !bTba && va && vb) return seqRatio(va, vb) >= 0.8;
  if ((aTba || bTba || !va || !vb) && typeof a.lat === 'number' && typeof b.lat === 'number') {
    return distKm(a.lat, a.lng ?? 0, b.lat, b.lng ?? 0) < 1.5;
  }
  return false;
}

/** Venue closeness for the rescue filter (venue strings only). */
export function venuesClose(a: string, b: string): boolean {
  const va = flatNorm(a).trim(), vb = flatNorm(b).trim();
  return !!(va && vb) && seqRatio(va, vb) >= 0.8;
}

export function linkKey(url: string): string | null {
  if (!url) return null;
  const u = (url || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '')
    .split('?')[0].split('#')[0].replace(/\/+$/, '');
  return u || null;
}

// Cinema providers put the film slug in the URL; PL/UA versions share it
// (e.g. odyseja vs odyseja-ukrainian-dubbing) — a language-independent film key.
const CINEMA_SOURCES = new Set<ProviderId>([ProviderId.MULTIKINO, ProviderId.HELIOS, ProviderId.CINEMACITY]);
const SLUG_SUFFIXES = [
  '-ukrainian-dubbing', '-ukrainska-wersja', '-wersja-ukrainska', '-ukrainska',
  '-ukrainian', '-dubbing', '-napisy', '-lektor', '-3d', '-2d', '-imax',
  '-wersja-rozszerzona', '-rozszerzona', '-ukrainskiej-wersji',
];
export function filmSlug(url: string, source: ProviderId): string | null {
  if (!url || !CINEMA_SOURCES.has(source)) return null;
  const path = (url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] || '').replace(/\/+$/, '');
  const segs = path.split('/').filter(Boolean);
  const i = segs.indexOf('filmy');
  if (i < 0) return null;
  const slug = source === ProviderId.CINEMACITY ? (segs[i + 1] ?? '') : (segs[segs.length - 1] ?? '');
  if (!slug) return null;
  let s = diacriticFold(slug);
  for (const suf of SLUG_SUFFIXES) {
    if (s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  return s || null;
}

// Ukrainian-version detection (for canonical preference: keep the Polish post).
const CYR = /[\u0410-\u042f\u0430-\u044f\u0406\u0456\u0404\u0454\u0490\u0491\u0407\u0457]/;
const UKR_MARKERS = ['ukrainski', 'ukrainska', 'ukrainian', 'ukr'];
export function isUkrainian(title: string): boolean {
  if (CYR.test(title || '')) return true;
  const f = diacriticFold(title);
  return UKR_MARKERS.some((m) => f.includes(m));
}

/** Token containment: the shorter token set is ~covered by the longer.
 *  Cross-source duplicates may differ in wording (>=0.8); SAME-source pairs only
 *  merge when the token sets are identical (>=1.0) — "Muzyka filmowa: Koncert
 *  przy świecach w plenerze" vs "Bridgerton: Koncert przy świecach w plenerze"
 *  share 4/5 = 0.8 but are two real concerts at the same venue. */
export function containment(a: Set<string>, b: Set<string>, min = 0.8): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared >= 1 && shared / Math.min(a.size, b.size) >= min;
}
