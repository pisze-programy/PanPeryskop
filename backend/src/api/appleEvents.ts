// Sign in with Apple server-to-server notifications (POST /apple/notifications).
// Apple sends a JSON `{ events: [<signed JWT>, ...] }` when a user changes email
// forwarding (emailDiscontinued), revokes Sign in with Apple consent
// (consentRevoked), or deletes their Apple Account entirely (accountDelete).
//
// Each event is an RS256 JWT signed by Apple (same JWKS as id_tokens) with
// iss=https://appleid.apple.com and aud = our bundle id. We verify every event,
// act on the ones we care about, and always ACK with 200 so Apple doesn't retry.
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { verifyAppleEventToken, AppleEventPayload } from './oauth';
import { deleteUserAccount } from './users';
import { User } from '../core/models';

export const appleEventsRoutes = new Hono<{ Bindings: Env }>();

appleEventsRoutes.post('/notifications', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { events?: unknown } | null;
  if (!body || !Array.isArray(body.events)) {
    return c.json({ error: 'Expected {"events": [...]}' }, 400);
  }
  const audience = c.env.APPLE_CLIENT_ID;
  if (!audience) {
    console.error('apple event: APPLE_CLIENT_ID not configured');
    return c.json({ error: 'Not configured' }, 500);
  }

  for (const raw of body.events) {
    if (typeof raw !== 'string') {
      console.error('apple event: non-string entry skipped');
      continue;
    }
    try {
      const payload = await verifyAppleEventToken(raw, audience);
      console.log(`apple event: type=${payload.event} sub=${payload.sub} aud=${payload.aud}`);
      await handleAppleEvent(c.env, payload);
    } catch (e) {
      console.error(`apple event verify failed: ${(e as Error).message}`);
    }
  }

  return c.json({ ok: true });
});

async function handleAppleEvent(env: Env, payload: AppleEventPayload): Promise<void> {
  const db = env.DB;

  if (payload.event === 'emailDiscontinued') {
    // We don't store user emails — nothing to act on.
    return;
  }

  if (payload.event === 'consentRevoked') {
    // User revoked Sign in with Apple — invalidate sessions of all accounts
    // linked to this Apple sub so they can't keep using the app. They can
    // re-consent and sign in again.
    const res = await db
      .prepare('UPDATE users SET session_token = ? WHERE apple_id = ?')
      .bind(nanoid(48), payload.sub)
      .run();
    console.log(`apple consentRevoked: sessions invalidated for ${payload.sub} (changes=${res.meta.changes})`);
    return;
  }

  if (payload.event === 'accountDelete') {
    // User deleted their Apple Account — hard-delete every account linked to it.
    const { results: users } = await db
      .prepare('SELECT * FROM users WHERE apple_id = ?')
      .bind(payload.sub)
      .all<User>();
    for (const user of users) {
      try {
        await deleteUserAccount(env, user);
        console.log(`apple accountDelete: removed account ${user.id}`);
      } catch (e) {
        console.error(`apple accountDelete failed for ${user.id}: ${(e as Error).message}`);
      }
    }
    return;
  }

  console.log(`apple event: unhandled type ${payload.event}`);
}
