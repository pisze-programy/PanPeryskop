// Admin dashboard auth: password login (PBKDF2-SHA256 via WebCrypto) → HMAC-signed
// HttpOnly cookie, TTL 4h, per-IP rate limiting (D1 admin_login_attempts).
// Secrets come ONLY from wrangler secrets (ADMIN_PASSWORD_HASH, ADMIN_COOKIE_SECRET)
// and the legacy bearer ADMIN_SECRET for CLI/seed. No hardcoded defaults.
import { nanoid } from 'nanoid';

export const COOKIE_NAME = 'pp_admin';
export const SESSION_TTL_MS = 4 * 3_600_000;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_MS = 15 * 60_000;

// PBKDF2-SHA256 hash verification for ADMIN_PASSWORD_HASH = "salt:iterations:hex".
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const [salt, itersStr, expectedHex] = parts;
  const iterations = parseInt(itersStr, 10);
  if (!salt || !Number.isFinite(iterations) || iterations < 10_000) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations, hash: 'SHA-256' },
    key,
    256
  );
  const hex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === expectedHex.toLowerCase();
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// Create a signed session token: payload.signature (url-safe base64).
async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${payload}.${b64}`;
}

async function verifySigned(signed: string, secret: string): Promise<string | null> {
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = signed.slice(0, dot);
  const sigB64 = signed.slice(dot + 1);
  const key = await hmacKey(secret);
  const sig = new Uint8Array(
    atob(sigB64.replace(/-/g, '+').replace(/_/g, '/'))
      .split('')
      .map((c) => c.charCodeAt(0))
  );
  const ok = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(payload));
  return ok ? payload : null;
}

export function getClientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

export async function isRateLimited(env: Env, ip: string): Promise<boolean> {
  const windowStart = Date.now() - RATE_LIMIT_MS;
  const row = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM admin_login_attempts WHERE ip = ? AND attempted_at >= ?')
    .bind(ip, windowStart)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= MAX_ATTEMPTS;
}

async function recordAttempt(env: Env, ip: string, success: boolean): Promise<void> {
  await env.DB
    .prepare('INSERT INTO admin_login_attempts (ip, attempted_at, success) VALUES (?, ?, ?)')
    .bind(ip, Date.now(), success ? 1 : 0)
    .run();
}

export interface AdminSession {
  sub: string;      // admin id (constant 'admin')
  exp: number;      // expiry ms
  iat: number;
}

// Issue a 4h session cookie value.
export async function createSession(env: Env): Promise<string> {
  const now = Date.now();
  const payload = JSON.stringify({ sub: 'admin', iat: now, exp: now + SESSION_TTL_MS });
  return signPayload(payload, env.ADMIN_COOKIE_SECRET!);
}

// Validate cookie; returns session or null (expired/invalid/missing secret).
export async function readSession(env: Env, cookie: string | undefined): Promise<AdminSession | null> {
  if (!cookie || !env.ADMIN_COOKIE_SECRET) return null;
  const payload = await verifySigned(cookie, env.ADMIN_COOKIE_SECRET!);
  if (!payload) return null;
  try {
    // The payload is the raw signed JSON (signPayload signs the plain text).
    const s = JSON.parse(payload) as AdminSession;
    if (typeof s.exp !== 'number' || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

// Login flow: validate password, rate-limit, issue cookie. Returns cookie | null.
export async function adminLogin(env: Env, password: string, ip: string): Promise<{ cookie: string | null; reason?: 'rate' | 'bad' | 'unconfigured' }> {
  if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_COOKIE_SECRET) {
    return { cookie: null, reason: 'unconfigured' };
  }
  if (await isRateLimited(env, ip)) {
    return { cookie: null, reason: 'rate' };
  }
  const ok = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  await recordAttempt(env, ip, ok);
  if (!ok) return { cookie: null, reason: 'bad' };
  const cookie = await createSession(env);
  return { cookie };
}
void nanoid;
