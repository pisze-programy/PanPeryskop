// Strict validation for candidates crossing the VPS→Worker trust boundary.
// Only the IDENTITY (externalId) is required; a missing title/image/link/date is
// NOT a reject — it is carried as `pendingReason` so the post is created PENDING
// (kept for the admin to fix, never shown until then). Malformed optional arrays
// (present but wrong shape) are still rejected — those are data errors, not gaps.
import { ProviderId, SeedCandidate, ShowtimeBooking } from './types';

export interface ParseResult {
  ok: true;
  cand: SeedCandidate;
  pendingReason: string | null;
}
export type ParseOutcome = ParseResult | { ok: false; reason: string };

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

/** Validate + build a SeedCandidate. Returns a reason only when the row is
 *  unusable (not an object, no externalId) or has malformed optional arrays. */
export function parseCandidate(raw: unknown, source: ProviderId, index: number): ParseOutcome {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: `#${index}: not an object` };
  }
  const c = raw as Record<string, unknown>;

  if (!isStr(c.externalId) || c.externalId === '') return { ok: false, reason: `#${index}: missing externalId` };

  const times = optStrArray(c.times);
  if (times === null) return { ok: false, reason: `#${index}: malformed times` };
  const tags = optStrArray(c.tags);
  if (tags === null) return { ok: false, reason: `#${index}: malformed tags` };
  const bookings = optBookings(c.showtimeBooking);
  if (bookings === null) return { ok: false, reason: `#${index}: malformed showtimeBooking` };

  // Missing content -> PENDING (not a reject). First missing field wins.
  const title = isStr(c.title) ? c.title : '';
  const mediaUrl = isStr(c.mediaUrl) ? c.mediaUrl : '';
  const link = isStr(c.link) ? c.link : '';
  const hasDate = isFiniteNum(c.startMs) && c.startMs > 0;
  let pendingReason: string | null = null;
  if (title === '') pendingReason = 'missing title';
  else if (mediaUrl === '') pendingReason = 'missing image';
  else if (link === '') pendingReason = 'missing link';
  else if (!hasDate) pendingReason = 'missing date';

  const geoRef = optStr(c.geoRef);
  return {
    ok: true,
    pendingReason,
    cand: {
      source,
      externalId: c.externalId,
      title,
      startMs: hasDate ? (c.startMs as number) : 0,
      lat: isFiniteNum(c.lat) ? c.lat : null,
      lng: isFiniteNum(c.lng) ? c.lng : null,
      city: isStr(c.city) ? c.city : '',
      venue: isStr(c.venue) ? c.venue : '',
      address: isStr(c.address) ? c.address : '',
      link,
      mediaUrl,
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
      venueId: isStr(c.venueId) ? c.venueId : undefined,
      pendingReason,
    },
  };
}
