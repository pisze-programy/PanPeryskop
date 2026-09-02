// ebilet.pl provider — 'fetch' transport (TradeDoubler affiliate feed, fid 94944).
//
// The Worker CANNOT download the feed: api.tradedoubler.com returns HTTP 400 (empty
// body) to Cloudflare Workers egress (a WAF — the same reason other providers run on
// the VPS executor). The feed is instead pushed into R2 (seed/ebilet-feed.json) by an
// external job via admin POST /seed/ebilet/feed (see loadFeed), and this provider
// consumes that cache. All parsing/mapping below is exercised against the real feed.
//
// Data model per product (one eBilet event page, identified by SourceProductId):
//   fields: many "Availability|Location|Date|Segment<N>" = "In Stock|Venue, City|2026-09-04 19:00:00|Segment X"
//   offers[0].productUrl     — TradeDoubler click URL (affiliate), unique per product
//   offers[0].priceHistory   — [{date, price:{value:"138.9",currency:"PLN"}}]; last = current
//   productImage.url         — ebilet CMS webp (verified 200, image/webp)
//   categories[].tdCategoryName (unlimited export) / .name (paginated export)
//
// Feed facts that shape this implementation:
//   - The paginated endpoint (products.json) caps at 1000 products (PF_430); the full
//     ~1292-product export is productsUnlimited.json WITHOUT compress=gz (plain ~3.5 MB
//     JSON after an optional 202 "regenerating" and a 302 to a signed URL).
//   - Segment numbers are UNSTABLE between regenerations (Segment1, Segment380, ...) so
//     the externalId never embeds them: ebilet-<sid>-<event-day>.
//   - Availability is "In Stock" or empty today; empty segments never carry a date
//     (verified). Explicit non-stock tokens → is_sold_out badge, never skipped.
//
// Geo: the feed has NO coordinates. Venues are resolved AFTER dedupe (survivors only)
// through the shared venues store → Nominatim, exactly like kupbilecik — never inside
// fetchScope, where the Worker's 4-req/min Nominatim pace would blow the scope's runtime.
//
// Link: candidate.link stays a DISTINCT per-product eBilet URL so dedupe R1 (identical
// linkKey + venue match) never merges different events that share the click-tracker host;
// the affiliate click URL travels in affiliateLink and replaces link at ingest
// (resolveLink hook).
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { resolveGeo } from '../core/geo';
import { diacriticFold } from '../core/match';
import { toWarsawIso } from '../core/dates';
import { PROVIDER_FETCH_TIMEOUT_MS } from '../core/constants';

const EBILET_UNLIMITED = 'https://api.tradedoubler.com/1.0/productsUnlimited.json';
const EBILET_LAST_UPDATED = 'https://api.tradedoubler.com/1.0/productsUnlimited/lastUpdated.json';
const EBILET_FID = '94944';
// TD reports "not for sale right now" through availability tokens. Treat only the
// explicit sold-out/ended vocabulary as sold-out — anything unknown stays available
// rather than showing a false "Wyprzedane" badge.
const SOLD_OUT_RE = /out\s*of\s*stock|not\s*available|sold\s*out|ended|wyprzedan|przedsprzedan/i;

