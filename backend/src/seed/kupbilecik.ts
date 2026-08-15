// kupbilecik provider — 'browser' transport. kupbilecik sits behind Cloudflare
// Bot Fight Mode which 403s plain Workers fetch() (HTML and raw sockets), but
// renders fine through Cloudflare Browser Run (headless Chrome from the same
// edge). Listings, event pages and venue pages all go through Browser Run;
// media (posters/thumbs) try plain fetch first and fall back to Browser Run
// via puppeteer (real browser request, returns raw bytes).
import { SeedProvider, SeedContext, SeedCandidate } from './types';
import { browserContent } from './browser';
import { getBytes } from './http';

const KUP_LISTINGS = ['/koncerty/?q=', '/kabarety/?q=', '/standup/?q=', '/festiwal/?q='];
const KUP_MAX_PAGES = 6;
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

async function kupGetText(ctx: SeedContext, url: string): Promise<string> {
  const { html, browserMs } = await browserContent(ctx.env, url);
  ctx.recordBrowserMs(browserMs);
  return html;
}

async function fetchKupbilecik(ctx: SeedContext): Promise<SeedCandidate[]> {
  const [y, m, d] = ctx.day.split('-').map(Number);
  const label = `${d} ${MONTHS[m - 1]} ${y}`;
  const seen = new Set<string>();
  const list: SeedCandidate[] = [];

  for (const listing of KUP_LISTINGS) {
    let emptyStreak = 0;
    for (let qn = 1; qn <= KUP_MAX_PAGES; qn++) {
      const url = `https://www.kupbilecik.pl${listing}&qt=&qw=&qs=&qo=ASC&qn=${qn}`;
      let page: string;
      try { page = await kupGetText(ctx, url); } catch { break; }
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
  }
  return list;
}

async function expandFestival(ctx: SeedContext, href: string, seen: Set<string>): Promise<SeedCandidate[]> {
  const out: SeedCandidate[] = [];
  try {
    const page = await kupGetText(ctx, href);
    const links = [...new Set([...page.matchAll(/href="(\/imprezy\/\d+[^"]*)"/g)].map((m) => m[1]))];
    for (const link of links) {
      const cand = await buildKupEvent(ctx, `https://www.kupbilecik.pl${link}`, seen, ctx.day, null);
      if (cand) out.push(cand);
    }
  } catch { /* ignore */ }
  return out;
}

async function buildKupEvent(
  ctx: SeedContext, href: string, seen: Set<string>, day: string, fallbackTime: string | null
): Promise<SeedCandidate | null> {
  const id = (href.match(/\/(?:imprezy|wydarzenia)\/(\d+)\//) || [])[1];
  if (!id || seen.has(id)) return null;
  seen.add(id);
  let eventPage: string;
  try { eventPage = await kupGetText(ctx, href); } catch { return null; }

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
      const venueHtml = await kupGetText(ctx, `https://www.kupbilecik.pl${venueM[1]}`);
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
};
