// kupbilecik provider — 'browser' transport. kupbilecik sits behind Cloudflare
// Bot Fight Mode which 403s plain Workers fetch() for HTML, but renders through
// Cloudflare Browser Run (headless Chrome from the same edge).
//
// Architecture: candidate extraction happens ENTIRELY from category listings
// (title, time, venue, city, poster, sold-out) — no per-event or per-venue
// browser calls. Cross-provider dedupe then drops kupbilecik events already
// covered by higher-priority sources (going/dzisapp/eventylive). Geo is resolved
// AFTER dedupe (only for surviving candidates) from the shared `venues` store,
// falling back to a single venue-page browser call that upserts into the store
// for future days.
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { browserContent } from './browser';
import { getBytes, getText } from './http';
import { KUP_BASE, KUP_LISTINGS, KUP_MAX_PAGES } from '../core/constants';
import { resolveVenueGeo, upsertVenue } from '../venues/venueStore';

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

// Try a plain Workers fetch first — sitemap.xml passes from the edge (200), so
// listing pages may too. Falls back to Browser Run when Bot Fight 403s the
// request (same strategy as kupbilecikFetchBytes).
async function kupGetText(ctx: SeedContext, url: string): Promise<string> {
  const t0 = Date.now();
  try {
    const html = await getText(url);
    console.log(`kupbilecik GET ${url.split('?')[0]} -> ${((Date.now() - t0) / 1000).toFixed(2)}s (fetch)`);
    return html;
  } catch (e) {
    console.log(`kupbilecik fetch ${url.split('?')[0]} blocked (${(e as Error).message}) -> browser fallback`);
  }
  const { html, browserMs } = await browserContent(ctx.env, url);
  ctx.recordBrowserMs(browserMs);
  console.log(`kupbilecik GET ${url.split('?')[0]} -> ${((Date.now() - t0) / 1000).toFixed(2)}s browserMs=${browserMs}`);
  return html;
}

export async function fetchKupbilecik(ctx: SeedContext): Promise<SeedCandidate[]> {
  const seen = new Set<string>();
  const out: SeedCandidate[] = [];
  for (const listing of KUP_LISTINGS) {
    out.push(...await fetchKupCategory(ctx, listing, seen));
  }
  return out;
}

// Parse one listing page into lightweight candidates (no event/venue browser).

async function fetchKupCategory(ctx: SeedContext, listing: string, seen: Set<string>): Promise<SeedCandidate[]> {
  const t0 = Date.now();
  const [y, m, d] = ctx.day.split('-').map(Number);
  const label = `${d} ${MONTHS[m - 1]} ${y}`;
  const list: SeedCandidate[] = [];

  let emptyStreak = 0;
  for (let qn = 1; qn <= KUP_MAX_PAGES; qn++) {
    const url = `${KUP_BASE}${listing}&qt=&qw=&qs=&qo=ASC&qn=${qn}`;
    let page: string;
    try { page = await kupGetText(ctx, url); } catch (e) { console.error(`kupbilecik listing ${url} failed: ${(e as Error).message}`); break; }
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
          const id = (href.match(/\/(?:imprezy|wydarzenia)\/(\d+)\//) || [])[1];
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const c = buildFromHtml(ctx, href, content, id, timeM && timeM[1], listing);
          if (c) list.push(c);
        } else {
          const sub = await expandFestival(ctx, href, seen, listing);
          list.push(...sub);
        }
      }
    }
    if (dayHits === 0) { emptyStreak++; if (emptyStreak >= 2) break; }
    else emptyStreak = 0;
  }
  console.log(`kupbilecik category ${listing} -> ${list.length} candidates in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  return list;
}

// Build a candidate from a listing/festival HTML fragment — zero browser calls.
async function expandFestival(ctx: SeedContext, href: string, seen: Set<string>, listing: string): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  try {
    const page = await kupGetText(ctx, href);
    const links = [...new Set([...page.matchAll(/href="(\/imprezy\/\d+[^"]*)"/g)].map((m) => m[1]))];
    for (const link of links) {
      const id = (link.match(/\/imprezy\/(\d+)\//) || [])[1];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      // Festival page: reuse listing extraction from the festival HTML block.
      const c = buildFromHtml(ctx, `${KUP_BASE}${link}`, page, id, null, listing);
      if (c) out.push(c);
    }
  } catch (e) {
    console.error(`kupbilecik festival ${href} failed: ${(e as Error).message}`);
  }
  return out;
}

// Resolve geo for a surviving kupbilecik candidate. Tries the shared venues store
// first; on miss fetches the kupbilecik venue page via browser and upserts into
// the store (so future days reuse it without a browser call).
export async function resolveKupGeo(
  ctx: SeedContext, venueName: string, venueId: string, day: string, city?: string | null
): Promise<{ lat: number | null; lng: number | null }> {
  const db = ctx.env.DB;
  if (venueName) {
    const hit = await resolveVenueGeo(db, venueName, city);
    if (hit) return { lat: hit.lat, lng: hit.lng };
  }
  if (!venueId) return { lat: null, lng: null };
  const t0 = Date.now();
  try {
    const url = `${KUP_BASE}/obiekty/${venueId}/`;
    let html: string;
    try { html = await getText(url); } catch {
      const { html: bh, browserMs } = await browserContent(ctx.env, url);
      ctx.recordBrowserMs(browserMs);
      html = bh;
    }
    const geoM = html.match(/"geo":\{"@type":"GeoCoordinates","latitude":"([^"]+)","longitude":"([^"]+)"\}/);
    if (geoM) {
      const lat = parseFloat(geoM[1]), lng = parseFloat(geoM[2]);
      // Upsert into the store so next day avoids the browser call.
      await upsertVenue(db, { name: venueName || `obiekt-${venueId}`, lat, lng, provider: ProviderId.KUPBILECIK, ref: venueId });
      console.log(`kupbilecik venue ${venueId} geo (${lat},${lng}) -> stored in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
      return { lat, lng };
    }
  } catch (e) {
    console.error(`kupbilecik venue ${venueId} failed: ${(e as Error).message}`);
  }
  return { lat: null, lng: null };
}

