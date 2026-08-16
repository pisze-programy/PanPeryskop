// Venue fuzzy matching between providers (e.g. eventylive venue → dzis.app geo).
// Strategy: normalized n-gram Dice similarity on the flattened name, requiring a
// shared significant token as a guard against false positives ("Kino Muza" should
// NOT match "Teatr Muzyczny" just because "muza" ⊂ "muzyczny").
export interface GeoPoint { lat: number; lng: number; }
export interface VenueEntry { name: string; geo: GeoPoint | null; }

function flat(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function tokens(s: string): string[] {
  return flat(s).match(/[a-z0-9]{3,}/g) || [];
}
function ngrams(s: string, n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= s.length - n; i++) out.add(s.slice(i, i + n));
  return out;
}
export function dice(a: string, b: string, n = 3): number {
  const A = ngrams(flat(a), n);
  const B = ngrams(flat(b), n);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

// Significant tokens are words with length>=5 that are NOT generic place words.
const STOP = new Set(['poznaniu', 'warszawie', 'wroclawiu', 'lodzi', 'krakowie', 'gdansku', 'szczecinie', 'katowicach', 'lublinie', 'bialymstoku', 'centrum', 'sala', 'sali', 'klub', 'teatr', 'kino', 'muzeum', 'scena', 'galeria']);
function significantTokens(s: string): string[] {
  return tokens(s).filter((w) => w.length >= 5 && !STOP.has(w));
}

export function venueSimilarity(a: string, b: string): number {
  const d = dice(a, b, 3);
  const shared = significantTokens(a).filter((w) => flat(b).includes(w)).length;
  const aSig = significantTokens(a).length;
  // Require at least one shared significant token when a has any.
  const guardOk = aSig === 0 || shared >= 1;
  return guardOk ? d : d * 0.3; // penalize strongly if no shared significant token
}

export const VENUE_MATCH_THRESHOLD = 0.55;

// Find best matching venue geo from a cache (dzis.app venues). Returns geo or null.
export function matchVenueGeo(name: string, cache: VenueEntry[]): GeoPoint | null {
  if (!name || cache.length === 0) return null;
  let best: VenueEntry | null = null;
  let bestScore = 0;
  for (const v of cache) {
    const s = venueSimilarity(name, v.name);
    if (s > bestScore) { bestScore = s; best = v; }
  }
  return best && bestScore >= VENUE_MATCH_THRESHOLD && best.geo ? best.geo : null;
}
