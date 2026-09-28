import { Hono } from 'hono';
import { originData, originPage, renderJson, sitemapUrls } from '../travel/webpage';

export const planRoutes = new Hono<{ Bindings: Env }>();

const BASE = 'https://api.panperyskop.app';

planRoutes.get('/sitemap.xml', (c) => {
  const urls = sitemapUrls(BASE).map((url) => `  <url><loc>${url}</loc></url>`).join('\n');
  c.header('Content-Type', 'application/xml; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});

planRoutes.get('/json/:originId', async (c) => {
  const data = await originData(c.env, c.req.param('originId'));
  if (!data) return c.notFound();
  c.header('Cache-Control', 'no-cache');
  return c.json(JSON.parse(renderJson(data)));
});

planRoutes.get('/:originId', async (c) => {
  const html = await originPage(c.env, c.req.param('originId'));
  if (!html) return c.notFound();
  c.header('Cache-Control', 'no-cache');
  return c.html(html);
});
