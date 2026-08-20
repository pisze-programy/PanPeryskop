// cinema-city.pl provider — 'fetch' transport. Public quickbook JSON API: one
// call per cinema×day returns films + events (title, poster, showtimes). Geo and
// the venue come from the static CC_CINEMAS catalog (constants.ts), which was
// captured once from the site's apiSitesList blob.
//
// Granularity: ONE candidate per film×cinema×day (startMs = earliest showtime).
// Queue scope = cinema (externalCode); each scope is one API call.
import { SeedProvider, SeedContext, SeedCandidate, ProviderId, ShowtimeBooking } from '../core/types';
import { getBytes } from './http';
import { warsawMidnightMs } from '../core/dates';
import { CC_CINEMAS, CC_FILM_EVENTS, CC_FILM_URL, CC_TIMEOUT_MS, ccScopes } from '../core/constants';

function cinemaById(code: string) {
  return CC_CINEMAS.find((c) => c.code === code);
}

// One cinema's films+events for the target day → candidates. Wall-clock showtimes
// (no tz) are parsed in Europe/Warsaw via warsawMidnightMs — the worker runs UTC.
export function parseCcScope(data: unknown, code: string, day: string): SeedCandidate[] {
  const body = (data as { body?: { films?: any[]; events?: any[] } } | null)?.body;
  const films = body?.films || [];
  const events = body?.events || [];
  const cinema = cinemaById(code);
  const out: SeedCandidate[] = [];
  const dayStart = warsawMidnightMs(day);
  for (const f of films) {
    const dayEvents = events.filter((e) => e.filmId === f.id);
    if (!dayEvents.length || !f.name) continue;
    const first = dayEvents.map((e) => e.eventDateTime).sort()[0];
    const m = /T(\d{2}):(\d{2})/.exec(first || '');
    if (!m) continue;
    const startMs = dayStart + (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 60_000;
    const times = dayEvents
      .map((e) => { const mm = /T(\d{2}):(\d{2})/.exec(e.eventDateTime || ''); return mm ? `${mm[1]}:${mm[2]}` : null; })
      .filter((x): x is string => x !== null)
      .sort();
    const showtimeBooking: ShowtimeBooking[] = [];
    for (const e of dayEvents) {
      const mm = /T(\d{2}):(\d{2})/.exec(e.eventDateTime || '');
      if (!mm) continue;
      if (!e.id) continue;
      showtimeBooking.push({
        time: `${mm[1]}:${mm[2]}`,
        kind: 'cinemacity',
        params: { order: String(e.id), cinema: code },
      });
    }
    const poster = f.posterLink || '';
    if (!poster) continue;
    out.push({
      source: ProviderId.CINEMACITY,
      externalId: `cinemacity-${f.id}-${code}-${day}`,
      title: f.name,
      startMs,
      times,
      showtimeBooking,
      lat: cinema?.lat ?? null, lng: cinema?.lng ?? null,
      city: cinema?.city || '',
      venue: `Cinema City ${cinema?.name || code}`,
      address: cinema?.address || '',
      link: f.link || CC_FILM_URL(f.id),
      mediaUrl: poster,
      thumbUrl: null,
      isSoldOut: dayEvents.every((e) => e.soldOut === true),
    });
  }
  return out;
}

// Fetch one cinema (queue scope = externalCode).
export async function fetchCcCinema(day: string, code: string): Promise<SeedCandidate[]> {
  const res = await fetch(CC_FILM_EVENTS(code, day), {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(CC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`cinemacity ${code} -> ${res.status}`);
  return parseCcScope(await res.json(), code, day);
}

export const cinemacityProvider: SeedProvider = {
  id: ProviderId.CINEMACITY,
  transport: 'fetch',
  // Runs on the VPS (registry: sites=['vps']): like multikino, cinema-city.pl is
  // behind Cloudflare Bot Management (__cf_bm on the data-api) and 403s the
  // Worker's datacenter egress. The VPS executor runner
  // (src/seed/executors/vps/runners/cinemacity.ts) with residential egress is
  // the reliable source.
  fetchCandidates: async (ctx) => {
    const out: SeedCandidate[] = [];
    for (const code of ccScopes()) {
      try { out.push(...await fetchCcCinema(ctx.day, code)); }
      catch (e) { console.error(`cinemacity scope ${code} failed: ${(e as Error).message}`); }
    }
    return out;
  },
  fetchBytes: (_ctx, url) => getBytes(url),
  scopes: ccScopes(),
  fetchScope: (ctx, scope) => fetchCcCinema(ctx.day, scope),
};
