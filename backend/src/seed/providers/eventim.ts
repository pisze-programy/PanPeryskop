// eventim provider — 'fetch' transport (Awin affiliate datafeed, advertiser 19044 /
// feed 99885). Eventim PL events come from the Awin product feed (slim 14 columns),
// warmed to R2 (seed/awin-eventim.json) by the VPS awin-warm job; this provider reads
// only its batch day. One feed row = ONE performance (event_date + custom_1 start
// time); the same event-day-venue at different times collapses into ONE post with
// showtimes[] via aggregateDayCandidates (identical to ebilet/kupbilecik).
//
// Affiliate: merchant_deep_link is the direct eventim ticket page (already stamped
// with affiliate=AWN); aw_deep_link is the awin1.com click tracker encoding our
// publisher id. The queue ingest swaps to aw_deep_link via resolveLink (like ebilet).
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { aggregateDayCandidates } from '../core/aggregate';
import { parseFeedJson } from '../core/fetchOnce';
import { resolveGeo } from '../core/geo';

const FEED_KEY = 'seed/awin-eventim.json';

/** Slim Awin feed row — exactly the 14 columns the warm downloads. */
interface AwinRow {
  aw_product_id?: string;
  aw_deep_link?: string;
  aw_image_url?: string;
  merchant_deep_link?: string;
  'Tickets:event_name'?: string;
  'Tickets:event_date'?: string;
  'Tickets:venue_name'?: string;
  'Tickets:venue_address'?: string;
  'Tickets:latitude'?: string;
  'Tickets:longitude'?: string;
  'Tickets:genre'?: string;
  'Tickets:min_price'?: string;
  'Tickets:max_price'?: string;
  /** Eventim internal category code ("1A".."5D") — see EVENTIM_CATEGORY_TAGS. */
  merchant_category?: string;
  custom_1?: string;
}

/** City out of a venue address ("ul. Działowa 25, 61-747 POZNAŃ, PL" → "POZNAŃ"). */
export function eventimCity(address: string): string {
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  let last = parts[parts.length - 1] || '';
  if (/^(PL|Poland|Polska)$/i.test(last)) last = parts[parts.length - 2] || '';
  return last.replace(/^\d{2}-\d{3}\s*/, '').trim();
}

/** Map the Eventim genre string onto the canonical tag set; unknown → null. */
export function eventimTags(genre: string | null): string | null {
  const g = (genre || '').trim().toLowerCase();
  if (!g) return null;
  if (/(kabaret|stand-?up|komedia)/.test(g)) return 'komedia';
  if (/(koncert|muzyka|festiwal|opera|filharmoni|klasyka)/.test(g)) return 'muzyka';
  if (/(sport|mecz|bieg|maraton|siatkówka|piłka)/.test(g)) return 'sport';
  if (/(teatr|spektakl)/.test(g)) return 'teatr';
  if (/(dzieci|rodzin)/.test(g)) return 'inne';
  return null;
}

/**
 * Eventim category code → canonical tag. The feed's `merchant_category` column
 * carries Eventim's internal category codes (tree: 1*=Koncerty, 2*=Kultura,
 * 3*=Sport, 4*=Rozrywka, 5*=Vouchery) — decoded from the live feed titles
 * (verified 2026-09-08, see _internal/awin-datafeed-options.md).
 */
export const EVENTIM_CATEGORY_TAGS: Record<string, string> = {
  // Koncerty
  '1A': 'muzyka', '1B': 'muzyka', '1C': 'muzyka', '1D': 'muzyka', '1E': 'muzyka',
  '1F': 'muzyka', '1G': 'muzyka', '1I': 'muzyka', '1J': 'muzyka', '1L': 'muzyka',
  // Kultura
  '2A': 'muzyka', '2B': 'teatr', '2E': 'inne', '2H': 'inne',
  // Sport
  '3C': 'sport', '3D': 'sport', '3F': 'sport', '3G': 'sport', '3I': 'sport',
  // Rozrywka
  '4A': 'inne', '4B': 'komedia', '4D': 'inne', '4F': 'inne',
};

/** Category code → canonical tag; unknown code → null (fall back to genre/title). */
export function eventimCategoryTag(code: string | null): string | null {
  const c = (code || '').trim().toUpperCase();
  return EVENTIM_CATEGORY_TAGS[c] ?? null;
}

/** Vouchers / merch ("5*" codes) are NOT events — the row must be skipped. */
export function isEventimVoucher(code: string | null): boolean {
  return /^5[A-Z]$/.test((code || '').trim().toUpperCase());
}

