import { CONFIG } from '../config/index';

// Google Analytics 4 Measurement Protocol, server-side. The Worker posts an
// anonymous usage event; the app never talks to Google. No user_id, no device
// id, no IP, no free text — the payload carries an event name and a small set
// of coarse dimensions only.

export interface UsageEvent {
  name: string;
  /** Coarse dimensions only (city, day, provider, kind). No identifiers. */
  params?: Record<string, string | number>;
}

/** Pure payload builder (unit-testable). GA4 requires a client_id even for
 *  anonymous totals; we derive a non-reversible one from a rotating salt so no
 *  request can be traced back to a device. */
export function buildGa4Payload(events: UsageEvent[], clientId: string): Record<string, unknown> {
  return {
    client_id: clientId,
    // No user_id: we deliberately do not link events to an account.
    events: events.map((e) => ({
      name: e.name,
      params: { ...(e.params ?? {}) },
    })),
  };
}

/** Fire-and-forget. A failure here never throws to the caller. */
export async function sendGa4Events(env: Env, events: UsageEvent[], clientId: string): Promise<void> {
  if (events.length === 0) return;
  const secret = env.GA4_API_SECRET;
  if (!secret) return;
  const cfg = CONFIG.analytics.ga4;
  const url = `${cfg.endpoint}?measurement_id=${cfg.measurementId}&api_secret=${secret}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGa4Payload(events, clientId)),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (e) {
    console.error(`ga4 send failed: ${(e as Error).message}`);
  }
}

/** GA4 requires a client_id, but we only want totals. Derive one stable value
 *  per day from the salt: it counts daily totals and cannot be traced back to a
 *  device or an account. Rotates every day. */
export async function anonymousClientId(env: Env): Promise<string> {
  const salt = env.ANALYTICS_SALT ?? 'panperyskop';
  const day = new Date().toISOString().slice(0, 10);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(day));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // GA4 accepts "<int>.<int>"; derive two large ints from the digest.
  const a = BigInt(`0x${hex.slice(0, 16)}`);
  const b = BigInt(`0x${hex.slice(16, 32)}`);
  return `${a}.${b}`;
}
