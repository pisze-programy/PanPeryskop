// multikino.pl provider — 'fetch' transport. Sitecore JSS SPA backed by a JSON
// microservice; no browser rendering needed. The per-cinema showings endpoint
// returns 401 unless an anonymous session token (microservicesToken cookie) is
// present — fetched once from /auth/token and reused (module-level cache) for
// every request in a run; refetched when a call starts returning 401.
//
// Granularity: ONE candidate per film×cinema×day (startMs = first session of the
// target day). Geo + address are parsed from the cinema's SSR repertuar page and
// upserted into the shared venues store, so only the first-ever seed pays for a
// page fetch per cinema; later days resolve from the store.
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { getBytes, getText, UA_HEADERS } from './http';
import { MK_BASE, MK_API, MK_AUTH, MK_EMBARGO, MK_CINEMAS, MK_THUMB_QUERY, MK_TOKEN_TTL_MS, mkScopes } from '../core/constants';
import { resolveVenueGeo, upsertVenue } from '../venues/venueStore';

// Module-level token cache — valid across multiple scopes in one invocation;
// between invocations a fresh fetch is cheap (and idempotent).
let token: string | null = null;
let tokenExpMs = 0;

// D1-backed cache shared across queue invocations: the /auth/token endpoint is
// rate-limited per egress IP, and without a shared cache a burst of scopes
// (each hitting getMkToken in its own isolate) triggers 403. One token per ~12h.
async function loadCachedToken(db: D1Database): Promise<{ token: string | null; exp: number }> {
  const row = await db.prepare('SELECT token, exp FROM mk_session WHERE id=1').first<{ token: string | null; exp: number }>();
  return { token: row?.token ?? null, exp: row?.exp ?? 0 };
}
async function storeCachedToken(db: D1Database, t: string, exp: number): Promise<void> {
  await db.prepare('INSERT INTO mk_session (id, token, exp) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET token=excluded.token, exp=excluded.exp')
    .bind(t, exp).run();
}

function isUsableImage(url: string | undefined | null): string {
  return url && /^https:\/\//.test(url) ? url : '';
}

// Parse "microservicesToken=..." out of Set-Cookie headers.
export function extractToken(cookies: string[]): string | null {
  for (const c of cookies) {
    const m = /(?:^|;\s*)microservicesToken=([^;]+)/.exec(c);
    if (m) return m[1];
  }
  return null;
}

