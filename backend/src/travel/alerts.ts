import { CONFIG } from '../config/index';
import { snitchReport, type SnitchEnv } from '../seed/alert';

export type FlightCarrier = 'ryanair' | 'wizzair' | 'flixbus' | 'all';

export interface AlertEnv extends SnitchEnv {
  DB: D1Database;
}

/** One email per carrier per throttle window, so a standing outage tells you once. */
export async function alertFlightFailure(env: AlertEnv, carrier: FlightCarrier, detail: string): Promise<void> {
  const key = `flightalert:${carrier}`;
  const now = Date.now();
  const guard = await env.DB
    .prepare(
      `INSERT INTO flight_cache (cache_key, payload, expires_at) VALUES (?, 'alerted', ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = 'alerted', expires_at = excluded.expires_at
       WHERE flight_cache.expires_at <= ?`,
    )
    .bind(key, now + CONFIG.travel.flights.alertThrottleMs, now)
    .run()
    .catch(() => null);

  if (!guard || Number(guard.meta?.changes ?? 0) === 0) return;

  await snitchReport(env, 'panperyskop/travel/flights', 'failed', {
    data: { carrier, detail },
    message: `Flight lookup failed (${carrier}): ${detail}`,
    notify: 'on-error',
  });
}
