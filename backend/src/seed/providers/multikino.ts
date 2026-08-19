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
import { MK_BASE, MK_API, MK_AUTH, MK_EMBARGO, MK_CINEMAS, MK_THUMB_QUERY, MK_TOKEN_TTL_MS, PROVIDER_FETCH_TIMEOUT_MS, mkScopes } from '../core/constants';
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

// Injectable caches so the SAME fetch path serves the Worker (D1-backed) and the
// LOCAL runner (admin/local/cinemas — module token cache + checkpoint geo store)
// without duplicating any fetch/parse logic.
export interface MkTokenStore {
  load(): Promise<{ token: string | null; exp: number }>;
  save(token: string, exp: number): Promise<void>;
}
export interface MkGeoStore {
  get(cinemaId: string): Promise<{ lat: number; lng: number; address: string } | null>;
  set(cinemaId: string, geo: { lat: number; lng: number; address: string }): Promise<void>;
}
export interface MkFetchOptions {
  /** Seed-window days to produce candidates for (one per film×cinema×day). */
  days: string[];
  /** D1 token cache (Worker). Omit for local — module-level cache only. */
  tokenStore?: MkTokenStore;
  /** D1 venues store (Worker). Omit for local — geo goes to geoStore. */
  db?: D1Database;
  /** Checkpoint geo cache (local runner). Omit for the Worker. */
  geoStore?: MkGeoStore;
}

