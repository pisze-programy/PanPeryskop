import { CONFIG } from '../config/index';

// Meta Conversions API for app events. The app posts one report per outbound
// partner click; the Worker forwards it with the real request IP. The app logs
// the same click through the Facebook SDK with the same event_id, so Meta
// removes the double count and keeps one conversion.

const REFERRAL_KINDS = new Set(['banner', 'partner']);

export interface CheckoutReport {
  eventId: string;
  kind: string;
  contentId: string;
  label: string;
  anonId: string;
  trackingEnabled: number;
  extinfo: string[];
}

/** Pure payload builder (unit-testable). Meta requires action_source, event_id,
 *  advertiser_tracking_enabled and extinfo for an app event. A referral tap is
 *  not a checkout: it gets its own event name, so an optimised campaign never
 *  buys a banner tap. */
export function buildCheckoutEvent(
  report: CheckoutReport,
  ip: string,
  userAgent: string,
  now: number
): Record<string, unknown> {
  return {
    event_name: REFERRAL_KINDS.has(report.kind) ? 'PartnerReferral' : 'InitiateCheckout',
    event_time: Math.floor(now / 1000),
    event_id: report.eventId,
    action_source: 'app',
    user_data: {
      anon_id: report.anonId,
      client_ip_address: ip,
      client_user_agent: userAgent,
    },
    app_data: {
      advertiser_tracking_enabled: report.trackingEnabled,
      extinfo: report.extinfo,
    },
    custom_data: {
      content_type: report.kind,
      content_ids: [report.contentId],
      content_name: report.label,
      content_category: REFERRAL_KINDS.has(report.kind) ? 'referral' : 'booking',
    },
  };
}

/** Fire-and-forget. A failure here never throws to the caller, and the Worker
 *  logs it instead. The access token stays out of every log line. */
export async function sendCheckout(
  env: Env,
  report: CheckoutReport,
  ip: string,
  userAgent: string
): Promise<void> {
  const dataset = env.META_DATASET_ID;
  const token = env.META_CAPI_TOKEN;
  if (!dataset || !token) return;
  const { version, timeoutMs } = CONFIG.analytics.meta;
  const url = `https://graph.facebook.com/${version}/${dataset}/events?access_token=${token}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [buildCheckoutEvent(report, ip, userAgent, Date.now())] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) console.error(`meta send rejected: ${res.status} ${await res.text()}`);
  } catch (e) {
    console.error(`meta send failed: ${(e as Error).message}`);
  }
}
