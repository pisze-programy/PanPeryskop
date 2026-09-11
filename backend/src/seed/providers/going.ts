// goingapp provider — 'fetch' transport. Scrapes Algolia search + place API.
// API keys come from wrangler vars (ALGOLIA_APP_ID / ALGOLIA_API_KEY /
// CLOUDINARY_SIG) — never hardcoded (they were previously leaked via git).
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { getJson } from './http';
import { upsertVenue } from '../venues/venueStore';
import { GOING_BASE, GOING_ALGOLIA_ORIGIN, GOING_PLACE, GOING_POSTER, GOING_THUMB } from '../core/constants';
import { goingSlugKey } from '../core/goingTd';

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
  category_name?: string;
  category_slug?: string;
  tags_names?: string[];
  partner_id?: number;
  partner_name?: string;
}

interface PlaceInfo {
  lat?: number;
  lon?: number;
  name?: string;
  address?: string;
  city?: { name?: string };
}

// Per-process place cache: the same venue repeats across many events (and across
// runs in the long-lived VPS consumer), so this turns one place request per event
// into one per distinct venue — cutting residential-proxy traffic without any
// change to data freshness.
const placeCache = new Map<string, PlaceInfo>();

// Deterministic going tags from the API's own category_slug + title. Canonical
// ids only; the category is explicit on going's site (as certain as kupbilecik's
// listing category). `kultura` needs a strong title signal (a film — reż./film/
// pokaz/…); everything else (rozrywka, unknown slugs) stays untagged on purpose
// — better no tag than a wrong one.
const GOING_FILM_KW = /(reż|film|pokaz|kino|dokument|seans|festiwal filmowy|premiera|dyrygent|serial)/i;
export function goingTags(categorySlug: string | undefined, title: string | undefined): string[] | null {
  if (categorySlug === 'koncert') return ['muzyka'];
  if (categorySlug === 'teatr') return ['teatr'];
  if (categorySlug === 'inne') return ['inne'];
  if (categorySlug === 'sport') return ['inne'];
  if (categorySlug === 'kultura') {
    if (GOING_FILM_KW.test(title || '')) return ['filmy'];
    return null;
  }
  return null;
}

