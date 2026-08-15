// Daily event seed: scrape goingapp + kupbilecik for a target day, store posters
// as-is (webp stays webp; no local transcoding — the iOS client decodes WebP
// natively via ImageIO since iOS 14), and upsert sponsored posts into D1.
//
// Runs from the `scheduled` handler (cron) or the /admin/seed endpoint.
import { nanoid } from 'nanoid';
import { detectMediaType, extForMediaType, doSavePost } from './posts';
import { TTL_MS } from './models';

const UA = 'Mozilla/5.0';
const UA_HEADERS = {
  'User-Agent': UA,
  'Referer': 'https://goingapp.pl/',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
};
const ALGOLIA_URL =
  'https://faffkuslk0-dsn.algolia.net/1/indexes/*/queries?x-algolia-api-key=2116b4baed0596249c1f98b9a20dfc6c&x-algolia-application-id=FAFFKUSLK0';
const GOING_PLACE = (slug: string) => `https://api-empikbilety.prod.goingapp.eu/api/v1/place/${slug}`;
const KUP_LISTINGS = ['/koncerty/?q=', '/kabarety/?q=', '/standup/?q=', '/festiwal/?q='];
const KUP_MAX_PAGES = 6;
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const SEED_DEVICE_ID = 'panperyskop-seed';

// ---------- date helpers (Europe/Warsaw) ----------
export function todayWarsaw(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date()); // "YYYY-MM-DD"
}
export function tomorrowWarsaw(day = todayWarsaw()): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
export function warsawMidnightMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' });
  while (fmt.format(t) === isoDate) t -= 3_600_000;
  return t + 3_600_000;
}
function warsawOffset(): string {
  const raw = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', timeZoneName: 'shortOffset' })
    .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')!.value; // "GMT+2"
  const off = raw.replace('GMT', '');
  const sign = off[0] === '-' ? '-' : '+';
  return `${sign}${off.replace(/^[+-]/, '').padStart(2, '0')}:00`;
}
export function toWarsawIso(ms: number): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(ms)).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${warsawOffset()}`;
}

// ---------- HTTP helpers ----------
async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: UA_HEADERS });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}
async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA_HEADERS });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}
async function getBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: UA_HEADERS });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// kupbilecik sits behind Cloudflare Bot Fight Mode which blocks ALL traffic from
// Cloudflare Workers egress (403 empty body via fetch; raw TCP sockets are refused
// too). From a non-CF host (local Mac / GH Actions) it works fine — so the kupbilecik
// side must run outside the Worker; goingapp runs in the Worker cron. These helpers
// keep a single code path so the same pipeline can run from either place.

// ---------- scrapers ----------
function normVenue(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

interface GoingHit {
  name_pl?: string;
  start_date_timestamp?: number;
  place_slug?: string;
  place_name?: string;
  path?: string;
  thumbnail?: string;
  objectID?: string;
  slug?: string;
  rundate_slug?: string;
}

interface PlaceInfo {
  lat?: number;
  lon?: number;
  name?: string;
  address?: string;
  city?: { name?: string };
}

export async function fetchGoing(dayStart: number, dayEnd: number): Promise<SeedCandidate[]> {
  const params = `query=&filters=type%3Arundate&numericFilters=start_date_timestamp%3E%3D${dayStart}%2Cstart_date_timestamp%3C%3D${dayEnd}&hitsPerPage=100`;
  const res = await fetch(ALGOLIA_URL, {
    method: 'POST',
    headers: { ...UA_HEADERS, 'content-type': 'application/x-www-form-urlencoded', Origin: 'https://goingapp.pl' },
    body: JSON.stringify({ requests: [{ indexName: 'search-main', params }] }),
  });
  const data: any = await res.json();
  const hits: GoingHit[] = data.results?.[0]?.hits || [];
  const out: SeedCandidate[] = [];
  for (const h of hits) {
    let place: PlaceInfo = {};
    try { place = await getJson(GOING_PLACE(h.place_slug!)); } catch { /* keep place-less */ }
    const id = String(h.objectID || h.path || '').replace(/^rundates\//, '');
    const cloudPath = h.thumbnail;
    if (!cloudPath) continue;
    const enc = encodeURIComponent(cloudPath).replace(/%2F/g, '/');
    out.push({
      source: 'going',
      externalId: `going-${id}`,
      title: h.name_pl || '',
      startMs: h.start_date_timestamp ?? 0,
      lat: typeof place.lat === 'number' ? place.lat : null,
      lng: typeof place.lon === 'number' ? place.lon : null,
      city: place?.city?.name || '',
      venue: place?.name || h.place_name || '',
      address: place?.address || '',
      link: h.slug && h.rundate_slug
        ? `https://goingapp.pl/wydarzenie/${h.slug}/${h.rundate_slug}`
        : `https://goingapp.pl/${h.path}`,
      mediaUrl: `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,h_810,w_1080/f_jpg/q_auto:eco/v1/${enc}?_a=DATAiZAAZAA0`,
      thumbUrl: `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,w_320,h_320/f_jpg/q_auto:eco/v1/${enc}?_a=DATAiZAAZAA0`,
    });
  }
  return out;
}

