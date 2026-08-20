import { Hono, Context } from 'hono';
import { nanoid } from 'nanoid';
import { User, defaultUsername } from '../core/models';
import { APPLE_JWKS_URL, GOOGLE_JWKS_URL, verifyIdToken } from './oauth';
import { mediaUrl, originFromRequest } from '../core/media';

export const authRoutes = new Hono<{ Bindings: Env }>();

// Best-effort auth event log (dashboard per-day activity). Never blocks auth.
async function logAuthEvent(
  db: D1Database,
  event: 'login' | 'logout' | 'register',
  user: { id?: string; device_id?: string } | null,
  provider: string,
  success = 1
): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO auth_events (id, user_id, device_id, event, provider, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(nanoid(24), user?.id ?? null, user?.device_id ?? null, event, provider, success, Date.now())
      .run();
  } catch { /* ignore — telemetry must never break auth */ }
}

export async function isBanned(db: D1Database, device_id: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS banned FROM banned_devices WHERE device_id = ?')
    .bind(device_id)
    .first<{ banned: number }>();
  return Boolean(row);
}

function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8;
}

async function issueSession(db: D1Database, device_id: string) {
  const session_token = nanoid(48);
  const now = Date.now();

  const existing = await db
    .prepare('SELECT * FROM users WHERE device_id = ?')
    .bind(device_id)
    .first<User>();

  if (existing) {
    await db
      .prepare('UPDATE users SET session_token = ? WHERE device_id = ?')
      .bind(session_token, device_id)
      .run();
    return { session_token, user_id: existing.id, role: existing.role, username: existing.username, avatar_key: existing.avatar_key, is_new: false };
  }

  const id = nanoid(16);
  const username = defaultUsername();
  await db
    .prepare(
      'INSERT INTO users (id, device_id, session_token, role, username, auth_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, device_id, session_token, 'user', username, 'device', now)
    .run();

  return { session_token, user_id: id, role: 'user', username, avatar_key: null, is_new: true };
}

function toUserJson(user: {
  session_token: string;
  user_id: string;
  role: string;
  username: string | null;
  avatar_key: string | null;
  is_new: boolean;
}, origin: string) {
  return {
    session_token: user.session_token,
    user_id: user.user_id,
    role: user.role,
    username: user.username,
    auth_provider: 'device',
    avatar_url: mediaUrl(origin, user.avatar_key),
    is_new: user.is_new,
  };
}

authRoutes.post('/device', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{ device_id?: unknown }>();
  const device_id = body?.device_id;

  if (!isValidDeviceId(device_id)) {
    return c.json({ error: 'Invalid device_id' }, 400);
  }

  if (await isBanned(db, device_id)) {
    return c.json({ error: 'banned' }, 403);
  }

  const session = await issueSession(db, device_id);
  await logAuthEvent(db, session.is_new ? 'register' : 'login', { id: session.user_id, device_id }, 'device');
  return c.json(toUserJson(session, originFromRequest(c)), session.is_new ? 201 : 200);
});

