import { Hono } from 'hono';
import { originPage } from '../travel/webpage';

export const planRoutes = new Hono<{ Bindings: Env }>();

planRoutes.get('/:originId', async (c) => {
  const html = await originPage(c.env, c.req.param('originId'));
  if (!html) return c.notFound();
  c.header('Cache-Control', 'public, max-age=1800');
  return c.html(html);
});
