const base = 'https://www.helios.pl';
const api = 'https://api.helios.pl/api/v1';

export const helios = {
  base,
  api,
  screenings: (cinemaId: number) => `${api}/cinemas/${cinemaId}/screenings`,
  film: (
    cinema: { urlCitySlug?: string; urlCinemaSlug?: string },
    filmSlug: string,
    filmId: number
  ) => `${base}/${cinema.urlCitySlug}/${cinema.urlCinemaSlug}/filmy/${filmSlug}-${filmId}`,
  timeoutMs: 20_000,
} as const;