// Dev-mode simulation (ENVIRONMENT !== 'production'): accepts {device_id, apple_user_id,
// full_name} without JWT verification so the flow is testable without a paid Apple account.
async function appleOrGoogleLogin(
  c: Context<{ Bindings: Env }>,
  provider: 'apple' | 'google'
) {
  const db = c.env.DB;
  const body = await c.req.json();
  const device_id = body.device_id;

  if (!isValidDeviceId(device_id)) {
    return c.json({ error: 'Invalid device_id' }, 400);
  }

  if (await isBanned(db, device_id)) {
    return c.json({ error: 'banned' }, 403);
  }

  let provider_id: string;
  let display_name: string | undefined;

  if (c.env.ENVIRONMENT === 'production') {
    const token = body.identity_token;
    if (typeof token !== 'string' || token.length === 0) {
      return c.json({ error: 'Missing identity_token' }, 400);
    }
    const audience =
      provider === 'apple' ? c.env.APPLE_CLIENT_ID : c.env.GOOGLE_CLIENT_ID;
    if (!audience) {
      return c.json({ error: 'OAuth not configured' }, 500);
    }
    try {
      const payload = await verifyIdToken({
        jwksUrl: provider === 'apple' ? APPLE_JWKS_URL : GOOGLE_JWKS_URL,
        issuers:
          provider === 'apple'
            ? ['https://appleid.apple.com']
            : ['https://accounts.google.com', 'accounts.google.com'],
        audience,
        token,
      });
      provider_id = payload.sub;
      display_name = provider === 'apple' ? undefined : payload.given_name || payload.name;
    } catch (e) {
      console.error(`${provider} id_token verify failed: ${(e as Error).message} (aud=${audience})`);
      return c.json({ error: 'Invalid identity_token' }, 401);
    }
  } else {
    const devId = body[`${provider}_user_id`];
    provider_id =
      typeof devId === 'string' && devId.length > 0
        ? devId
        : typeof body.identity_token === 'string' && body.identity_token.length > 0
          ? body.identity_token
          : '';
    if (!provider_id) {
      return c.json({ error: `Missing ${provider}_user_id (dev mode)` }, 400);
    }
    display_name = typeof body.full_name === 'string' ? body.full_name : undefined;
  }

  const idColumn = provider === 'apple' ? 'apple_id' : 'google_id';

  const existing = await db
    .prepare('SELECT * FROM users WHERE device_id = ?')
    .bind(device_id)
    .first<User>();

  const session_token = nanoid(48);
  const now = Date.now();

  if (existing) {
    await db
      .prepare(`UPDATE users SET ${idColumn} = ?, session_token = ? WHERE device_id = ?`)
      .bind(provider_id, session_token, device_id)
      .run();
    await logAuthEvent(db, 'login', { id: existing.id, device_id }, provider);
    return c.json({
      session_token,
      user_id: existing.id,
      role: existing.role,
      username: existing.username,
      auth_provider: provider,
      avatar_url: mediaUrl(originFromRequest(c), existing.avatar_key),
      is_new: false,
    });
  }

  const id = nanoid(16);
  const username =
    display_name && display_name.trim().length > 0 ? display_name.trim() : defaultUsername();
  await db
    .prepare(
      `INSERT INTO users (id, device_id, session_token, role, username, auth_provider, ${idColumn}, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, device_id, session_token, 'user', username, provider, provider_id, now)
    .run();

  await logAuthEvent(db, 'register', { id, device_id }, provider);
  return c.json(
    { session_token, user_id: id, role: 'user', username, auth_provider: provider, avatar_url: null, is_new: true },
    201
  );
}

authRoutes.post('/apple', (c) => appleOrGoogleLogin(c, 'apple'));
authRoutes.post('/google', (c) => appleOrGoogleLogin(c, 'google'));

authRoutes.post('/logout', async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  await c.env.DB
    .prepare('UPDATE users SET session_token = ? WHERE id = ?')
    .bind(nanoid(48), user.id)
    .run();
  await logAuthEvent(c.env.DB, 'logout', { id: user.id, device_id: user.device_id }, user.auth_provider || 'device');
  return c.json({ ok: true });
});

export async function authenticate(
  c: { env: Env; req: { header: (n: string) => string | undefined } }
): Promise<User | null> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const db = c.env.DB;
  const user = await db
    .prepare('SELECT * FROM users WHERE session_token = ?')
    .bind(token)
    .first<User>();
  if (!user) return null;
  if (await isBanned(db, user.device_id)) return null;
  // Touch last-seen, throttled (one write per user per 5 min) — powers the admin
  // "Ostatnia aktywność" column without writing on every request.
  await db
    .prepare('UPDATE users SET last_seen = ? WHERE id = ? AND (last_seen IS NULL OR last_seen < ?)')
    .bind(Date.now(), user.id, Date.now() - 5 * 60 * 1000)
    .run();
  return user;
}
