import {Hono} from 'hono';
import {sendCheckout, CheckoutReport} from '../analytics/meta';

export const metaRoutes = new Hono<{ Bindings: Env }>();

const KINDS = new Set(['flight', 'bus', 'place', 'event', 'stay', 'banner', 'car', 'partner']);
const EXTINFO_FIELDS = 16;

interface RawBody {
  event_id?: unknown;
  kind?: unknown;
  label?: unknown;
  anon_id?: unknown;
  tracking_enabled?: unknown;
  extinfo?: unknown;
}

// The app reports one outbound partner click. The report carries the device
// facts the Worker cannot see, so the Conversions API event stays valid without
// storing anything about the device.
metaRoutes.post('/checkout', async (c) => {
  const body = (await c.req.json().catch(() => null)) as RawBody | null;
  const report = toReport(body);
  if (!report) return c.json({ok: false, error: 'invalid report'}, 400);
  const ip = c.req.header('cf-connecting-ip') ?? '';
  const agent = c.req.header('user-agent') ?? '';
  c.executionCtx.waitUntil(sendCheckout(c.env, report, ip, agent));
  return c.json({ok: true});
});

function toReport(body: RawBody | null): CheckoutReport | null {
  if (!body) return null;
  const eventId = text(body.event_id, 8, 64);
  const label = text(body.label, 1, 64);
  const anonId = text(body.anon_id, 8, 64);
  const kind = typeof body.kind === 'string' && KINDS.has(body.kind) ? body.kind : null;
  const extinfo = strings(body.extinfo);
  if (!eventId || !label || !anonId || !kind || !extinfo) return null;
  return {
    eventId,
    kind,
    label,
    anonId,
    trackingEnabled: body.tracking_enabled === 1 ? 1 : 0,
    extinfo,
  };
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