// POST /auth/token, keep the anonymous session cookie. Cache until JWT exp —
// first in the module (per invocation), then in D1 (shared across invocations)
// so the rate-limited endpoint is hit at most once per token lifetime.
export async function getMkToken(ctx: SeedContext): Promise<string> {
  if (token && tokenExpMs > Date.now() + 60_000) return token;

  const cached = await loadCachedToken(ctx.env.DB);
  if (cached.token && cached.exp > Date.now() + 60_000) {
    token = cached.token;
    tokenExpMs = cached.exp;
    return cached.token;
  }

  const res = await fetch(MK_AUTH, { method: 'POST', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`multikino auth -> ${res.status}`);
  const cookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie') || ''];
  const t = extractToken(cookies);
  if (!t) throw new Error('multikino auth: no microservicesToken cookie');
  // JWT payload has exp (seconds).
  const exp = (() => {
    try {
      const p = JSON.parse(Buffer.from(t.split('.')[1] || '', 'base64url').toString());
      return typeof p?.exp === 'number' ? p.exp * 1000 : 0;
    } catch { return 0; }
  })();
  token = t;
  tokenExpMs = exp || Date.now() + MK_TOKEN_TTL_MS;
  await storeCachedToken(ctx.env.DB, token, tokenExpMs);
  return t;
}

interface MkSession {
  startTime?: string;
  showTimeWithTimeZone?: string;
  isSoldOut?: boolean;
}
interface MkShowingGroup { date?: string; sessions?: MkSession[] }
interface MkFilm {
  filmId?: string;
  filmTitle?: string;
  posterImageSrc?: string;
  filmUrl?: string;
  hasSessions?: boolean;
  showingGroups?: MkShowingGroup[];
}

// One cinema's showings for the target day → candidates (film×cinema×day).
export function parseMkFilms(data: unknown, cinemaId: string, day: string): SeedCandidate[] {
  const films = ((data as { result?: MkFilm[] } | null)?.result) || [];
  const out: SeedCandidate[] = [];
  for (const f of films) {
    if (!f.hasSessions || !f.filmId || !f.filmTitle) continue;
    const groups = (f.showingGroups || []).filter((g) => (g.date || '').slice(0, 10) === day);
    const sessions = groups.flatMap((g) => g.sessions || []);
    if (!sessions.length) continue;
    // startMs from the first session of the target day. showTimeWithTimeZone has
    // an explicit offset; fall back to local wall-clock with the Warsaw offset.
    const first = sessions[0];
    let startMs = Date.parse(first.showTimeWithTimeZone || '');
    if (Number.isNaN(startMs)) {
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(first.startTime || '');
      if (m) startMs = Date.parse(`${m[1]}T${m[2]}:00+02:00`);
    }
    if (Number.isNaN(startMs)) continue;
    const poster = isUsableImage(f.posterImageSrc);
    if (!poster) continue;
    const thumb = `${poster}${MK_THUMB_QUERY}`;
    out.push({
      source: ProviderId.MULTIKINO,
      externalId: `multikino-${cinemaId}-${f.filmId}-${day}`,
      title: f.filmTitle,
      startMs,
      lat: null, lng: null, // resolved via cinema geo (venues store / SSR)
      city: cinemaCity(cinemaId),
      venue: `Multikino ${cinemaName(cinemaId)}`,
      address: '',
      link: f.filmUrl || `${MK_BASE}/filmy`,
      mediaUrl: poster,
      thumbUrl: thumb,
      isSoldOut: sessions.every((s) => s.isSoldOut),
    });
  }
  return out;
}

function cinemaById(id: string) {
  return MK_CINEMAS.find((c) => c.id === id);
}
function cinemaName(id: string): string {
  return cinemaById(id)?.name || id;
}
function cinemaCity(id: string): string {
  return cinemaById(id)?.city || '';
}

// Resolve lat/lng (+ address) for one cinema. Store-first (fast on later days);
// on miss, fetch the cinema's SSR repertuar page once and upsert into venues.
export async function resolveMkGeo(
  ctx: SeedContext, cinemaId: string, venueName: string, city: string
): Promise<{ lat: number | null; lng: number | null; address: string }> {
  if (venueName) {
    const hit = await resolveVenueGeo(ctx.env.DB, venueName, city);
    if (hit) return { lat: hit.lat, lng: hit.lng, address: '' };
  }
  const cinema = cinemaById(cinemaId);
  if (!cinema) return { lat: null, lng: null, address: '' };
  try {
    const html = await getText(`${MK_BASE}/repertuar/${cinema.slug}/teraz-gramy`);
    const geoM = html.match(/maps\/embed[^"]*q=(-?[\d.]+), ?(-?[\d.]+)/);
    const addrM = html.match(/<address class="cinema-location__address">([\s\S]*?)<\/address>/);
    if (!geoM) return { lat: null, lng: null, address: '' };
    const lat = parseFloat(geoM[1]), lng = parseFloat(geoM[2]);
    const address = addrM ? decodeAddress(addrM[1]) : '';
    await upsertVenue(ctx.env.DB, { name: venueName, lat, lng, city, provider: ProviderId.MULTIKINO, ref: cinemaId });
    console.log(`multikino cinema ${cinemaId} geo (${lat},${lng}) -> stored`);
    return { lat, lng, address };
  } catch (e) {
    console.error(`multikino cinema ${cinemaId} geo failed: ${(e as Error).message}`);
    return { lat: null, lng: null, address: '' };
  }
}

// "<br/>ul. Półwiejska 42\r\n<br/>61-888 Poznań" -> "ul. Półwiejska 42, 61-888 Poznań"
function decodeAddress(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch one cinema (a queue fetch scope = cinemaId). Retries once with a fresh
// token on 401 (expired/throttled), matching the API's documented failure mode.
async function fetchMkCinema(ctx: SeedContext, cinemaId: string): Promise<SeedCandidate[]> {
  const t = await getMkToken(ctx);
  const url = `${MK_API}/showings/cinemas/${cinemaId}/films?showingDate=${ctx.day}&minEmbargoLevel=${MK_EMBARGO}&includesSession=true&includeSessionAttributes=true`;
  let res = await fetch(url, { headers: { ...UA_HEADERS, Authorization: `Bearer ${t}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 401) {
    token = null;
    const t2 = await getMkToken(ctx);
    res = await fetch(url, { headers: { ...UA_HEADERS, Authorization: `Bearer ${t2}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  }
  if (!res.ok) throw new Error(`multikino ${cinemaId} -> ${res.status}`);
  const data = await res.json();
  const out = parseMkFilms(data, cinemaId, ctx.day);

  // Resolve cinema geo once; fill lat/lng/address on every candidate.
  const venueName = `Multikino ${cinemaName(cinemaId)}`;
  const city = cinemaCity(cinemaId);
  const geo = await resolveMkGeo(ctx, cinemaId, venueName, city);
  for (const c of out) {
    if (geo.lat != null && geo.lng != null) { c.lat = geo.lat; c.lng = geo.lng; }
    if (geo.address) c.address = geo.address;
  }
  console.log(`multikino cinema ${cinemaId} -> ${out.length} candidates`);
  return out;
}

// Multikino's API rate-limits bursts per egress IP (both /auth/token and the
// showings endpoint return 403 after ~dozens of rapid calls). The seed therefore
// fetches cinemas SEQUENTIALLY with a small inter-request delay instead of the
// queue fanning out per-cinema scopes in parallel. One queue scope ('all') per batch.
const MK_SCOPE_DELAY_MS = 1000;

export async function fetchMultikino(ctx: SeedContext): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  for (const id of mkScopes()) {
    try { out.push(...await fetchMkCinema(ctx, id)); }
    catch (e) { console.error(`multikino scope ${id} failed: ${(e as Error).message}`); }
    if (MK_SCOPE_DELAY_MS) await new Promise((r) => setTimeout(r, MK_SCOPE_DELAY_MS));
  }
  return out;
}

export const multikinoProvider: SeedProvider = {
  id: ProviderId.MULTIKINO,
  transport: 'fetch',
  // Enabled: the earlier 403 was a per-IP rate-limit from bursting the API (both
  // /auth/token and showings). Mitigated by a D1-shared token cache (mk_session,
  // one auth call per ~12h) and a single sequential 'all' scope with a delay so
  // the showings endpoint is never burst.
  enabled: true,
  fetchCandidates: fetchMultikino,
  fetchBytes: (ctx, url) => getBytes(url),
  scopes: ['all'],
  fetchScope: (ctx, _scope) => fetchMultikino(ctx),
};
