// Admin auth pages: login / logout.

import { Hono } from 'hono';
import { esc, page } from '../../ui';
import { tpl } from '../../ui/templates';
import { adminLogin, getClientIp } from '../../auth';
import { clearCookie, requireSession, setSessionCookie } from '../common';

const pageRoutes = new Hono<{ Bindings: Env }>();

pageRoutes.get('/login', async (c) => {
  const session = await requireSession(c);
  if (session) return c.redirect('/admin');
  return page('Logowanie', '', tpl('login', {}));
});

pageRoutes.post('/login', async (c) => {
  const parsed = (await c.req.parseBody<Record<string, string>>().catch(() => ({}))) as Record<string, string>;
  const password = String(parsed.password || '');
  const ip = getClientIp(c);
  const { cookie, reason } = await adminLogin(c.env, password, ip);
  if (cookie) return setSessionCookie(c.redirect('/admin'), cookie, 72 * 3600);
  const msg =
    reason === 'rate' ? 'Za dużo prób. Spróbuj za 15 min.' :
    reason === 'unconfigured' ? 'Hasło admina nie jest skonfigurowane (ADMIN_PASSWORD_HASH).' :
    'Nieprawidłowe hasło.';
  const body = `<div class="container-tight py-5"><div class="card"><div class="card-body p-4">
    <div class="alert alert-danger">${esc(msg)}</div>
    <a class="btn btn-outline-secondary" href="/admin/login">Wróć</a></div></div></div>`;
  return page('Logowanie', '', body);
});

pageRoutes.get('/logout', async (c) => {
  const res = c.redirect('/admin/login');
  const headers = new Headers(res.headers);
  headers.set('Set-Cookie', clearCookie());
  return new Response(res.body, { status: res.status, headers });
});

export function registerAuth(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
