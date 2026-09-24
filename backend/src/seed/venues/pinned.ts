import { venueKey } from './venueStore';

export interface PinnedVenue {
  match: string[];
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string | null;
}

/** Venues with a fixed, human-verified position. A provider that lists the venue
 *  without coordinates (ebilet/eventim) must land on this point, never on a
 *  geocoder guess. `match` holds the raw spellings providers use. */
export const PINNED_VENUES: PinnedVenue[] = [
  {
    id: 'miedzynarodowetargipoznanskiemtp',
    match: [
      'MTP, HALA NR 1 Poznań',
      'MTP HALA NR 1 Poznań',
      'MTP - PAWILON 5',
      'MTP Pawilon 5',
      'Międzynarodowe Targi Poznańskie',
      'Międzynarodowe Targi Poznańskie (MTP)',
      'MTP Poznań',
      'Targi Poznańskie',
    ],
    name: 'Międzynarodowe Targi Poznańskie (MTP)',
    lat: 52.40268998001128,
    lng: 16.909210992543912,
    city: 'Poznań',
  },
];

const byKey = new Map<string, PinnedVenue>();
for (const v of PINNED_VENUES) {
  for (const m of v.match) byKey.set(venueKey(m), v);
}

/** The pinned venue for a raw venue name and city, or null. An exact spelling
 *  always matches. The loose rule needs the city so it never captures a venue in
 *  another city. */
export function pinnedVenue(name: string, city?: string | null): PinnedVenue | null {
  const exact = byKey.get(venueKey(name));
  if (exact) return exact;
  const cityOk = city === undefined || city === null || city === '' || venueKey(city).includes('poznan');
  if (!cityOk) return null;
  const k = venueKey(name);
  if (k.includes('targipoznanskie')) return PINNED_VENUES[0];
  return null;
}
