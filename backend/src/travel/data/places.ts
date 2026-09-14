import type { PlaceKind } from '../../config/travel';

export const KINDS: Record<PlaceKind, { names: string[]; min: number; max: number; currency: string }> = {
  hotel: {
    names: ['Hotel Centrum', 'Apartamenty Rynek', 'Hotel Airport', 'Pensjonat Stary Port',
      'Boutique Suites', 'Hostel City', 'Hotel Marina', 'Resort Panorama', 'City Lodge',
      'Grand Hotel', 'Hotel Park', 'Hotel Katedra'],
    min: 180, max: 900, currency: 'PLN',
  },
  attraction: {
    names: ['City Walking Tour', 'Muzeum Narodowe', 'Rejs po porcie', 'Degustacja lokalna',
      'Karta miejska', 'Park rozrywki', 'Rejs statkiem', 'Wine Tasting', 'Segway Tour',
      'Historyczne centrum'],
    min: 25, max: 120, currency: 'PLN',
  },
  car: {
    names: ['Fiat 500', 'Toyota Corolla', 'VW Golf', 'Skoda Octavia', 'Renault Clio',
      'Ford Focus', 'Opel Corsa', 'Kia Ceed'],
    min: 90, max: 320, currency: 'PLN',
  },
  insurance: {
    names: ['Ubezpieczenie Podstawowe', 'Ubezpieczenie Sportowe', 'Ubezpieczenie Rodzinne',
      'Ubezpieczenie Premium', 'Assistance 24/7'],
    min: 30, max: 180, currency: 'PLN',
  },
};

export const STREETS = ['ul. Główna 12', 'Al. Portowa 4', 'ul. Kwiatowa 7', 'Rynek 1',
  'ul. Sportowa 9', 'ul. Kolejowa 22', 'Bulwar 15', 'ul. Targowa 3'];
