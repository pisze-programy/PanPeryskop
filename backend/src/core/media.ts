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

/** Resolve a post's public media/thumb URLs. Hotlink providers store the source
 *  CDN URL in external_media_url; UGC (and any R2 post) falls back to the R2 key.
 *  Thumb falls back to the full media URL so a hotlink post without a thumbnail
 *  still renders. */
export function resolvePostMedia(
  origin: string,
  row: {
    external_media_url?: string | null;
    external_thumb_url?: string | null;
    media_key: string | null;
    thumb_key: string | null;
  },
): { media_url: string | null; thumb_url: string | null } {
  const keyMedia = mediaUrl(origin, row.media_key);
  const media = row.external_media_url || keyMedia;
  const thumb = row.external_thumb_url || mediaUrl(origin, row.thumb_key) || media;
  return { media_url: media, thumb_url: thumb };
}