// Parse a kupbilecik event from raw HTML (listing block or festival page).
// Extracts everything from HTML — no extra browser calls.
// kupbilecik renders events OUTSIDE the covered cities with a parenthetical like
// "(poza miastem 5829 km)" in the venue/address. That text is informational junk
// for the user AND poisons geo resolution (fallbackSeedGeo can't place it) — so
// it is STRIPPED from the venue/city/address (the event itself is kept).
export function stripOutsideCityText(s: string): string {
  return (s || '')
    .replace(/\(\s*[^)]*(?:poza\s*miast|[0-9]{2,}\s*km)[^)]*\)/gi, '')
    .replace(/\s+,/g, ',') // "Festiwal , Warszawa" → "Festiwal, Warszawa"
    .replace(/,{2,}/g, ',')
    .replace(/[,\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildFromHtml(
  ctx: SeedContext, href: string, html: string, id: string, fallbackTime: string | null = null, listing = ''
): SeedCandidate | null {
  const titleM = html.match(/<h2 class="blackLine">[^<]*<a href="https:\/\/www\.kupbilecik\.pl\/imprezy\/\d+\/[^"]+"[^>]*>\s*<b>([^<]+)<\/b>/);
  const title = titleM ? decode(titleM[1]) : '';
  const timeM = html.match(/godz\.\s*(\d{2}:\d{2})/);
  const time = (timeM && timeM[1]) || fallbackTime;
  const startMs = time ? ctx.dayStart + (parseInt(time.slice(0, 2)) * 60 + parseInt(time.slice(3, 5))) * 60 * 1000 : ctx.dayStart;
  if (!time) return null;

  const cityM = html.match(/href="\/miasta\/\d+\/[^"]+"[^>]*>\s*<b>([^<]+)<\/b>/);
  const city = stripOutsideCityText(cityM ? decode(cityM[1]) : '');
  const venueM = html.match(/href="\/obiekty\/(\d+)\/[^"]+"[^>]*>\s*([^<]+?)<\/a>/);
  const venueName = stripOutsideCityText(venueM ? decode(venueM[2]) : '');
  const venueId = venueM ? venueM[1] : '';

  const posterM = html.match(/data-src="(https:\/\/www\.kupbilecik\.pl\/img\/(?:gal_plakaty|gal_baza)\/[^"'?\s]+)/);
  const thumb = posterM ? posterM[1] : '';
  if (!thumb) return null;
  // Full poster = thumb without `_m` suffix (kupbilecik convention).
  const poster = thumb.replace(/_m\.webp$/, '.webp');

  const isSoldOut = /class="sold-out">SOLD OUT<\/div>/.test(html);

  return {
    source: ProviderId.KUPBILECIK,
    externalId: `kupbilecik-${id}-${ctx.day}`,
    title,
    startMs,
    lat: null, lng: null, // geo resolved after dedupe
    city,
    venue: venueName,
    address: '',
    link: href,
    mediaUrl: poster,
    thumbUrl: thumb,
    isSoldOut,
    geoRef: venueId || null,
  };
}

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function kupbilecikFetchBytes(ctx: SeedContext, url: string): Promise<Uint8Array> {
  // Plain fetch first — Bot Fight Mode blocks HTML but static assets like
  // sitemap.xml passed; images may or may not. Cheap when it works.
  try {
    return await getBytes(url);
  } catch { /* fall through to browser */ }

  // Browser Run via puppeteer: a real browser requests the resource and we take
  // the raw response bytes. Slower + counts toward the 10h/month browser budget.
  // Dynamic import keeps @cloudflare/puppeteer's DOM-dependent types out of tsc.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const puppeteerModule = await import('@cloudflare/puppeteer');
  const puppeteer = (puppeteerModule.default ?? puppeteerModule) as typeof import('@cloudflare/puppeteer');
  const browser = await puppeteer.launch(ctx.env.BROWSER);
  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: 'networkidle2' });
    if (!response) throw new Error(`browser goto ${url} -> no response`);
    if (!response.ok()) throw new Error(`browser goto ${url} -> ${response.status()}`);
    const buf = await response.buffer();
    ctx.recordBrowserMs(1_000); // conservative: puppeteer has no X-Browser-Ms-Used on fetch
    return new Uint8Array(buf);
  } finally {
    await browser.close().catch(() => {});
  }
}

export const kupbilecikProvider: SeedProvider = {
  id: ProviderId.KUPBILECIK,
  transport: 'browser',
  fetchCandidates: fetchKupbilecik,
  fetchBytes: kupbilecikFetchBytes,
  scopes: ['all'],
  fetchScope: (ctx, _scope) => fetchKupbilecik(ctx),
};
