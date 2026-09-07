// TradeDoubler product feed for the goingapp program (fid 46830) — builds a
// (event-slug, rundate-slug) → verbatim TD click-URL map used to attach
// affiliate links to going candidates. Fetch + parse only and Workers-safe
// (no node builtins): api.tradedoubler.com rejects CF Workers egress, so the
// actual download runs on the VPS runner, which also owns the disk cache
// (runners/going.ts). The provider consumes the map via env.GOING_TD_MAP.
import { parseFeedJson } from './fetchOnce';

export const GOING_TD_FID = '46830';
const TD_UNLIMITED = 'https://api.tradedoubler.com/1.0/productsUnlimited.json';
const TD_LAST_UPDATED = 'https://api.tradedoubler.com/1.0/productsUnlimited/lastUpdated.json';

export interface GoingTdProduct {
  productUrl?: string;
  offers?: { productUrl?: string }[];
}

export function isGoingTdFeed(v: unknown): v is { products: GoingTdProduct[] } {
  return (
    !!v &&
    typeof v === 'object' &&
    Array.isArray((v as { products?: unknown }).products) &&
    (v as { products: unknown[] }).products.every((p) => !!p && typeof p === 'object')
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The goingapp landing URL embedded in a TD click URL (its url(...) param). */
export function extractGoingLanding(clickUrl: string): string | null {
  const m = /url\(([^)]*)\)/.exec(clickUrl);
  if (!m) return null;
  const raw = m[1];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Canonical map key — case- and trailing-slash-insensitive, like linkKey(). */
export function goingSlugKey(eventSlug: string, rundateSlug: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/^\/+|\/+$/g, '');
  return `${norm(eventSlug)}/${norm(rundateSlug)}`;
}

/** Parse a goingapp /wydarzenie/<event>/<rundate> landing into slugs + key. */
export function goingLandingParts(landing: string): { eventSlug: string; rundateSlug: string; key: string } | null {
  let u: URL;
  try {
    u = new URL(landing);
  } catch {
    return null;
  }
  const m = /^\/wydarzenie\/([^/]+)\/([^/]+)\/?$/.exec(u.pathname);
  if (!m) return null;
  const eventSlug = m[1];
  const rundateSlug = m[2];
  return { eventSlug, rundateSlug, key: goingSlugKey(eventSlug, rundateSlug) };
}

export interface GoingTdStats {
  products: number;
  matched: number;
  ambiguous: number;
}

/**
 * Map slug-pairs → verbatim click URL. Two TD products for the SAME slug pair
 * ("kopia" rundates the feed can carry) make the pair ambiguous → dropped, so
 * the map never misattributes a link.
 */
export function buildGoingTdMap(products: GoingTdProduct[]): { map: Record<string, string>; stats: GoingTdStats } {
  const map: Record<string, string> = {};
  const counts = new Map<string, number>();
  for (const p of products) {
    const click = p.offers?.[0]?.productUrl || p.productUrl;
    if (!click) continue;
    const landing = extractGoingLanding(click);
    if (!landing) continue;
    const parts = goingLandingParts(landing);
    if (!parts) continue;
    counts.set(parts.key, (counts.get(parts.key) || 0) + 1);
    map[parts.key] = click;
  }
  let ambiguous = 0;
  for (const [key, n] of counts) {
    if (n > 1) {
      delete map[key];
      ambiguous++;
    }
  }
  return { map, stats: { products: products.length, matched: Object.keys(map).length, ambiguous } };
}

/** Feed version per the Unlimited Last Updated service, or null on error. */
export async function goingTdVersion(token: string): Promise<string | null> {
  const url = `${TD_LAST_UPDATED};fid=${GOING_TD_FID}?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { lastUpdatedTime?: string };
    return typeof body.lastUpdatedTime === 'string' ? body.lastUpdatedTime : null;
  } catch (e) {
    console.warn(`going td lastUpdated failed (${(e as Error).message})`);
    return null;
  }
}

/** Download the gzipped unlimited export (202 → export still generating, retry bounded). */
export async function downloadGoingTdProducts(token: string): Promise<GoingTdProduct[]> {
  const url = `${TD_UNLIMITED};compress=gz;fid=${GOING_TD_FID}?token=${encodeURIComponent(token)}`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
      signal: AbortSignal.timeout(120_000),
    });
    if (res.status === 202) {
      await sleep(15_000);
      continue;
    }
    if (!res.ok) throw new Error(`going td feed -> ${res.status} at ${res.url}`);
    const text = await responseText(res);
    return parseFeedJson(text, 'going-td', isGoingTdFeed).products;
  }
  throw new Error('going td feed still generating (202 after 6 attempts)');
}

/** Body → string, gunzipping when the payload is gzip regardless of headers. */
async function responseText(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const gzipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return new TextDecoder().decode(bytes);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}