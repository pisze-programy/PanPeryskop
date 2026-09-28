import { Hono } from 'hono';
import {
  ORIGIN_PAGES, PUBLIC_BASE, originData, originPage, renderJson,
} from '../travel/webpage';
import { coverageReport, docUrls, llmsTxt, readStoredPage } from '../travel/content';

export const planRoutes = new Hono<{ Bindings: Env }>();
export const contentRoutes = new Hono<{ Bindings: Env }>();

const API_BASE = 'https://api.panperyskop.app';

const STATIC_URLS = [
  'https://panperyskop.app/',
  'https://panperyskop.app/index.en.html',
  'https://panperyskop.app/privacy',
  'https://panperyskop.app/terms',
  'https://panperyskop.app/support',
];

async function sitemapXml(env: Env): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [...STATIC_URLS, ...(await docUrls(env, PUBLIC_BASE))];
  const body = urls
    .map((url) => `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

contentRoutes.get('/sitemap.xml', async (c) => {
  c.header('Content-Type', 'application/xml; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(await sitemapXml(c.env));
});

contentRoutes.get('/robots.txt', (c) => {
  c.header('Content-Type', 'text/plain; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(`User-agent: *\nAllow: /\n\nSitemap: ${PUBLIC_BASE}/sitemap.xml\n`);
});

contentRoutes.get('/coverage.json', async (c) => {
  c.header('Cache-Control', 'no-cache');
  return c.json(await coverageReport(c.env));
});

contentRoutes.get('/llms.txt', async (c) => {
  c.header('Content-Type', 'text/plain; charset=utf-8');
  c.header('Cache-Control', 'no-cache');
  return c.body(await llmsTxt(c.env));
});

for (const origin of ORIGIN_PAGES) {
  contentRoutes.get(`/${origin.slug}`, async (c) => {
    const stored = await readStoredPage(c.env, origin.slug);
    if (stored) {
      c.header('Cache-Control', 'public, max-age=900');
      return c.html(stored);
    }
    const html = await originPage(c.env, origin.id);
    if (!html) return c.notFound();
    c.header('Cache-Control', 'no-cache');
    return c.html(html);
  });
}

contentRoutes.get('/:originSlug/:suffix', async (c) => {
  const slug = `${c.req.param('originSlug')}/${c.req.param('suffix')}`;
  const stored = await readStoredPage(c.env, slug);
  if (!stored) return c.notFound();
  c.header('Cache-Control', 'public, max-age=900');
  return c.html(stored);
});

contentRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const stored = await readStoredPage(c.env, slug);
  if (!stored) return c.notFound();
  c.header('Cache-Control', 'public, max-age=900');
  return c.html(stored);
});

planRoutes.get('/sitemap.xml', async (c) => {
  c.header('Content-Type', 'application/xml; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(await sitemapXml(c.env));
});

planRoutes.get('/coverage.json', async (c) => {
  c.header('Cache-Control', 'no-cache');
  return c.json(await coverageReport(c.env));
});

planRoutes.get('/json/:originId', async (c) => {
  const data = await originData(c.env, c.req.param('originId'));
  if (!data) return c.notFound();
  c.header('Cache-Control', 'no-cache');
  return c.json(JSON.parse(renderJson(data)));
});

planRoutes.get('/:originId', async (c) => {
  const data = await originData(c.env, c.req.param('originId'));
  if (!data) return c.notFound();
  return c.redirect(`/${data.origin.slug}`, 301);
});
