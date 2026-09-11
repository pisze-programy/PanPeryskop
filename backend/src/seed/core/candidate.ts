// Strict validation for candidates crossing the VPS→Worker trust boundary.
// The VPS is our own process, but the payload is untrusted input: a malformed
// hit must be REJECTED with a reason (never substituted with a default value).
// Required: externalId, title, startMs (>0), link, mediaUrl. Everything else is
// optional and stored as null/absent when missing.
import { ProviderId, SeedCandidate, ShowtimeBooking } from './types';

export type ParseResult = { ok: true; cand: SeedCandidate } | { ok: false; reason: string };

const BOOKING_KINDS: ShowtimeBooking['kind'][] = ['helios', 'cinemacity', 'multikino', 'link'];

/** Type guard: is this string one of the known provider ids? */
export function isProviderId(v: string): v is ProviderId {
  return Object.values(ProviderId).some((p) => p === v);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function optStr(v: unknown): string | undefined {
  return isStr(v) ? v : undefined;
}
function optStrArray(v: unknown): string[] | undefined | null {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || !v.every(isStr)) return null; // present but malformed
  return v;
}
function optBookings(v: unknown): ShowtimeBooking[] | undefined | null {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) return null;
  const out: ShowtimeBooking[] = [];
  for (const raw of v) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (!isStr(o.time) || !isStr(o.kind) || !BOOKING_KINDS.includes(o.kind as ShowtimeBooking['kind'])) return null;
    if (o.params === null || typeof o.params !== 'object' || Array.isArray(o.params)) return null;
    const params: Record<string, string> = {};
    for (const [k, val] of Object.entries(o.params as Record<string, unknown>)) {
      if (!isStr(val)) return null;
      params[k] = val;
    }
    out.push({ time: o.time, kind: o.kind as ShowtimeBooking['kind'], params });
  }
  return out;
}

/** Validate + build a SeedCandidate. Returns a reason instead of guessing. */
export function parseCandidate(raw: unknown, source: ProviderId, index: number): ParseResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: `#${index}: not an object` };
  }
  const c = raw as Record<string, unknown>;

  if (!isStr(c.externalId) || c.externalId === '') return { ok: false, reason: `#${index}: missing externalId` };
  if (!isStr(c.title) || c.title === '') return { ok: false, reason: `#${index}: missing title` };
  if (!isFiniteNum(c.startMs) || c.startMs <= 0) return { ok: false, reason: `#${index}: missing/invalid startMs` };
  if (!isStr(c.link) || c.link === '') return { ok: false, reason: `#${index}: missing link` };
  if (!isStr(c.mediaUrl) || c.mediaUrl === '') return { ok: false, reason: `#${index}: missing mediaUrl` };

  const times = optStrArray(c.times);
  if (times === null) return { ok: false, reason: `#${index}: malformed times` };
  const tags = optStrArray(c.tags);
  if (tags === null) return { ok: false, reason: `#${index}: malformed tags` };
  const bookings = optBookings(c.showtimeBooking);
  if (bookings === null) return { ok: false, reason: `#${index}: malformed showtimeBooking` };

  const geoRef = optStr(c.geoRef);
  return {
    ok: true,
    cand: {
      source,
      externalId: c.externalId,
      title: c.title,
      startMs: c.startMs,
      lat: isFiniteNum(c.lat) ? c.lat : null,
      lng: isFiniteNum(c.lng) ? c.lng : null,
      city: isStr(c.city) ? c.city : '',
      venue: isStr(c.venue) ? c.venue : '',
      address: isStr(c.address) ? c.address : '',
      link: c.link,
      mediaUrl: c.mediaUrl,
      thumbUrl: isStr(c.thumbUrl) ? c.thumbUrl : null,
      isSoldOut: c.isSoldOut === true,
      geoRef: geoRef === undefined ? null : geoRef,
      times,
      showtimeBooking: bookings,
      tags,
      partnerId: isStr(c.partnerId) ? c.partnerId : undefined,
      partnerName: isStr(c.partnerName) ? c.partnerName : undefined,
      price: isFiniteNum(c.price) ? c.price : null,
      affiliateLink: isStr(c.affiliateLink) ? c.affiliateLink : undefined,
    },
  };
}
