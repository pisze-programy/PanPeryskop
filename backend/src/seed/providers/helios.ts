// helios.pl provider — 'fetch' transport. Public REST API (api.helios.pl/api/v1):
// one call per cinema returns the full repertoire (~25 days) with embedded movie
// and event metadata, so no HTML/SSR parsing is needed. Geo + venue come from the
// static HELIOS_CINEMAS catalog (constants.ts), captured once from /api/v1/cinemas
// with citySlugs verified against the site's home-page scope URLs.
//
// Granularity: ONE candidate per film×cinema×day (startMs = earliest showtime).
// Queue scope = cinema (numeric id); each scope is one API call.
import { SeedProvider, SeedContext, SeedCandidate, ProviderId, ShowtimeBooking } from '../core/types';
import { getBytes } from './http';
import { warsawMidnightMs } from '../core/dates';
import { HELIOS_CINEMAS, HELIOS_FILM, HELIOS_SCREENINGS, HELIOS_TIMEOUT_MS, heliosScopes } from '../core/constants';

function cinemaById(id: number) {
  return HELIOS_CINEMAS.find((c) => c.id === id);
}

// The screenings response wraps everything under data: data.screenings[day][m<id>|e<id>]
// holds the showtimes; data.movies/data.events map each key to its metadata.
interface HeliosMovie {
  id?: number;
  sourceId?: string;
  title?: string;
  name?: string;
  slug?: string;
  posterPhoto?: { url?: string };
}
interface HeliosScreening {
  timeFrom?: string;
  sourceId?: string;
  cinemaSourceId?: string;
  screeningMovies?: { movie?: HeliosMovie }[];
}
interface HeliosDayEntry { screenings: HeliosScreening[] }
interface HeliosPayload {
  movies?: Record<string, any>;
  events?: Record<string, any>;
  screenings?: Record<string, Record<string, HeliosDayEntry>>;
}

// The authoritative film identity for a screening entry. Events (e*) reuse their
// events-map metadata across different films over time, so the embedded
// screeningMovies[].movie is preferred; regular films (m*) live in data.movies.
function filmFor(key: string, entries: HeliosDayEntry, payload: HeliosPayload): HeliosMovie | null {
  for (const s of entries.screenings) {
    const mv = s.screeningMovies?.[0]?.movie;
    if (mv && mv.id != null && mv.slug) return mv;
  }
  const meta = key.startsWith('m') ? payload.movies?.[key] : payload.events?.[key];
  return meta || null;
}

function startMsFor(day: string, entries: HeliosDayEntry): number | null {
  const dayStart = warsawMidnightMs(day);
  let best: number | null = null;
  for (const s of entries.screenings) {
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/.exec(s.timeFrom || '');
    if (!m) continue;
    const ms = dayStart + (parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) * 60_000;
    if (best === null || ms < best) best = ms;
  }
  return best;
}

// One cinema's full repertoire → candidates for the target day.
export function parseHeliosPayload(payload: HeliosPayload, cinemaId: number, day: string): SeedCandidate[] {
  const cinema = cinemaById(cinemaId);
  if (!cinema) throw new Error(`helios: unknown cinema ${cinemaId}`);
  const dayMap = payload?.screenings?.[day];
  if (!dayMap) return [];
  const out: SeedCandidate[] = [];
  for (const key of Object.keys(dayMap)) {
    const entries = dayMap[key];
    const startMs = startMsFor(day, entries);
    if (startMs === null) continue;
    const times = entries.screenings
      .map((s) => { const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/.exec(s.timeFrom || ''); return m ? `${m[2]}:${m[3]}` : null; })
      .filter((x): x is string => x !== null)
      .sort();
    const movie = filmFor(key, entries, payload);
    if (!movie) continue;
    const title = movie.title || movie.name;
    const slug = movie.slug || '';
    const poster = movie.posterPhoto?.url || '';
    const filmIdNum = movie.id;
    if (!title || !poster || filmIdNum == null) continue;
    const filmId = slug ? `${slug}-${filmIdNum}` : String(filmIdNum);
    const showtimeBooking: ShowtimeBooking[] = [];
    for (const s of entries.screenings) {
      const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/.exec(s.timeFrom || '');
      if (!m) continue;
      if (!s.sourceId || !s.cinemaSourceId || !movie.sourceId) continue;
      showtimeBooking.push({
        time: `${m[2]}:${m[3]}`,
        kind: 'helios',
        params: {
          screen: s.sourceId,
          cinema: s.cinemaSourceId,
          itemId: movie.sourceId,
          itemSourceId: String(filmIdNum),
        },
      });
    }
    out.push({
      source: ProviderId.HELIOS,
      externalId: `helios-${cinema.citySlug}-${cinema.slug}-${filmId}-${day}`,
      title,
      startMs,
      times,
      showtimeBooking,
      tags: ['filmy'],
      lat: cinema.lat, lng: cinema.lng,
      city: cinema.city,
      venue: cinema.name,
      address: cinema.address,
      link: HELIOS_FILM(cinema, slug, filmIdNum),
      mediaUrl: poster,
      thumbUrl: null,
    });
  }
  return out;
}

// Fetch one cinema (queue scope = numeric cinema id).
export async function fetchHeliosCinema(day: string, cinemaId: number): Promise<SeedCandidate[]> {
  const res = await fetch(HELIOS_SCREENINGS(cinemaId), {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pl', Accept: 'application/json' },
    signal: AbortSignal.timeout(HELIOS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`helios ${cinemaId} -> ${res.status}`);
  const body = await res.json() as { data?: HeliosPayload };
  return parseHeliosPayload(body.data || {}, cinemaId, day);
}

export const heliosProvider: SeedProvider = {
  id: ProviderId.HELIOS,
  transport: 'fetch',
  fetchCandidates: async (ctx) => {
    const out: SeedCandidate[] = [];
    for (const id of heliosScopes()) {
      try { out.push(...await fetchHeliosCinema(ctx.day, Number(id))); }
      catch (e) { console.error(`helios scope ${id} failed: ${(e as Error).message}`); }
    }
    return out;
  },
  fetchBytes: (_ctx, url) => getBytes(url),
  scopes: heliosScopes(),
  fetchScope: (ctx, scope) => fetchHeliosCinema(ctx.day, Number(scope)),
};
