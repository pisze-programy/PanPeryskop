import { Hono, type Context } from 'hono';
import {
  ORIGIN_PAGES, PUBLIC_BASE, originById, originBySlug, originData, originPage, renderJson,
} from '../travel/webpage';
import { coverageReport, docEntries, llmsTxt, originJsonKey, putOriginJson, readStoredPageMeta } from '../travel/content';
import { renderSite } from '../travel/sitePage';

export const planRoutes = new Hono<{ Bindings: Env }>();
export const contentRoutes = new Hono<{ Bindings: Env }>();

const STATIC_URLS = [
  'https://panperyskop.app/',
  'https://panperyskop.app/en',
  'https://panperyskop.app/privacy',
  'https://panperyskop.app/terms',
  'https://panperyskop.app/support',
];

async function sitemapXml(env: Env): Promise<{ body: string; etag: string }> {
  const entries = await docEntries(env, PUBLIC_BASE);
  const rows = [
    ...STATIC_URLS.map((url) => ({ url, lastmod: null as string | null })),
    ...entries.map((entry) => ({ url: entry.url, lastmod: entry.lastmod as string | null })),
  ];
  const body = rows
    .map((row) => `  <url>\n    <loc>${row.url}</loc>${row.lastmod ? `\n    <lastmod>${row.lastmod}</lastmod>` : ''}\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`)
    .join('\n');
  const latest = entries.reduce((max, entry) => (entry.lastmod > max ? entry.lastmod : max), '1970-01-01');
  const sum = entries.reduce((acc, entry) => (acc + entry.slug.length + entry.lastmod.length) % 1_000_000, 0);
  return { body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`, etag: `W/"sm-${entries.length}-${latest}-${sum}"` };
}

function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nAllow: /\n\nUser-agent: Bingbot\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nSitemap: ${PUBLIC_BASE}/sitemap.xml\n`;
}

// The landing, one template, one texts file. The Worker answers these paths
// itself, so an old copy in the Pages deployment can never win.
contentRoutes.get('/', (c) => c.html(renderSite('pl')));
contentRoutes.get('/pl', (c) => c.html(renderSite('pl')));
contentRoutes.get('/pl/*', (c) => c.html(renderSite('pl')));
contentRoutes.get('/en', (c) => c.html(renderSite('en')));
contentRoutes.get('/en/*', (c) => c.html(renderSite('en')));
contentRoutes.get('/index.html', (c) => c.redirect('/', 301));
contentRoutes.get('/index.en', (c) => c.redirect('/en', 301));
contentRoutes.get('/index.en.html', (c) => c.redirect('/en', 301));

contentRoutes.get('/sitemap.xml', async (c) => {
  const { body, etag } = await sitemapXml(c.env);
  if (c.req.header('If-None-Match') === etag) {
    c.header('ETag', etag);
    return c.body(null, 304);
  }
  c.header('ETag', etag);
  c.header('Content-Type', 'application/xml; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(body);
});

contentRoutes.get('/robots.txt', (c) => {
  c.header('Content-Type', 'text/plain; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(robotsTxt());
});

contentRoutes.get('/coverage.json', async (c) => {
  c.header('Cache-Control', 'no-cache');
  return c.json(await coverageReport(c.env));
});

// The file was removed. Pages still serves the old copy from an earlier
// deployment, so the Worker answers first and points readers at the live one.
contentRoutes.get('/llms-full.txt', (c) => c.redirect('/llms.txt', 301));

contentRoutes.get('/llms.txt', async (c) => {
  c.header('Content-Type', 'text/plain; charset=utf-8');
  c.header('Cache-Control', 'no-cache');
  return c.body(await llmsTxt(c.env));
});

async function serveStored(c: Context<{ Bindings: Env }>, slug: string): Promise<Response | null> {
  const meta = await readStoredPageMeta(c.env, slug);
  if (!meta) return null;
  const inm = c.req.header('If-None-Match');
  const ims = c.req.header('If-Modified-Since');
  const etagMatches = inm !== undefined && inm === meta.etag;
  const modifiedSince = ims !== undefined && new Date(ims).getTime() >= new Date(meta.lastModified).getTime();
  if (etagMatches || modifiedSince) {
    c.header('ETag', meta.etag);
    c.header('Last-Modified', meta.lastModified);
    return c.body(null, 304);
  }
  c.header('ETag', meta.etag);
  c.header('Last-Modified', meta.lastModified);
  c.header('Cache-Control', 'public, max-age=900');
  return c.body(meta.html, 200, { 'Content-Type': 'text/html; charset=utf-8' });
}

for (const origin of ORIGIN_PAGES) {
  contentRoutes.get(`/${origin.slug}`, async (c) => {
    const stored = await serveStored(c, origin.slug);
    if (stored) return stored;
    const html = await originPage(c.env, origin.id);
    if (!html) return c.notFound();
    c.header('Cache-Control', 'no-cache');
    return c.html(html);
  });
}

contentRoutes.get('/:originSlug/:suffix', async (c) => {
  const slug = `${c.req.param('originSlug')}/${c.req.param('suffix')}`;
  const stored = await serveStored(c, slug);
  if (!stored) return c.notFound();
  return stored;
});

contentRoutes.get("/:slug", async (c) => {
  const stored = await serveStored(c, c.req.param('slug'));
  if (!stored) return c.notFound();
  return stored;
});

planRoutes.get('/sitemap.xml', async (c) => {
  const { body, etag } = await sitemapXml(c.env);
  if (c.req.header('If-None-Match') === etag) {
    c.header('ETag', etag);
    return c.body(null, 304);
  }
  c.header('ETag', etag);
  c.header('Content-Type', 'application/xml; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(body);
});

planRoutes.get('/coverage.json', async (c) => {
  c.header('Cache-Control', 'no-cache');
  return c.json(await coverageReport(c.env));
});

planRoutes.get('/json/:originId', async (c) => {
  const originId = c.req.param('originId');
  const stored = await c.env.MEDIA.get(originJsonKey(originId)).catch(() => null);
  if (stored) {
    c.header('Cache-Control', 'public, max-age=900');
    c.header('Content-Type', 'application/json; charset=utf-8');
    return c.body(await stored.text());
  }
  const data = await originData(c.env, originId);
  if (!data) return c.notFound();
  const json = renderJson(data);
  await putOriginJson(c.env, originId, json);
  c.header('Cache-Control', 'public, max-age=900');
  return c.json(JSON.parse(json));
});

planRoutes.get('/', (c) => c.redirect('/tanie-loty', 301));

planRoutes.get('/:originId', (c) => {
  const origin = originById(c.req.param('originId')) ?? originBySlug(c.req.param('originId'));
  if (!origin) return c.notFound();
  return c.redirect(`/${origin.slug}`, 301);
});
