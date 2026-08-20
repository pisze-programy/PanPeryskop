// eventylive.pl provider — 'fetch' transport. Aggregates ticket platforms that
// dzis.app does NOT cover (bilety24, biletyna, empikbilety, evenea) plus the
// shared kupbilecik/ebilet. No Cloudflare → plain fetch from the Worker edge.
// Limitations: no per-event time (events are all-day), no geo → venue is matched
// against dzis.app venue cache (fuzzy) and falls back to the city center bbox.
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { CITIES, cityById, cityBbox } from '../../admin/cities';
import { matchVenueGeo, VenueEntry } from '../venues/venueMatch';
import { upsertVenuesBatch, listVenues, venueKey } from '../venues/venueStore';
import { DZIS_API, DZIS_LIMIT, EVL_BASE, EVL_LIST_BASE, EVL_MAX_PAGES } from '../core/constants';
import { normalizeTags } from '../core/tags';

const UA = { 'User-Agent': 'Mozilla/5.0' };

// All eventylive cities (20).
const EVL_CITIES = CITIES.map((c) => c.id);

interface EvlEventJson {
  name?: string;
  startDate?: string; // "YYYY-MM-DD" (date only)
  location?: { name?: string; address?: { addressLocality?: string; streetAddress?: string } };
  offers?: { url?: string; availability?: string } | Array<{ url?: string; availability?: string }>;
  image?: string;
}

export function getOfferUrl(offers: EvlEventJson['offers']): string | null {
  if (!offers) return null;
  const arr = Array.isArray(offers) ? offers : [offers];
  for (const o of arr) if (o?.url) return o.url;
  return null;
}

function decodeHtml(s: string): string {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function parseEvlEvent(html: string): EvlEventJson | null {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/gs)) {
    try {
      const data: unknown = JSON.parse(m[1]);
      const graph = (Array.isArray(data) ? data : ((data as { '@graph'?: unknown[] } | null)?.['@graph'] ?? [data])) as unknown[];
      const ev = graph.find((n) => /Event/i.test(String((n as { '@type'?: unknown })?.['@type'])));
      if (ev) {
        if ((ev as EvlEventJson).name) (ev as EvlEventJson).name = decodeHtml((ev as EvlEventJson).name as string);
        return ev as EvlEventJson;
      }
    } catch (e) {
      console.error(`eventylive parse ld+json failed: ${(e as Error).message}`);
    }
  }
  return null;
}

// Seed the shared `venues` store from dzis.app (all cities) so parallel scopes can
// borrow venue geo without re-fetching dzis.app, and other providers (kupbilecik,
// going, eventylive) reuse the same locations. Uses bulk insert with JS-side
// dedup: dzis.app repeats the same venue across hundreds of events, so we collapse
// by venue key BEFORE the batch — ~10k events reduce to ~1k unique venues.
export async function buildVenueCache(ctx: SeedContext, _day: string): Promise<void> {
  const seen = new Set<string>();
  const collected: { name: string; lat: number; lng: number }[] = [];
  for (const cityId of CITIES.map((c) => c.id)) {
    try {
      const res = await fetch(`${DZIS_API}?city=${cityId}&limit=${DZIS_LIMIT}`, { headers: UA });
      if (!res.ok) continue;
      const j = (await res.json()) as { events?: Array<{ venue?: { name?: string; geo?: { lat?: number; lng?: number } } }> };
      for (const e of j.events || []) {
        const name = e.venue?.name;
        const g = e.venue?.geo;
        if (!name || !g?.lat || !g?.lng) continue;
        const key = venueKey(name);
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({ name, lat: g.lat, lng: g.lng });
      }
    } catch (e) {
      console.error(`venue-cache dzis.app ${cityId} failed: ${(e as Error).message}`);
    }
  }
  const n = await upsertVenuesBatch(ctx.env.DB, collected.map((v) => ({ ...v, provider: ProviderId.DZISAPP })));
  console.log(`venue-cache: ${collected.length} unique venues (from ${seen.size} keys) seeded via ${n} inserts`);
}

// Read the shared venues store for in-memory fuzzy matching (matchVenueGeo).
async function loadVenueCache(ctx: SeedContext, _day: string): Promise<VenueEntry[]> {
  return listVenues(ctx.env.DB);
}

// eventylive's offers.availability mirrors the ticket platform's value, but for
// ebilet links it stays InStock even when the specific date's tickets are sold
// out. ebilet's page exposes a `json-ld-event-data-*` block per showtime with an
// accurate `availability`; fetch it (with ?date= to keep the payload small) and
// read the showtime that matches the target day.
interface EbiletOffer { availability?: string; validThrough?: string }
interface EbiletEventData { startDate?: string; offers?: EbiletOffer | EbiletOffer[] }

async function ebiletSoldOut(ctx: SeedContext, baseUrl: string, day: string): Promise<boolean> {
  const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + `date=${day}`;
  let html: string;
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return false;
    html = await res.text();
  } catch (e) {
    console.error(`ebilet sold-out probe failed: ${(e as Error).message}`);
    return false;
  }
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*id="json-ld-event-data-[^"]+"[^>]*>(.*?)<\/script>/gs)) {
    try {
      const d = JSON.parse(m[1]) as EbiletEventData;
      if (!d.startDate || !String(d.startDate).startsWith(day)) continue;
      const offers = Array.isArray(d.offers) ? d.offers : (d.offers ? [d.offers] : []);
      const avail = offers.map((o) => String(o.availability || '')).join(' ');
      return /(?:soldout|outofstock)/i.test(avail);
    } catch (e) {
      console.error(`ebilet sold-out parse failed: ${(e as Error).message}`);
    }
  }
  return false;
}

