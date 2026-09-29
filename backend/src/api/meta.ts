import {Hono} from 'hono';
import {sendCheckout, CheckoutReport} from '../analytics/meta';

export const metaRoutes = new Hono<{ Bindings: Env }>();

const KINDS = new Set(['flight', 'bus', 'place', 'event', 'stay', 'banner', 'car', 'partner']);
const EXTINFO_FIELDS = 16;

interface RawBody {
  event_id?: unknown;
  kind?: unknown;
  content_id?: unknown;
  label?: unknown;
  anon_id?: unknown;
  tracking_enabled?: unknown;
  extinfo?: unknown;
}

// The app reports one outbound partner click. The report carries the device
// facts the Worker cannot see, so the Conversions API event stays valid without
// storing anything about the device.
metaRoutes.post('/checkout', async (c) => {
  const expected = c.env.META_CLIENT_TOKEN;
  if (!expected || c.req.header('x-pp-client') !== expected) {
    return c.json({ok: false, error: 'unauthorized'}, 401);
  }
  const body = (await c.req.json().catch(() => null)) as RawBody | null;
  const report = toReport(body);
  if (!report) {
    console.warn(`meta report rejected: ${summary(body)}`);
    return c.json({ok: false, error: 'invalid report'}, 400);
  }
  const ip = c.req.header('cf-connecting-ip') ?? '';
  const agent = c.req.header('user-agent') ?? '';
  c.executionCtx.waitUntil(sendCheckout(c.env, report, ip, agent));
  return c.json({ok: true});
});

function toReport(body: RawBody | null): CheckoutReport | null {
  if (!body) return null;
  const eventId = text(body.event_id, 8, 64);
  const label = text(body.label, 1, 128);
  const contentId = text(body.content_id, 1, 128);
  const anonId = text(body.anon_id, 8, 64);
  const kind = typeof body.kind === 'string' && KINDS.has(body.kind) ? body.kind : null;
  const extinfo = strings(body.extinfo);
  if (!eventId || !label || !contentId || !anonId || !kind || !extinfo) return null;
  return {
    eventId,
    kind,
    contentId,
    label,
    anonId,
    trackingEnabled: body.tracking_enabled === 1 ? 1 : 0,
    extinfo,
  };
}

/** Lengths of the fields, never their values: an id can be long and the log
 *  needs the reason, not the payload. */
function summary(body: RawBody | null): string {
  if (!body) return 'no body';
  const fields = ['event_id', 'kind', 'content_id', 'label', 'anon_id'] as const;
  const lengths = fields.map((name) => `${name}=${String(body[name] ?? '').length}`);
  const extinfo = Array.isArray(body.extinfo) ? body.extinfo.length : 'none';
  return `${lengths.join(' ')} extinfo=${extinfo}`;
}

function text(value: unknown, min: number, max: number): string | null {
  return typeof value === 'string' && value.length >= min && value.length <= max ? value : null;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== EXTINFO_FIELDS) return null;
  return value.every((entry) => typeof entry === 'string' && entry.length <= 64)
    ? (value as string[])
    : null;
}
