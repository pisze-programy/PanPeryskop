// goingapp provider — 'fetch' transport. Scrapes Algolia search + place API.
// API keys come from wrangler vars (ALGOLIA_APP_ID / ALGOLIA_API_KEY /
// CLOUDINARY_SIG) — never hardcoded (they were previously leaked via git).
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from './types';
import { getJson } from './http';
import { upsertVenue } from './venueStore';

const GOING_PLACE = (slug: string) => `https://api-empikbilety.prod.goingapp.eu/api/v1/place/${slug}`;

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

async function fetchGoing(ctx: SeedContext): Promise<SeedCandidate[]> {
  const appId = ctx.env.ALGOLIA_APP_ID;
  const apiKey = ctx.env.ALGOLIA_API_KEY;
  const cloudSig = ctx.env.CLOUDINARY_SIG || '';
  if (!appId || !apiKey) throw new Error('going: ALGOLIA_APP_ID/ALGOLIA_API_KEY not configured');
  const algoliaUrl = `https://${appId}-dsn.algolia.net/1/indexes/*/queries?x-algolia-api-key=${encodeURIComponent(apiKey)}&x-algolia-application-id=${encodeURIComponent(appId)}`;
  const params = `query=&filters=type%3Arundate&numericFilters=start_date_timestamp%3E%3D${ctx.dayStart}%2Cstart_date_timestamp%3C%3D${ctx.dayEnd}&hitsPerPage=100`;
  const res = await fetch(algoliaUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', Origin: 'https://goingapp.pl' },
    body: JSON.stringify({ requests: [{ indexName: 'search-main', params }] }),
  });
  if (!res.ok) throw new Error(`going algolia -> ${res.status}`);
  const data = (await res.json()) as { results?: { hits?: GoingHit[] }[] };
  const hits: GoingHit[] = data.results?.[0]?.hits || [];
  const out: SeedCandidate[] = [];
  for (const h of hits) {
    let place: PlaceInfo = {};
    try { place = await getJson(GOING_PLACE(h.place_slug!)); } catch { /* keep place-less */ }
    if (typeof place.lat === 'number' && typeof place.lon === 'number' && place.name) {
      await upsertVenue(ctx.env.DB, { name: place.name, lat: place.lat, lng: place.lon, city: place.city?.name || '', provider: ProviderId.GOING });
    }
    const id = String(h.objectID || h.path || '').replace(/^rundates\//, '');
    const cloudPath = h.thumbnail;
    if (!cloudPath) continue;
    const enc = encodeURIComponent(cloudPath).replace(/%2F/g, '/');
    out.push({
      source: ProviderId.GOING,
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
      mediaUrl: `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,h_810,w_1080/f_jpg/q_auto:eco/v1/${enc}?_a=${cloudSig}`,
      thumbUrl: `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,w_320,h_320/f_jpg/q_auto:eco/v1/${enc}?_a=${cloudSig}`,
    });
  }
  return out;
}

export const goingProvider: SeedProvider = {
  id: ProviderId.GOING,
  transport: 'fetch',
  enabled: true,
  fetchCandidates: fetchGoing,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: ['all'],
  fetchScope: (ctx, _scope) => fetchGoing(ctx),
};
