import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { anonymousClientId, sendGa4Events } from './ga4';

// Shortlink redirects. A booking/place link is minted server-side as `/r/:token`
// so the click is measured on resolution — the app only opens a normal link.
// The client never supplies the URL, so there is no open redirect.

export const redirectRoutes = new Hono<{ Bindings: Env }>();

const TOKEN_TTL_MS = 90 * 24 * 3_600_000;

// Hosts a target may point at. Validated once, at mint time.
const ALLOWED_HOSTS = [
  'ryanair.com',
  'wizzair.com',
  'flixbus.com',
  'flixbus.pl',
  'viator.com',
  'stay22.com',
  'kupbilecik.pl',
  'eventim.pl',
  'ebilet.pl',
  'goingapp.pl',
  'maratonypolskie.pl',
  'ticketmaster.pl',
  'ra.co',
];

export type RedirectKind = 'flight' | 'bus' | 'place' | 'event' | 'stay';

function isAllowed(target: string): boolean {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.host.toLowerCase();
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Mint a shortlink for a server-built target. Returns the plain URL when the
 *  target is not allowed (never wraps an untrusted host). */
export async function mintRedirect(env: Env, kind: RedirectKind, target: string): Promise<string> {
  if (!isAllowed(target)) return target;
  const token = nanoid(10);
  const now = Date.now();
  await env.DB
    .prepare(
      `INSERT INTO redirect_tokens (token, kind, target_url, target_host, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(token, kind, target, new URL(target).host, now, now + TOKEN_TTL_MS)
    .run()
    .catch(() => { /* a failed mint only loses the count, not the link */ });
  return `${redirectBase(env)}/r/${token}`;
}

function redirectBase(env: Env): string {
  return env.REDIRECT_BASE ?? 'https://api.panperyskop.app';
}

redirectRoutes.get('/r/:token', async (c) => {
  const token = c.req.param('token');
  const row = await c.env.DB
    .prepare('SELECT target_url, kind, target_host, expires_at, active FROM redirect_tokens WHERE token = ?')
    .bind(token)
    .first<{ target_url: string; kind: string; target_host: string; expires_at: number; active: number }>();
  if (!row || row.active !== 1 || row.expires_at < Date.now()) return c.notFound();

  c.executionCtx.waitUntil(recordClick(c.env, token, row.kind, row.target_host));
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Robots-Tag', 'noindex');
  return c.redirect(row.target_url, 302);
});

async function recordClick(env: Env, token: string, kind: string, host: string): Promise<void> {
  const now = Date.now();
  await env.DB
    .prepare('UPDATE redirect_tokens SET hits = hits + 1, last_hit_ms = ? WHERE token = ?')
    .bind(now, token)
    .run()
    .catch(() => { /* click accounting is best-effort */ });
  await env.DB
    .prepare('INSERT INTO click_events (id, token, kind, target_host, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(nanoid(24), token, kind, host, now)
    .run()
    .catch(() => {});
  const clientId = await anonymousClientId(env);
  await sendGa4Events(env, [{ name: 'link_click', params: { kind, host } }], clientId);
}
