// Shared helpers for the admin dashboard (JSON API + SSR pages): session cookie
// handling, cookie-based auth, and the JSON response wrapper.
import { readSession, COOKIE_NAME } from '../auth';

export function setSessionCookie(res: Response, value: string, maxAgeSec: number): Response {
  const headers = new Headers(res.headers);
  headers.set('Set-Cookie', `${COOKIE_NAME}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Secure; Max-Age=${maxAgeSec}`);
  return new Response(res.body, { status: res.status, headers });
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/admin; HttpOnly; SameSite=Strict; Secure; Max-Age=0`;
}

export async function requireSession(c: { env: Env; req: { header: (n: string) => string | undefined } }) {
  const cookie = c.req.header('Cookie');
  const m = cookie?.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  return readSession(c.env, m?.[1]);
}

// Wrap a JSON API handler with cookie-auth + error → 500.
export async function api(c: any, handler: (env: Env) => Promise<unknown>) {
  const session = await requireSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await handler(c.env));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
}

export function fmtPctNum(usedMs: number, limitMs: number): number {
  return limitMs > 0 ? Math.round((usedMs / limitMs) * 100) : 0;
}
