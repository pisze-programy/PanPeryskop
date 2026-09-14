export interface Cinema {
  id: string;
  name: string;
  city: string;
  enabled: boolean;
  urlCitySlug?: string;
  urlCinemaSlug?: string;
  lat?: number;
  lng?: number;
}