interface EbiletOffer {
  productUrl?: string;
  sourceProductId?: string;
  priceHistory?: Array<{ date?: number; price?: { value?: string; currency?: string } }>;
}
interface EbiletProduct {
  name?: string;
  fields?: Array<{ name?: string; value?: string }>;
  offers?: EbiletOffer[];
  categories?: Array<{ tdCategoryName?: string; name?: string }>;
  productImage?: { url?: string } | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isUsableImage(url: string | undefined): string {
  if (!url || /blank\.gif|teaser|placeholder/i.test(url)) return '';
  return url;
}

/** "In Stock|Venue, City|2026-09-04 19:00:00|Segment 1" → availability + location + naive date/time. */
export interface EbiletSegment {
  availability: string; // lowercased token, '' when empty
  location: string;     // raw "Venue, City" part
  date: string;         // YYYY-MM-DD (Europe/Warsaw)
  time: string;         // HH:MM:SS (00:00:00 when the feed omits it)
}
export function splitSegment(value: string | undefined): EbiletSegment | null {
  const parts = (value || '').split('|');
  if (parts.length < 3) return null;
  const dateTime = (parts[2] || '').trim();
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/.exec(dateTime);
  if (!m) return null; // empty placeholder ("|||") or non-date → skip
  return {
    availability: (parts[0] || '').trim().toLowerCase(),
    location: (parts[1] || '').trim(),
    date: m[1],
    time: m[2] || '00:00:00',
  };
}

/** "Restauracja MAX, Katowice, Katowice" → { venue:"Restauracja MAX", city:"Katowice" }.
 *  Splits on the LAST comma and strips a duplicated trailing city so the venue-store key
 *  and the geocoder query never carry a doubled city. */
export function parseEbiletLocation(location: string | undefined): { venue: string; city: string } {
  const s = (location || '').trim();
  if (!s) return { venue: '', city: '' };
  const i = s.lastIndexOf(',');
  if (i < 0) return { venue: s, city: '' };
  const venueRaw = s.slice(0, i).trim();
  const city = s.slice(i + 1).trim();
  let venue = venueRaw;
  if (venue && city) {
    venue = venue.replace(new RegExp(`,\\s*${escapeRegExp(city)}\\s*$`, 'i'), '').trim();
  }
  return { venue, city };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Current price in PLN — the LAST priceHistory entry — or null when unknown/absent. */
export function ebiletPrice(p: EbiletProduct): number | null {
  const ph = p.offers?.[0]?.priceHistory;
  const last = Array.isArray(ph) && ph.length > 0 ? ph[ph.length - 1] : null;
  const v = last?.price?.value;
  if (typeof v !== 'string') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** The eBilet event page URL (distinct per product) decoded from the TD click URL's
 *  url(...) parameter — the dedupe-facing link (see header note). */
export function ebiletPageUrl(p: EbiletProduct): string {
  const click = p.offers?.[0]?.productUrl || '';
  const m = /url\(([^)]+)\)\s*$/i.exec(click);
  if (m) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (/^https?:\/\//.test(decoded)) return decoded;
    } catch { /* malformed */ }
  }
  // Synthetic but still UNIQUE per product so dedupe R1 never collapses events on the
  // shared click-tracker host. resolveLink swaps in the real affiliate URL at ingest,
  // so this fallback never reaches the user.
  const sid = p.offers?.[0]?.sourceProductId || 'x';
  return `https://www.ebilet.pl/event/${sid}`;
}

/** First category path of the product ("Muzyka/Rock"), read from either category
 *  key (tdCategoryName in the unlimited export, name in the paginated one). */
export function firstEbiletCategory(p: EbiletProduct): string | null {
  for (const c of p.categories || []) {
    const path = (c?.tdCategoryName || c?.name || '').trim();
    if (path) return path;
  }
  return null;
}

/** Map an eBilet category path onto the CANONICAL tag set (seed/core/tags.ts).
 *  Classification reviewed with the user on the real 48-path taxonomy:
 *    safe prefixes (Muzyka|Teatr|Sport + stand-up/kabarety + zwiedzanie/rekreacja/atrakcje)
 *    → their obvious tag; classical concerts (Klasyka/...) → 'muzyka'; business
 *    conferences/trainings → 'meetup'; the enumerated ambiguous paths → the 'inne'
 *    catch-all bag. Unknown/missing categories → null (never a guessed tag). */
export function ebiletTags(category: string | null): string | null {
  if (!category) return null;
  // Normalize the pipe spacing the feed sometimes emits ("Rodzina/Warsztaty | Edukacja").
  const path = category.replace(/\s*\|\s*/g, '|').trim();
  if (path.startsWith('Muzyka/')) return 'muzyka';
  if (path.startsWith('Sport/')) return 'sport';
  if (path.startsWith('Teatr/') || path === 'Rodzina/Teatr dla dzieci') return 'teatr';
  if (path === 'Widowiska/Stand-up' || path === 'Widowiska/Kabarety') return 'komedia';
  if (path.startsWith('Zwiedzanie/') || path === 'Rodzina/Atrakcje dla rodziny' || path === 'Rodzina/Rekreacja') return 'atrakcje';
  if (path === 'Klasyka/Koncerty muzyki poważnej' || path === 'Klasyka/Muzyka filmowa' || path === 'Klasyka/Opera i Operetka') return 'muzyka';
  if (path === 'Biznes/Konferencje' || path === 'Biznes/Szkolenia' || path === 'Biznes/Inne') return 'meetup';
  // Reviewed catch-all bag (Balet, Wystawy, Targi, Rodzina/Widowiska dla dzieci,
  // Warsztaty|Edukacja, Rewie|Show, Widowiska/Inne, ...). Anything NOT enumerated
  // stays untagged — better no tag than a wrong one (seed/core/tags.ts policy).
  const INNE = new Set([
    'Klasyka/Balet i taniec klasyczny',
    'Biznes/Wystawy',
    'Biznes/Targi',
    'Rodzina/Widowiska dla dzieci',
    'Rodzina/Warsztaty|Edukacja',
    'Widowiska/Rewie|Show',
    'Widowiska/Inne',
  ]);
  return INNE.has(path) ? 'inne' : null;
}

/** Build candidates for ONE target day from one product. All in-day segments of the
 *  product are the SAME event at the SAME venue on different times — they collapse into
 *  ONE post carrying showtimes[] (no duplicate posts). is_sold_out applies only when NO
 *  segment is on sale; the post startMs is the earliest AVAILABLE slot (a venue that sold
 *  out 16:30 but still sells 19:00 starts at 19:00). */
export function parseEbiletProduct(p: EbiletProduct, day: string, dayStartMs: number): SeedCandidate[] {
  const name = (p.name || '').trim();
  const offers = p.offers || [];
  const sid = offers[0]?.sourceProductId || '';
  if (!name || !sid) return [];

  // Collect every usable in-day segment (product × day → one candidate).
  interface Slot { ms: number; soldOut: boolean; hhmm: string; location: string }
  const slots: Slot[] = [];
  for (const f of p.fields || []) {
    if (!f?.name?.startsWith('Availability|Location|Date|Segment')) continue;
    const seg = splitSegment(f?.value);
    if (!seg || seg.date !== day || !seg.availability) continue;
    const h = Number(seg.time.slice(0, 2));
    const mi = Number(seg.time.slice(3, 5));
    slots.push({
      ms: dayStartMs + (h * 60 + mi) * 60_000,
      soldOut: SOLD_OUT_RE.test(seg.availability),
      hhmm: seg.time.slice(0, 5),
      location: seg.location,
    });
  }
  if (slots.length === 0) return [];

  // Showtimes = every AVAILABLE slot when any is on sale, else every slot (sold-out
  // day). Sorted unique HH:MM — the UI renders them as the post's time picker.
  const available = slots.filter((s) => !s.soldOut);
  const pick = available.length > 0 ? available : slots;
  pick.sort((a, b) => a.ms - b.ms);
  const winner = pick[0];
  const soldOut = available.length === 0;
  const times = [...new Set((available.length > 0 ? available : slots).map((s) => s.hhmm))].sort();

  const { venue, city } = parseEbiletLocation(winner.location);
  const img = isUsableImage(p.productImage?.url);
  const tag = ebiletTags(firstEbiletCategory(p));
  return [{
    source: ProviderId.EBILET,
    externalId: `ebilet-${sid}-${day.replace(/-/g, '')}`,
    title: name,
    startMs: winner.ms,
    lat: null,
    lng: null,
    city,
    venue,
    address: '',
    link: ebiletPageUrl(p),
    affiliateLink: offers[0]?.productUrl || undefined,
    mediaUrl: img,
    thumbUrl: img || null,
    isSoldOut: soldOut,
    price: ebiletPrice(p),
    tags: tag ? [tag] : undefined,
    times,
  }];
}

function hhmmOf(ms: number): string {
  return toWarsawIso(ms).slice(11, 16);
}

/** Merge candidates that are the SAME event at the SAME venue on the SAME day
 *  (identical normalized title + venue). TradeDoubler can emit one show as several
 *  products/segments; the app wants ONE post per event-day with showtimes[] — never
 *  duplicate posts for the same event-day-venue. The earliest-start member stays
 *  canonical (its externalId/link/media); times, price and the sold-out flag are the
 *  union/min/AND across the group. */
export function aggregateEbiletDayCandidates(cands: SeedCandidate[]): SeedCandidate[] {
  if (cands.length < 2) return cands;
  const groups = new Map<string, SeedCandidate[]>();
  for (const c of cands) {
    const key = `${diacriticFold(c.title)}\u0000${diacriticFold(c.venue)}`;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }
  const out: SeedCandidate[] = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) { out.push(arr[0]); continue; }
    arr.sort((a, b) => a.startMs - b.startMs);
    const winner = arr[0];
    const times = new Set<string>();
    let price: number | null = null;
    for (const m of arr) {
      const list = m.times && m.times.length > 0 ? m.times : [hhmmOf(m.startMs)];
      for (const t of list) times.add(t);
      if (typeof m.price === 'number' && (price === null || m.price < price)) price = m.price;
    }
    winner.times = [...times].sort();
    winner.price = price;
    winner.isSoldOut = arr.every((m) => m.isSoldOut);
    out.push(winner);
  }
  return out;
}