function d1TokenStore(db: D1Database): MkTokenStore {
  return {
    load: () => loadCachedToken(db),
    save: (t, exp) => storeCachedToken(db, t, exp),
  };
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
// first in the module (per invocation), then in the given store when provided
// (the Worker shares it via D1 so the rate-limited endpoint is hit once per
// token lifetime; the local runner omits it and relies on the module cache).
async function getMkToken(store: MkTokenStore | null): Promise<string> {
  if (token && tokenExpMs > Date.now() + 60_000) return token;

  if (store) {
    const cached = await store.load();
    if (cached.token && cached.exp > Date.now() + 60_000) {
      token = cached.token;
      tokenExpMs = cached.exp;
      return cached.token;
    }
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
  if (store) await store.save(token, tokenExpMs);
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

// One cinema's programme for the seed-window days → candidates (film×cinema×day).
// A single request without `showingDate` returns the WHOLE programme (all days),
// so the window [today..today+SEED_DAYS_AHEAD] is covered by one call per cinema.
export function parseMkFilms(data: unknown, cinemaId: string, days: string[]): SeedCandidate[] {
  const films = ((data as { result?: MkFilm[] } | null)?.result) || [];
  const out: SeedCandidate[] = [];
  for (const f of films) {
    if (!f.hasSessions || !f.filmId || !f.filmTitle) continue;
    const poster = isUsableImage(f.posterImageSrc);
    if (!poster) continue;
    const filmSlug = (f.filmUrl || '').split('/filmy/')[1]?.split(/[?#]/)[0]?.replace(/\/$/, '') || '';
    const cinema = cinemaById(cinemaId);
    const link = cinema?.slug && filmSlug
      ? `${MK_BASE}/repertuar/${cinema.slug}/filmy/${filmSlug}`
      : (f.filmUrl || `${MK_BASE}/filmy`);
    for (const day of days) {
      const groups = (f.showingGroups || []).filter((g) => (g.date || '').slice(0, 10) === day);
      const sessions = groups.flatMap((g) => g.sessions || []);
      if (!sessions.length) continue;
      // startMs from the first session of that day. showTimeWithTimeZone has an
      // explicit offset; fall back to local wall-clock with the Warsaw offset.
      const first = sessions[0];
      let startMs = Date.parse(first.showTimeWithTimeZone || '');
      if (Number.isNaN(startMs)) {
        const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(first.startTime || '');
        if (m) startMs = Date.parse(`${m[1]}T${m[2]}:00+02:00`);
      }
      if (Number.isNaN(startMs)) continue;
      const times = sessions
        .map((s) => {
          const mm = /T(\d{2}:\d{2})/.exec(s.showTimeWithTimeZone || '') || /^.*T(\d{2}:\d{2})/.exec(s.startTime || '');
          return mm ? mm[1] : null;
        })
        .filter((x): x is string => x !== null)
        .sort();
      out.push({
        source: ProviderId.MULTIKINO,
        externalId: `multikino-${cinemaId}-${f.filmId}-${day}`,
        title: f.filmTitle,
        startMs,
        times,
        lat: null, lng: null, // resolved via cinema geo (venues store / SSR)
        city: cinemaCity(cinemaId),
        venue: `Multikino ${cinemaName(cinemaId)}`,
        address: '',
        link,
        mediaUrl: poster,
        thumbUrl: `${poster}${MK_THUMB_QUERY}`,
        isSoldOut: sessions.every((s) => s.isSoldOut),
      });
    }
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
// on miss, fetch the cinema's SSR repertuar page once and persist (venues store
// in the Worker, geoStore in the local runner).
export async function resolveMkGeo(
  cinemaId: string, venueName: string, city: string,
  opts?: { db?: D1Database; geoStore?: MkGeoStore }
): Promise<{ lat: number | null; lng: number | null; address: string }> {
  if (opts?.geoStore) {
    const hit = await opts.geoStore.get(cinemaId);
    if (hit) return hit;
  } else if (opts?.db && venueName) {
    const hit = await resolveVenueGeo(opts.db, venueName, city);
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
    if (opts?.geoStore) await opts.geoStore.set(cinemaId, { lat, lng, address });
    else if (opts?.db) await upsertVenue(opts.db, { name: venueName, lat, lng, city, provider: ProviderId.MULTIKINO, ref: cinemaId });
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

// Fetch one cinema (a queue fetch scope = cinemaId). ONE request WITHOUT the
// showingDate param returns the WHOLE programme (all days), so the seed window is
// covered in a single call per cinema. Retries once with a fresh token on 401.
export async function fetchMkCinema(opts: MkFetchOptions, cinemaId: string): Promise<SeedCandidate[]> {
  const t = await getMkToken(opts.tokenStore ?? null);
  const url = `${MK_API}/showings/cinemas/${cinemaId}/films?minEmbargoLevel=${MK_EMBARGO}&includesSession=true&includeSessionAttributes=true`;
  // Clean browser-ish headers WITHOUT a foreign Referer — UA_HEADERS carries
  // `Referer: https://goingapp.pl/` (shared with the going provider) which
  // multikino's Cloudflare rejects with 403.
  const mkHeaders = { 'User-Agent': UA_HEADERS['User-Agent'], Accept: 'application/json', Referer: MK_BASE };
  let res = await fetch(url, { headers: { ...mkHeaders, Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS) });
  if (res.status === 401) {
    token = null;
    const t2 = await getMkToken(opts.tokenStore ?? null);
    res = await fetch(url, { headers: { ...mkHeaders, Authorization: `Bearer ${t2}` }, signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS) });
  }
  if (!res.ok) throw new Error(`multikino ${cinemaId} -> ${res.status}`);
  const out = parseMkFilms(await res.json(), cinemaId, opts.days);

  // Resolve cinema geo once; fill lat/lng/address on every candidate.
  const venueName = `Multikino ${cinemaName(cinemaId)}`;
  const city = cinemaCity(cinemaId);
  const geo = await resolveMkGeo(cinemaId, venueName, city, { db: opts.db, geoStore: opts.geoStore });
  for (const c of out) {
    if (geo.lat != null && geo.lng != null) { c.lat = geo.lat; c.lng = geo.lng; }
    if (geo.address) c.address = geo.address;
  }
  console.log(`multikino cinema ${cinemaId} -> ${out.length} candidates (${opts.days.length} days)`);
  return out;
}

// Multikino's API rate-limits bursts per egress IP (both /auth/token and the
// showings endpoint return 403 after ~dozens of rapid calls). The seed therefore
// fetches cinemas SEQUENTIALLY with a small inter-request delay instead of the
// queue fanning out per-cinema scopes in parallel. One queue scope ('all') per batch.
const MK_SCOPE_DELAY_MS = 1000;

export async function fetchMultikino(ctx: SeedContext): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  const opts: MkFetchOptions = { days: [ctx.day], tokenStore: d1TokenStore(ctx.env.DB), db: ctx.env.DB };
  for (const id of mkScopes()) {
    try { out.push(...await fetchMkCinema(opts, id)); }
    catch (e) { console.error(`multikino scope ${id} failed: ${(e as Error).message}`); }
    if (MK_SCOPE_DELAY_MS) await new Promise((r) => setTimeout(r, MK_SCOPE_DELAY_MS));
  }
  return out;
}

export const multikinoProvider: SeedProvider = {
  id: ProviderId.MULTIKINO,
  transport: 'fetch',
  // Runs on the VPS (registry: sites=['vps']): the API sits behind Cloudflare
  // Bot Management and 403s automated datacenter egress. The local runner
  // (src/seed/executors/vps/runners/multikino.ts) with residential egress is
  // the reliable source, uploaded via seed-ingest.
  fetchCandidates: fetchMultikino,
  fetchBytes: (ctx, url) => getBytes(url),
  scopes: ['all'],
  fetchScope: (ctx, _scope) => fetchMultikino(ctx),
};
