// Geo propagation — the admin geo modal can apply the corrected coordinates to
// every other event at the SAME place. Matching is BY NAME + CITY, never by geo
// proximity: two different venues near the same point must never cross-propagate,
// and a generic name like "Katedra" in Kraków must never touch "Katedra" in
// Szczecin. Pure + testable (no DB here).
import { nearestCity } from './cities';
import { venueKey } from '../seed/venues/venueStore';

export interface PropagationPost {
  id: string;
  description: string;
  lat: number | null;
  lng: number | null;
}

/** "Tytuł: HH:MM, Lokalizacja" → first comma segment of Lokalizacja = venue. */
export function venueFromDescription(description: string): string {
  const m = /^.+?:\s*\d{2}:\d{2},\s*(.*)$/.exec(description || '');
  const loc = m ? m[1] : (description || '');
  return (loc.split(',')[0] || '').trim();
}

/**
 * Propagation targets for a geo edit. A post matches when:
 *   - it has usable coordinates, AND
 *   - its venue name equals the edited venue name 1:1 (venueKey, strict — case,
 *     whitespace and diacritics are folded, but prefix differences like
 *     "Galeria Rzeszów" vs "Rzeszów Galeria Rzeszów" are NOT equal), AND
 *   - its nearest city equals the edited point's nearest city.
 */
export function propagationTargets(
  posts: PropagationPost[],
  edit: { name: string; lat: number; lng: number },
): PropagationPost[] {
  const nameKey = venueKey(edit.name);
  const city = nearestCity(edit.lat, edit.lng);
  return posts.filter((p) => {
    if (p.lat == null || p.lng == null) return false;
    if (venueKey(venueFromDescription(p.description)) !== nameKey) return false;
    return nearestCity(p.lat, p.lng) === city;
  });
}