async function fetchGoing(ctx: SeedContext): Promise<SeedCandidate[]> {
  const appId = ctx.env.ALGOLIA_APP_ID;
  const apiKey = ctx.env.ALGOLIA_API_KEY;
  const cloudSig = ctx.env.CLOUDINARY_SIG || '';
  if (!appId || !apiKey) throw new Error('going: ALGOLIA_APP_ID/ALGOLIA_API_KEY not configured');
  // TradeDoubler slug→click map (built by the VPS runner, env.GOING_TD_MAP).
  // Absent (e.g. no TD token) → plain links, unchanged behavior.
  const tdMap = ctx.env.GOING_TD_MAP;
  const algoliaUrl = `https://${appId}-dsn.algolia.net/1/indexes/*/queries?x-algolia-api-key=${encodeURIComponent(apiKey)}&x-algolia-application-id=${encodeURIComponent(appId)}`;

  // Page over the whole day — Algolia caps hitsPerPage at 100 and busy days
  // (fests, weekend concerts) routinely exceed it. Dedupe by objectID across
  // pages so a pagination overlap never double-ingests a rundate.
  const base = `query=&filters=type%3Arundate&numericFilters=start_date_timestamp%3E%3D${ctx.dayStart}%2Cstart_date_timestamp%3C%3D${ctx.dayEnd}&hitsPerPage=100`;
  const hits: GoingHit[] = [];
  const seen = new Set<string>();
  let page = 0;
  for (;;) {
    const res = await fetch(algoliaUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', Origin: GOING_ALGOLIA_ORIGIN },
      body: JSON.stringify({ requests: [{ indexName: 'search-main', params: `${base}&page=${page}` }] }),
    });
    if (!res.ok) throw new Error(`going algolia -> ${res.status}`);
    const data = (await res.json()) as { results?: { hits?: GoingHit[]; nbPages?: number }[] };
    const r = data.results?.[0];
    const pageHits = r?.hits || [];
    for (const h of pageHits) {
      const key = String(h.objectID || h.path || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      hits.push(h);
    }
    if (pageHits.length === 0 || pageHits.length < 100 || page >= (r?.nbPages ?? 1) - 1) break;
    page++;
  }

  const out: SeedCandidate[] = [];
  const rejected: string[] = [];
  for (const h of hits) {
    let place: PlaceInfo = {};
    const slug = h.place_slug;
    if (slug) {
      const cached = placeCache.get(slug);
      if (cached) {
        place = cached;
      } else {
        try { place = await getJson(GOING_PLACE(slug)); placeCache.set(slug, place); } catch { /* keep place-less */ }
      }
    }
    // Venue upsert is an optimization for future geo reuse — on the VPS executor
    // there is no D1 binding, and the candidate already carries lat/lng from the
    // place API, so this is skipped (worker keeps it).
    if (ctx.env.DB && typeof place.lat === 'number' && typeof place.lon === 'number' && place.name) {
      await upsertVenue(ctx.env.DB, { name: place.name, lat: place.lat, lng: place.lon, city: place.city?.name || '', provider: ProviderId.GOING });
    }
    const id = String(h.objectID || h.path || '').replace(/^rundates\//, '');
    // Reject (never substitute): no id, no image, no title, no usable date.
    if (id === '') { rejected.push('missing id'); continue; }
    const cloudPath = h.thumbnail;
    if (cloudPath === undefined || cloudPath === '') { rejected.push(`${id}: missing image`); continue; }
    if (h.name_pl === undefined || h.name_pl === '') { rejected.push(`${id}: missing title`); continue; }
    const startMs = h.start_date_timestamp;
    if (typeof startMs !== 'number' || startMs <= 0) { rejected.push(`${id}: missing/invalid date`); continue; }
    const enc = encodeURIComponent(cloudPath).replace(/%2F/g, '/');
    // Affiliate: exact (event-slug, rundate-slug) match against the TD feed map.
    // No match → plain link (today's behavior — no commission to lose). The
    // plain link stays in `link` so intra/cross-provider dedupe is unaffected.
    let affiliateLink: string | undefined;
    if (h.slug && h.rundate_slug && tdMap) {
      affiliateLink = tdMap[goingSlugKey(h.slug, h.rundate_slug)];
    }
    const goingTagList = goingTags(h.category_slug, h.name_pl);
    out.push({
      source: ProviderId.GOING,
      externalId: `going-${id}`,
      title: h.name_pl,
      startMs,
      lat: typeof place.lat === 'number' ? place.lat : null,
      lng: typeof place.lon === 'number' ? place.lon : null,
      city: place.city === undefined || place.city.name === undefined ? '' : place.city.name,
      venue: place.name === undefined || place.name === '' ? (h.place_name === undefined ? '' : h.place_name) : place.name,
      address: place.address === undefined ? '' : place.address,
      link: h.slug && h.rundate_slug
        ? `${GOING_BASE}/wydarzenie/${h.slug}/${h.rundate_slug}`
        : `${GOING_BASE}/${h.path}`,
      affiliateLink,
      mediaUrl: GOING_POSTER(enc, cloudSig),
      thumbUrl: GOING_THUMB(enc, cloudSig),
      tags: goingTagList === null ? undefined : goingTagList,
      partnerId: h.partner_id != null ? String(h.partner_id) : undefined,
      partnerName: h.partner_name,
    });
  }
  if (rejected.length) console.warn(`going: rejected ${rejected.length} malformed hit(s): ${rejected.slice(0, 5).join('; ')}${rejected.length > 5 ? ' …' : ''}`);
  if (tdMap && out.length > 0) {
    const matched = out.filter((c) => c.affiliateLink).length;
    console.log(`going affiliate: ${matched}/${out.length} candidates matched`);
  }
  return out;
}

export const goingProvider: SeedProvider = {
  id: ProviderId.GOING,
  transport: 'fetch',
  fetchCandidates: fetchGoing,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: ['all'],
  fetchScope: (ctx, _scope) => fetchGoing(ctx),
  // VPS staging swaps affiliateLink→link at upload (seed-ingest), mirroring the
  // queue ingest hook here for parity if going ever moves to the Worker.
  resolveLink: (_ctx, cand) => Promise.resolve(cand.affiliateLink || cand.link),
};
