import { seed } from '../seed';

const tenant = '10103';
const base = `https://www.cinema-city.pl/pl/data-api-service/v1/quickbook/${tenant}`;
const site = 'https://www.cinema-city.pl/';

export const cinemacity = {
  tenant,
  base,
  site,
  filmEvents: (cinemaId: string, day: string) => `${base}/film-events/in-cinema/${cinemaId}/at-date/${day}`,
  filmUrl: (filmId: string) => `${site}filmy/${filmId}`,
  timeoutMs: seed.fetchTimeoutMs,
} as const;