/** Fetch the whole feed (all ~1292 products) once. The unlimited export regenerates
 *  occasionally — 202 → wait and retry, bounded. 302 → fetch follows to the signed file. */
export async function fetchEbiletFeed(token: string): Promise<{ products: EbiletProduct[] }> {
  const url = `${EBILET_UNLIMITED};fid=${EBILET_FID}?token=${encodeURIComponent(token)}`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
    });
    if (res.status === 202) {
      await sleep(15_000); // export still generating — try again
      continue;
    }
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`ebilet feed -> ${res.status} at ${res.url} ${snippet}`);
    }
    return (await res.json()) as { products: EbiletProduct[] };
  }
  throw new Error('ebilet feed still generating (202 after 6 attempts)');
}

/** Candidates for the target day (whole Poland, all categories). Day-scoped so the
 *  provider slots into the per-day seed batch model.
 *
 *  IMPORTANT: api.tradedoubler.com rejects Cloudflare Workers egress (HTTP 400, empty
 *  body). The Worker can NOT download the feed itself. Instead the feed is pushed into
 *  R2 (seed/ebilet-feed.json) by an EXTERNAL job (admin POST /seed/ebilet/feed, run from
 *  the VPS/mac where a plain download works) whenever the feed changes. The provider
 *  reads that cache and only attempts its own download when no cache exists (then the
 *  scope fails loudly until the external warm). TradeDoubler's quota (3 downloads / 24h
 *  per version) is therefore irrelevant on the Worker side; the external job checks the
 *  "Unlimited Last Updated" endpoint before re-pushing. */
