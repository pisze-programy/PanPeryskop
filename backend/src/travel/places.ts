import type { PlaceKind } from '../config/index';

export type { PlaceKind };

export interface TravelPlace {
  id: string;
  kind: PlaceKind;
  name: string;
  image: string;
  price: number;
  currency: string;
  link: string;
  rating?: number;
  reviews?: number;
  source?: string;
  durationMinutes?: number;
  badges?: string[];
}

export function isPlaceKind(raw: string): raw is PlaceKind {
  return raw === 'attraction';
}
