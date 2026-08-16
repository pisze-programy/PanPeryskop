// kupbilecik provider — 'browser' transport. kupbilecik sits behind Cloudflare
// Bot Fight Mode which 403s plain Workers fetch() (HTML and raw sockets), but
// renders fine through Cloudflare Browser Run (headless Chrome from the same
// edge). Listings, event pages and venue pages all go through Browser Run;
// media (posters/thumbs) try plain fetch first and fall back to Browser Run
// via puppeteer (real browser request, returns raw bytes).
import { SeedProvider, SeedContext, SeedCandidate } from './types';
import { browserContent } from './browser';
import { getBytes, getText } from './http';
import { KUP_BASE, KUP_LISTINGS, KUP_MAX_PAGES } from './constants';

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

// Try a plain Workers fetch first — sitemap.xml passes from the edge (200), so
// event/venue pages may too. Falls back to Browser Run when Bot Fight 403s the
// request (same strategy as kupbilecikFetchBytes). Keeps behavior identical when
// the edge blocks HTML; skips Browser Run entirely when it doesn't.
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

// Fetch one kupbilecik category listing (a queue fetch scope). The `seen` set is
// shared across all categories so the same event isn't re-fetched via Browser Run
// when it appears in more than one listing. Sequential within the category.
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
          const cand = await buildKupEvent(ctx, href, seen, ctx.day, timeM && timeM[1]);
          if (cand) list.push(cand);
        } else {
          const sub = await expandFestival(ctx, href, seen);
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

async function expandFestival(ctx: SeedContext, href: string, seen: Set<string>): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  try {
    const page = await kupGetText(ctx, href);
    const links = [...new Set([...page.matchAll(/href="(\/imprezy\/\d+[^"]*)"/g)].map((m) => m[1]))];
    for (const link of links) {
      const cand = await buildKupEvent(ctx, `${KUP_BASE}${link}`, seen, ctx.day, null);
      if (cand) out.push(cand);
    }
  } catch (e) {
    console.error(`kupbilecik festival ${href} failed: ${(e as Error).message}`);
  }
  return out;
}

async function buildKupEvent(
  ctx: SeedContext, href: string, seen: Set<string>, day: string, fallbackTime: string | null
): Promise<SeedCandidate | null> {
  const t0 = Date.now();
  const id = (href.match(/\/(?:imprezy|wydarzenia)\/(\d+)\//) || [])[1];
  if (!id || seen.has(id)) return null;
  seen.add(id);
  let eventPage: string;
  try { eventPage = await kupGetText(ctx, href); } catch (e) { console.error(`kupbilecik event ${href} failed: ${(e as Error).message}`); return null; }

  let ev: any = null;
  for (const m of eventPage.matchAll(/<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/gs)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = data['@graph'] || [data];
      ev = nodes.find((n: any) => /Event/.test(String(n['@type']))) || null;
      if (ev) break;
    } catch (e) {
      console.error(`kupbilecik event ld+json parse failed: ${(e as Error).message}`);
    }
  }

  let startMs = ev?.startDate ? new Date(ev.startDate).getTime() : null;
  if (!startMs && fallbackTime) {
    const [hh, mm] = fallbackTime.split(':').map(Number);
    startMs = ctx.dayStart + (hh * 60 + mm) * 60 * 1000;
  }
  if (!startMs || startMs < ctx.dayStart || startMs > ctx.dayEnd) return null;

  const venueName = ev?.location?.name || '';
  const addr = ev?.location?.address || {};
  const address = [addr.streetAddress, addr.postalCode].filter(Boolean).join(', ');
  const city = addr.addressLocality || '';

  let lat: number | null = null, lng: number | null = null;
  const venueM = eventPage.match(/href="(\/obiekty\/[^"?]+)/);
  if (venueM) {
    try {
      const venueHtml = await kupGetText(ctx, `${KUP_BASE}${venueM[1]}`);
      const geoM = venueHtml.match(/"geo":\{"@type":"GeoCoordinates","latitude":"([^"]+)","longitude":"([^"]+)"\}/);
      if (geoM) { lat = parseFloat(geoM[1]); lng = parseFloat(geoM[2]); }
    } catch (e) {
      console.error(`kupbilecik venue ${venueM[1]} failed: ${(e as Error).message}`);
    }
  }

  const posters = [...new Set(eventPage.matchAll(/(https:\/\/www\.kupbilecik\.pl\/img\/(?:gal_plakaty|gal_baza)\/[^"'\s?]+)/g).map((m) => m[1]))];
  const poster = posters.filter((p) => !/_(?:m|fb|tlo)\.webp$/.test(p))[0] || posters[0];
  if (!poster) return null;

  // KupBilecik serves a ready-made thumbnail: same base with `_m.webp` suffix.
  const thumb = posters.find((p) => /_m\.webp$/.test(p)) || poster.replace(/\.webp$/, '_m.webp');

  // Sold out detection: the event page marks an exhausted performance with a
  // disabled "Brak biletów" button and a "Brak aktualnie wolnych miejsc w
  // sprzedaży" note. The `sold-out` badge only appears on category listings, and
  // JSON-LD offers.availability stays InStock even when sold out, so we key off
  // the real HTML markers (NOT `btn-brak`, which also appears in every page's CSS).
  const isSoldOut = /Brak aktualnie wolnych miejsc|>Brak biletów</.test(eventPage);

  console.log(`kupbilecik event id=${id} -> ${((Date.now() - t0) / 1000).toFixed(2)}s (${lat ? 'geo' : 'no-geo'})`);
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
    isSoldOut,
  };
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
  const puppeteerModule: any = await import('@cloudflare/puppeteer');
  const puppeteer = puppeteerModule.default ?? puppeteerModule;
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
  id: 'kupbilecik',
  transport: 'browser',
  enabled: true,
  fetchCandidates: fetchKupbilecik,
  fetchBytes: kupbilecikFetchBytes,
  // One scope: Browser Run calls don't scale in parallel (each is ~seconds, and
  // concurrent quickAction is throttled). A single sequential pass with a shared
  // `seen` set avoids duplicate browser fetches — faster than parallel categories.
  scopes: ['all'],
  fetchScope: (ctx, _scope) => fetchKupbilecik(ctx),
};