interface SeedCandidate {
  source: 'going' | 'kupbilecik';
  externalId: string;
  title: string;
  startMs: number;
  lat: number | null;
  lng: number | null;
  city: string;
  venue: string;
  address: string;
  link: string;
  mediaUrl: string;
  thumbUrl: string | null;
}

export async function fetchKupbilecik(day: string): Promise<SeedCandidate[]> {
  const [y, m, d] = day.split('-').map(Number);
  const label = `${d} ${MONTHS[m - 1]} ${y}`;
  const seen = new Set<string>();
  const list: SeedCandidate[] = [];
  const dayStart = warsawMidnightMs(day);
  const dayEnd = dayStart + 24 * 3600 * 1000 - 1;

  for (const listing of KUP_LISTINGS) {
    let emptyStreak = 0;
    for (let qn = 1; qn <= KUP_MAX_PAGES; qn++) {
      const url = `https://www.kupbilecik.pl${listing}&qt=&qw=&qs=&qo=ASC&qn=${qn}`;
      let page: string;
      try { page = await getText(url); } catch { break; }
      const parts = page.split(/<b>(\d{1,2} \w+ 2026)<\/b>/);
      let dayHits = 0;
      for (let k = 1; k < parts.length - 1; k += 2) {
        if (parts[k].trim() !== label) continue;
        dayHits++;
        const content = parts[k + 1];
        const timeM = content.match(/godz\.\s*(\d{2}:\d{2})/);
        for (const m2 of content.matchAll(/href="(https:\/\/www\.kupbilecik\.pl\/(?:imprezy|wydarzenia)\/[^"]+)"/g)) {
          const href = m2[1];
          if (href.includes('/imprezy/')) {
            const cand = await buildKupEvent(href, seen, day, dayStart, dayEnd, timeM && timeM[1]);
            if (cand) list.push(cand);
          } else {
            const sub = await expandFestival(href, seen, day, dayStart, dayEnd);
            list.push(...sub);
          }
        }
      }
      if (dayHits === 0) { emptyStreak++; if (emptyStreak >= 2) break; }
      else emptyStreak = 0;
    }
  }
  return list;
}

