import { Hono } from 'hono';

export const mediaRoutes = new Hono<{ Bindings: Env }>();

mediaRoutes.get('/*', async (c) => {
  const key = c.req.param('*');
  if (!key) return c.notFound();

  const object = await c.env.MEDIA.get(key);

  if (!object) {
    return c.notFound();
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=3600');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(object.body, {
    headers,
  });
});