/** Title-based fallback when the feed carries no usable category/genre. */
export function eventimTitleTag(title: string): string | null {
  const t = (title || '').trim().toLowerCase();
  if (!t) return null;
  if (/(kabaret|stand-?up)/.test(t)) return 'komedia';
  if (/(koncert|muzyka|opera|filharmoni|klasyka|jazz|festiwal)/.test(t)) return 'muzyka';
  if (/(sport|mecz|liga|siatkówka|piłka|koszykówka)/.test(t)) return 'sport';
  if (/(dzieci|rodzin|bajka)/.test(t)) return 'inne';
  if (/(spektakl|teatr)/.test(t)) return 'teatr';
  return null;
}

/** Build the candidate for ONE performance row (a single date+time). Rows of the
 *  same event-day-venue collapse via aggregateDayCandidates → showtimes[]. */
export function parseEventimRow(row: AwinRow, day: string, dayStartMs: number): SeedCandidate[] {
  const title = (row['Tickets:event_name'] || '').trim();
  const id = (row.aw_product_id || '').trim();
  const date = (row['Tickets:event_date'] || '').trim();
  if (!title || !id || date !== day) return [];
  const time = (row.custom_1 || '').trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return [];
  const h = Number(time.slice(0, 2));
  const mi = Number(time.slice(3, 5));
  const startMs = dayStartMs + (h * 60 + mi) * 60_000;

  const lat = Number(row['Tickets:latitude']);
  const lng = Number(row['Tickets:longitude']);
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
  const address = (row['Tickets:venue_address'] || '').trim();
  const venue = (row['Tickets:venue_name'] || '').trim();
  const min = Number(row['Tickets:min_price']);
  const price = Number.isFinite(min) && min > 0 ? min : null;
  const img = (row.aw_image_url || '').trim();
  const link = (row.merchant_deep_link || '').trim() || `https://www.eventim.pl/event/${id}`;
  const aff = (row.aw_deep_link || '').trim() || undefined;
  const code = (row.merchant_category || '').trim();
  if (isEventimVoucher(code)) return []; // vouchers / merch are not events
  const tag = eventimCategoryTag(code) ?? eventimTags(row['Tickets:genre'] ?? null) ?? eventimTitleTag(title);

  return [{
    source: ProviderId.EVENTIM,
    externalId: `eventim-${id}`,
    title,
    startMs,
    lat: hasGeo ? lat : null,
    lng: hasGeo ? lng : null,
    city: eventimCity(address),
    venue,
    address,
    link,
    affiliateLink: aff,
    mediaUrl: img,
    thumbUrl: img || null,
    isSoldOut: false, // the feed does not expose availability
    price,
    tags: tag ? [tag] : undefined,
    times: [time],
    showtimeBooking: [{ time, kind: 'link' as const, params: { url: link } }],
  }];
}

/** Candidates for one target day from the warmed R2 feed. The feed body is
 *  validated (parseFeedJson) — a missing/corrupt copy throws, never seeds garbage. */
export async function fetchEventimDay(ctx: SeedContext): Promise<SeedCandidate[]> {
  const obj = await ctx.env.MEDIA.get(FEED_KEY);
  if (!obj) throw new Error('eventim feed missing — run the awin warm (POST /admin/seed/awin/feed)');
  const rows = parseFeedJson(await obj.text(), 'awin-eventim', (v): v is AwinRow[] => Array.isArray(v));
  const out: SeedCandidate[] = [];
  for (const r of rows || []) out.push(...parseEventimRow(r, ctx.day, ctx.dayStart));
  return aggregateDayCandidates(out);
}

/** Deferred geo (ingest-time, survivors only): shared venues store → Nominatim.
 *  The feed carries coordinates for most rows; 0.0/missing ones fall through here.
 *  Returns null when nothing resolves — the caller falls back to the default pin. */
export async function resolveEventimGeo(ctx: SeedContext, cand: SeedCandidate): Promise<{ lat: number; lng: number } | null> {
  if (!cand.venue && !cand.address) return null;
  const geo = await resolveGeo({
    name: cand.venue,
    address: cand.address,
    city: cand.city || undefined,
    db: ctx.env.DB,
    provider: ProviderId.EVENTIM,
  });
  return geo ? { lat: geo.lat, lng: geo.lng } : null;
}

export const eventimProvider: SeedProvider = {
  id: ProviderId.EVENTIM,
  transport: 'fetch',
  fetchCandidates: fetchEventimDay,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: ['pl'],
  fetchScope: (ctx) => fetchEventimDay(ctx),
  resolveLink: (_ctx, cand) => Promise.resolve(cand.affiliateLink || cand.link),
};