async function expandFestival(href: string, seen: Set<string>, day: string, dayStart: number, dayEnd: number): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  try {
    const page = await getText(href);
    const links = [...new Set([...page.matchAll(/href="(\/imprezy\/\d+[^"]*)"/g)].map((m) => m[1]))];
    for (const link of links) {
      const cand = await buildKupEvent(`https://www.kupbilecik.pl${link}`, seen, day, dayStart, dayEnd, null);
      if (cand) out.push(cand);
    }
  } catch { /* ignore */ }
  return out;
}

async function buildKupEvent(
  href: string, seen: Set<string>, day: string, dayStart: number, dayEnd: number, fallbackTime: string | null
): Promise<SeedCandidate | null> {
  const id = (href.match(/\/(?:imprezy|wydarzenia)\/(\d+)\//) || [])[1];
  if (!id || seen.has(id)) return null;
  seen.add(id);
  let eventPage: string;
  try { eventPage = await getText(href); } catch { return null; }

  let ev: any = null;
  for (const m of eventPage.matchAll(/<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/gs)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = data['@graph'] || [data];
      ev = nodes.find((n: any) => /Event/.test(String(n['@type']))) || null;
      if (ev) break;
    } catch { /* ignore */ }
  }

  let startMs = ev?.startDate ? new Date(ev.startDate).getTime() : null;
  if (!startMs && fallbackTime) {
    const [hh, mm] = fallbackTime.split(':').map(Number);
    startMs = dayStart + (hh * 60 + mm) * 60 * 1000;
  }
  if (!startMs || startMs < dayStart || startMs > dayEnd) return null;

  const venueName = ev?.location?.name || '';
  const addr = ev?.location?.address || {};
  const address = [addr.streetAddress, addr.postalCode].filter(Boolean).join(', ');
  const city = addr.addressLocality || '';

  let lat: number | null = null, lng: number | null = null;
  const venueM = eventPage.match(/href="(\/obiekty\/[^"?]+)/);
  if (venueM) {
    try {
      const venueHtml = await getText(`https://www.kupbilecik.pl${venueM[1]}`);
      const geoM = venueHtml.match(/"geo":\{"@type":"GeoCoordinates","latitude":"([^"]+)","longitude":"([^"]+)"\}/);
      if (geoM) { lat = parseFloat(geoM[1]); lng = parseFloat(geoM[2]); }
    } catch { /* ignore */ }
  }

  const posters = [...new Set(eventPage.matchAll(/(https:\/\/www\.kupbilecik\.pl\/img\/(?:gal_plakaty|gal_baza)\/[^"'\s?]+)/g).map((m) => m[1]))];
  const poster = posters.filter((p) => !/_(?:m|fb|tlo)\.webp$/.test(p))[0] || posters[0];
  if (!poster) return null;

  // KupBilecik serves a ready-made thumbnail: same base with `_m.webp` suffix.
  const thumb = posters.find((p) => /_m\.webp$/.test(p)) || poster.replace(/\.webp$/, '_m.webp');

  return {
    source: 'kupbilecik',
    externalId: `kupbilecik-${id}-${day}`,
    title: ev?.name || '',
    startMs,
    lat, lng,
    city,
    venue: venueName,
    address,
    link: href,
    mediaUrl: poster,
    thumbUrl: thumb,
  };
}

// Cross-source dedupe: same start-hour + venue -> keep Going (its link is canonical).
export function dedupe(events: SeedCandidate[]): SeedCandidate[] {
  const seen = new Map<string, SeedCandidate>();
  const out: SeedCandidate[] = [];
  for (const e of events) {
    const key = `${Math.floor(e.startMs / 3600000)}|${normVenue(e.venue)}`;
    const prev = seen.get(key);
    if (prev) {
      if (e.source === 'going' && prev.source === 'kupbilecik') {
        const i = out.indexOf(prev);
        out[i] = e;
        seen.set(key, e);
      }
      continue;
    }
    seen.set(key, e);
    out.push(e);
  }
  return out;
}

export function buildDescription(c: SeedCandidate): string {
  const hm = toWarsawIso(c.startMs).slice(11, 16); // HH:MM
  // Keep street parts only: drop postal codes and the city token (the map shows the pin).
  const cityNorm = (c.city || '').trim().toLowerCase();
  const street = (c.address || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => !/^\d{2}-\d{3}$/.test(s))
    .filter((s) => s.toLowerCase() !== cityNorm)
    .join(', ');
  const loc = [c.venue, street].filter(Boolean).join(', ');
  return `${c.title}: ${hm}, ${loc}`.slice(0, 130);
}

export async function getOrCreateSeedUser(env: Env): Promise<{ id: string }> {
  const existing = await env.DB
    .prepare('SELECT id FROM users WHERE device_id = ?')
    .bind(SEED_DEVICE_ID)
    .first<{ id: string }>();
  if (existing) return existing;
  const id = nanoid(16);
  await env.DB
    .prepare('INSERT INTO users (id, device_id, session_token, role, username, auth_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, SEED_DEVICE_ID, nanoid(48), 'user', 'PanPeryskop Seed', 'device', Date.now())
    .run();
  return { id };
}

export interface SeedResult {
  day: string;
  candidates: number;
  going: number;
  kupbilecik: number;
  ingested: number;
  skipped: number;
  errors: { externalId: string; error: string }[];
}

// Main entry: seed `day` (YYYY-MM-DD). Fetches, downloads media to R2, upserts D1.
export async function runSeed(env: Env, day: string): Promise<SeedResult> {
  const dayStart = warsawMidnightMs(day);
  const createdAt = dayStart + 6 * 3600 * 1000; // 06:00 Europe/Warsaw
  const now = Date.now();
  if (createdAt < now - TTL_MS) throw new Error(`created_at (${new Date(createdAt).toISOString()}) too far in the past`);

  const user = await getOrCreateSeedUser(env);
  const going = await fetchGoing(dayStart, dayStart + 24 * 3600 * 1000 - 1);
  const kup = await fetchKupbilecik(day);
  const merged = dedupe([...kup, ...going]);

  const result: SeedResult = {
    day, candidates: merged.length,
    going: going.length, kupbilecik: kup.length,
    ingested: 0, skipped: 0, errors: [],
  };

  for (const c of merged) {
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number') { result.skipped++; continue; }
    try {
      // Stable post id by external_id (same id + media path across re-seeds).
      const existing = await env.DB
        .prepare('SELECT id FROM posts WHERE external_id = ?')
        .bind(c.externalId)
        .first<{ id: string }>();
      const postId = existing?.id || nanoid(24);

      const mediaBytes = await getBytes(c.mediaUrl);
      const mediaType = detectMediaType(mediaBytes);
      if (!mediaType || !mediaType.startsWith('image/')) throw new Error(`bad media ${mediaType || 'unknown'}`);
      const mediaKey = `posts/${postId}/media.${extForMediaType(mediaType)}`;
      await env.MEDIA.put(mediaKey, mediaBytes, { httpMetadata: { contentType: mediaType } });

      let thumbKey: string | null = null;
      if (c.thumbUrl) {
        try {
          const thumbBytes = await getBytes(c.thumbUrl);
          const thumbType = detectMediaType(thumbBytes) ?? 'image/webp';
          thumbKey = `posts/${postId}/thumb.${extForMediaType(thumbType)}`;
          await env.MEDIA.put(thumbKey, thumbBytes, { httpMetadata: { contentType: thumbType } });
        } catch { thumbKey = null; }
      }

      const description = buildDescription(c);
      await doSavePost(
        env, user, postId, 'photo', c.lat, c.lng, description,
        mediaKey, thumbKey, createdAt, true, c.link, c.externalId, Boolean(existing)
      );
      result.ingested++;
    } catch (e) {
      result.errors.push({ externalId: c.externalId, error: (e as Error).message });
    }
  }
  return result;
}

// For cron: seed tomorrow (Europe/Warsaw).
export function seedTomorrow(env: Env): Promise<SeedResult> {
  return runSeed(env, tomorrowWarsaw());
}
