// Media URL builder. Derives the origin from the incoming request so the same
// code works for any deployed environment (dev preview subdomain, production
// custom domain) instead of a hardcoded workers.dev URL. All callers pass the
// Hono Context (c) or a request URL string.

export function mediaUrl(origin: string, key: string | null): string | null {
  if (!key) return null;
  return `${origin.replace(/\/+$/, '')}/media/${key}`;
}

export function originFromRequest(c: { req: { url: string } }): string {
  const u = new URL(c.req.url);
  return `${u.protocol}//${u.host}`;
}