export async function fetchEventylive(ctx: SeedContext): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  for (const cityId of EVL_CITIES) {
    out.push(...await fetchEventyliveCity(ctx, cityId));
  }
  return out;
}

// Fetch one eventylive city (a queue fetch scope).
export async function fetchEventyliveCity(ctx: SeedContext, cityId: string): Promise<SeedCandidate[]> {
  const venueCache = await loadVenueCache(ctx, ctx.day);
  const out: SeedCandidate[] = [];

  const city = cityById(cityId);
  if (!city) return out;
  const bbox = cityBbox(cityId);
  // Fallback coordinate = city center (bbox middle).
  const fbLat = bbox ? bbox.swLat + (bbox.neLat - bbox.swLat) / 2 : city.lat;
  const fbLng = bbox ? bbox.swLng + (bbox.neLng - bbox.swLng) / 2 : city.lng;

  // The slug encodes the event date: "...-YYYYMMDD-<hash>". Pre-filter by it, so
  // we only fetch event pages that fall on the target day (listings are cheap).
  const targetCompact = ctx.day.replace(/-/g, ''); // "2026-08-22" -> "20260822"
  let eventLinks: string[] = [];
  for (let pg = 1; pg <= EVL_MAX_PAGES; pg++) {
    let page: string;
    try {
      const res = await fetch(`${EVL_LIST_BASE}/${cityId}${pg > 1 ? `?page=${pg}` : ''}`, { headers: UA });
      if (!res.ok) break;
      page = await res.text();
    } catch (e) {
      console.error(`eventylive listing ${cityId} page ${pg} failed: ${(e as Error).message}`);
      break;
    }
    const links = [...new Set([...page.matchAll(/href="(\/wydarzenie\/[^"]+)"/g)].map((m) => m[1]))];
    if (!links.length) break;
    eventLinks.push(...links);
    if (pg === EVL_MAX_PAGES) break;
  }

  const seen = new Set<string>();
  for (const link of eventLinks) {
      if (seen.has(link)) continue;
      seen.add(link);
      // Pre-filter by date in the slug; skip events not on the target day.
      const slugDate = (link.match(/(20\d{6})(?:-[a-f0-9]+)?\/?$/) || [])[1];
      if (!slugDate || slugDate !== targetCompact) continue;

      let evl: EvlEventJson | null;
      try {
        const res = await fetch(`${EVL_BASE}${link}`, { headers: UA });
        if (!res.ok) continue;
        evl = parseEvlEvent(await res.text());
      } catch (e) {
        console.error(`eventylive event ${link} failed: ${(e as Error).message}`);
        continue;
      }
      if (!evl) continue;
      const startDate = evl.startDate;
      if (!startDate || startDate !== ctx.day) continue;

      // startMs = city midnight (eventylive has no time).
      const startMs = ctx.dayStart;

      const venueName = evl.location?.name || '';
      const locality = evl.location?.address?.addressLocality || city.name;
      const street = evl.location?.address?.streetAddress || '';

      // Borrow geo from dzis.app venue cache (fuzzy), else city center. The venue
      // name alone is ambiguous across cities ("Tama" in Warszawa vs Poznań), so
      // prefer matches in the candidate's city.
      const geo = matchVenueGeo(venueName, venueCache, locality);

      const img = evl.image || '';
      const id = (link.match(/\/wydarzenie\/([^/]+)/) || [])[1];

      // Ticket availability. For ebilet links eventylive's offers.availability is
      // unreliable (stays InStock when a showtime is sold out), so probe ebilet's
      // own JSON-LD for the showtime on the target day. Other platforms (bilety24,
      // kupbilecik, ticketmaster) fall back to eventylive's mirrored value.
      let ticketLink = getOfferUrl(evl.offers) || `https://www.eventylive.pl${link}`;
      let isSoldOut = false;
      if (/ebilet\.pl/.test(ticketLink)) {
        ticketLink += (ticketLink.includes('?') ? '&' : '?') + `date=${ctx.day}`;
        isSoldOut = await ebiletSoldOut(ctx, getOfferUrl(evl.offers)!, ctx.day);
      } else {
        const offerArr = Array.isArray(evl.offers) ? evl.offers : (evl.offers ? [evl.offers] : []);
        const avail = offerArr.map((o) => String(o.availability || '')).join(' ');
        isSoldOut = /(?:soldout|outofstock|discontinued)/i.test(avail);
      }

      out.push({
        source: ProviderId.EVENTYLIVE,
        externalId: `eventylive-${id}`,
        title: evl.name || '',
        startMs,
        lat: geo ? geo.lat : fbLat,
        lng: geo ? geo.lng : fbLng,
        city: locality,
        venue: venueName,
        address: street,
        link: ticketLink,
        mediaUrl: img || '',
        thumbUrl: img || null,
        isSoldOut,
        tags: normalizeTags({ source: ProviderId.EVENTYLIVE, title: evl.name }),
      });
    }
  return out;
}

export const eventyliveProvider: SeedProvider = {
  id: ProviderId.EVENTYLIVE,
  transport: 'fetch',
  fetchCandidates: fetchEventylive,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: EVL_CITIES,
  fetchScope: (ctx, scope) => fetchEventyliveCity(ctx, scope),
};
