// kupbilecik provider — 'fetch' transport (official partner API + affiliate links).
// Replaces the old Browser Run HTML-scraping module.
//
// Data source: the catalog endpoint returns the WHOLE future catalog (~60 MB JSON,
// 12k+ events) — one row per PERFORMANCE (unique Id = /imprezy/<Id>/). It carries
// everything the old scraped HTML lacked: direct price (TicketsInfo.Price, PLN),
// ready coordinates (Object.Location), postal/address, category (Category.Type),
// image variants (Images.Image/Mini) and an AFFILIATE link already stamped with
// utm_source=pp&utm_medium=631 (p = publisher id).
//
// The Worker CAN fetch it from the edge (probe: API + images 200), but a ~60 MB
// JSON.parse per day-scope is not viable on the Worker. An external job (VPS/mac,
// scripts/kup-warm.mjs) downloads the catalog once and pushes per-day TRIMMED
// manifests to R2 (seed/kupbilecik/<day>.json); this provider reads only its batch
// day and maps rows → SeedCandidates (same shape as ebilet: one post per
// event-day-venue, showtimes[] aggregation, price, tags, geo from Object.Location).
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { aggregateDayCandidates } from '../core/aggregate';

const KUP_CACHE_PREFIX = 'seed/kupbilecik/';

interface KupCategory { Type?: string; SubCategory?: { Type?: string } }
interface KupEvent {
  Id?: number | string;
  Name?: string;
  Date?: string; // "YYYY-MM-DD HH:MM:SS"
  City?: string;
  Category?: KupCategory;
  Images?: { Image?: string; Mini?: string };
  TicketsInfo?: { Price?: number | null };
  Object?: { Name?: string; Address?: string; Code?: string; Location?: { Lat?: string | number | null; Long?: string | number | null } };
  Link?: string;
}

/** Decode the HTML entities the API sometimes leaves in Name. */
export function decodeHtmlEntities(s: string): string {
  return (s || '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Category → canonical tag (reviewed with the user):
 *  safe: muzyka→muzyka, teatr→teatr (teatr_widowisko EXCLUDED → inne), standup+kabaret→
 *  komedia, film→filmy, sport→sport; decided ambiguous: impro→komedia, dzieci→inne,
 *  festiwal→inne, teatr_widowisko→inne; inne→inne (catch-all). Unknown → null. */
export function kupTagsFor(cat: KupCategory | null | undefined): string[] | null {
  const type = cat?.Type;
  const sub = cat?.SubCategory?.Type;
  if (type === 'muzyka') return ['muzyka'];
  if (type === 'standup' || type === 'kabaret' || type === 'impro') return ['komedia'];
  if (type === 'film') return ['filmy'];
  if (type === 'sport') return ['sport'];
  if (type === 'teatr') {
    if (sub === 'teatr_widowisko') return ['inne'];
    return ['teatr'];
  }
  if (type === 'dzieci' || type === 'festiwal' || type === 'inne') return ['inne'];
  return null;
}

export function parseFloatOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Build the candidate for ONE performance row (single time). Rows sharing the same
 *  event-day-venue collapse later via aggregateDayCandidates → showtimes[]. */
export function parseKupEvent(e: KupEvent, day: string, dayStartMs: number): SeedCandidate[] {
  const title = decodeHtmlEntities((e.Name || '').trim());
  const id = e.Id ?? '';
  const date = (e.Date || '').trim();
  if (!title || id === '' || date.slice(0, 10) !== day) return [];
  const time = date.slice(11, 16); // HH:MM
  if (!/^\d{2}:\d{2}$/.test(time)) return [];
  const h = Number(time.slice(0, 2));
  const mi = Number(time.slice(3, 5));
  const startMs = dayStartMs + (h * 60 + mi) * 60_000;

  const obj = e.Object || {};
  const lat = parseFloatOrNull(obj.Location?.Lat);
  const lng = parseFloatOrNull(obj.Location?.Long);
  const img = (e.Images?.Image || '').trim();
  const price = typeof e.TicketsInfo?.Price === 'number' ? e.TicketsInfo.Price : null;
  const tag = kupTagsFor(e.Category);
  const rowLink = (e.Link || '').trim();
  // Every performance is its OWN page (/imprezy/<Id>/), so the post must carry a
  // per-showtime link (kind 'link') — mirroring how cinema carries per-session
  // booking identities. Selecting this time in the app opens THIS performance.
  const showtimeBooking = [{ time, kind: 'link' as const, params: { url: rowLink } }];

  return [{
    source: ProviderId.KUPBILECIK,
    externalId: `kupbilecik-${id}-${day.replace(/-/g, '')}`,
    title,
    startMs,
    lat,
    lng,
    city: (e.City || '').trim(),
    venue: (obj.Name || '').trim(),
    address: (obj.Address || '').trim(),
    link: rowLink,
    mediaUrl: img,
    thumbUrl: (e.Images?.Mini || '').trim() || img || null,
    isSoldOut: false, // the API does not expose availability
    price,
    tags: tag ?? undefined,
    times: [time],
    showtimeBooking,
  }];
}

/** Candidates for one target day from the per-day R2 manifest. */
export async function fetchKupDay(ctx: SeedContext): Promise<SeedCandidate[]> {
  const key = `${KUP_CACHE_PREFIX}${ctx.day}.json`;
  const obj = await ctx.env.MEDIA.get(key);
  if (!obj) throw new Error(`kupbilecik manifest missing for ${ctx.day} — run scripts/kup-warm.mjs`);
  const rows = (await obj.json()) as KupEvent[];
  const out: SeedCandidate[] = [];
  for (const e of rows || []) out.push(...parseKupEvent(e, ctx.day, ctx.dayStart));
  return aggregateDayCandidates(out);
}

export const kupbilecikProvider: SeedProvider = {
  id: ProviderId.KUPBILECIK,
  transport: 'fetch',
  fetchCandidates: fetchKupDay,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: ['pl'],
  fetchScope: (ctx) => fetchKupDay(ctx),
};