const FEED_CACHE_KEY = 'seed/ebilet-feed.json';

/** Version of the feed file per the Unlimited Last Updated service, or null on error. */
async function ebiletFeedVersion(token: string): Promise<string | null> {
  const url = `${EBILET_LAST_UPDATED};fid=${EBILET_FID}?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { lastUpdatedTime?: string };
    return typeof body.lastUpdatedTime === 'string' ? body.lastUpdatedTime : null;
  } catch (e) {
    console.warn(`ebilet lastUpdated check failed (${(e as Error).message})`);
    return null;
  }
}

async function loadFeed(ctx: SeedContext): Promise<{ products: EbiletProduct[] }> {
  const token = ctx.env.EBILET_TD_TOKEN;
  if (!token) throw new Error('EBILET_TD_TOKEN secret missing');
  const cached = await ctx.env.MEDIA.get(FEED_CACHE_KEY);
  const parseCached = async (): Promise<{ products: EbiletProduct[] }> =>
    JSON.parse(await cached!.text()) as { products: EbiletProduct[] };

  if (cached) {
    const version = await ebiletFeedVersion(token);
    // Version check blocked/error (worker egress to TD) → trust the external cache.
    if (version === null || cached.customMetadata?.feedUpdated === version) return parseCached();
    // Version changed → try to download ourselves; fall back to the cache on failure.
    try {
      const feed = await fetchEbiletFeed(token);
      await ctx.env.MEDIA.put(FEED_CACHE_KEY, JSON.stringify(feed), {
        httpMetadata: { contentType: 'application/json' },
        customMetadata: { feedUpdated: version },
      }).catch(() => { /* cache write is best-effort */ });
      return feed;
    } catch (e) {
      console.warn(`ebilet feed download failed (${(e as Error).message}) — using cached copy`);
      return parseCached();
    }
  }
  // No cache yet: the worker download will fail until an external job warms R2.
  const feed = await fetchEbiletFeed(token);
  await ctx.env.MEDIA.put(FEED_CACHE_KEY, JSON.stringify(feed), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { feedUpdated: 'external' },
  }).catch(() => { /* cache write is best-effort */ });
  return feed;
}

export async function fetchEbiletDay(ctx: SeedContext): Promise<SeedCandidate[]> {
  const feed = await loadFeed(ctx);
  const out: SeedCandidate[] = [];
  const dayStart = ctx.dayStart;
  for (const p of feed.products || []) {
    out.push(...parseEbiletProduct(p, ctx.day, dayStart));
  }
  return aggregateEbiletDayCandidates(out);
}

/** Deferred geo (ingest-time, survivors only): shared venues store → Nominatim.
 *  Returns null when nothing resolves — the caller falls back to the city-center /
 *  (0,0) PENDING pin. No fallback point here: ebilet is whole-Poland and a Nominatim
 *  query per uncached venue at the Worker pace can only run for the few survivors. */
export async function resolveEbiletGeo(ctx: SeedContext, cand: SeedCandidate): Promise<{ lat: number; lng: number } | null> {
  if (!cand.venue && !cand.address) return null;
  const geo = await resolveGeo({
    name: cand.venue,
    address: cand.address,
    city: cand.city || undefined,
    db: ctx.env.DB,
    provider: ProviderId.EBILET,
  });
  return geo ? { lat: geo.lat, lng: geo.lng } : null;
}

export const ebiletProvider: SeedProvider = {
  id: ProviderId.EBILET,
  transport: 'fetch',
  fetchCandidates: fetchEbiletDay,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: ['pl'],
  fetchScope: (ctx) => fetchEbiletDay(ctx),
  resolveLink: (_ctx, cand) => Promise.resolve(cand.affiliateLink || cand.link),
};
