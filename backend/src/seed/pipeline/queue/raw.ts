// Phase-1 sink: normalized provider candidates → seed_raw rows.
// One row per (day, provider, external_id); re-runs upsert by that key so a
// re-seed refreshes content instead of duplicating it. The row id stays stable
// across re-runs (it is never part of the UPDATE SET) so later phases can gate
// on it. Venue aliasing happens here: every row gets a canonical_venue_id,
// creating a coordinate-less stub when the venue is unknown (geo is filled
// later when a geo'd provider visits the row — see venueStore.ts).
// Shadow mode: nothing calls this in production yet (steps 6-7 will).
import { nanoid } from 'nanoid';
import { SeedCandidate } from '../../core/types';
import { linkKey, titleTokens } from '../../core/match';
import { showtimesJson, showtimeBookingJson, tagsJson } from '../../core/eventFormat';
import { toWarsawIso } from '../../core/dates';
import { ensureCanonicalVenue, upsertVenue, venueKey } from '../../venues/venueStore';
import { now } from './state';

export interface RawWriteInput {
  day: string;
  batchId: string;
  unitId: string;
  provider: string;
  candidates: SeedCandidate[];
}

async function contentHash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function startMin(startMs: number): number {
  // 00:00 is the explicit "unknown hour" marker (UNKNOWN_TIME in core/constants):
  // an event with a known day but no time is accepted and shown all-day.
  const hm = toWarsawIso(startMs).slice(11, 16); // "HH:MM"
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Stable hash input: rotating URL query params (going Cloudinary `?_a=`) and
 *  array order must NOT change the hash, or every re-seed would look "changed"
 *  and reset terminal rows. */
function stripQuery(u: string | null | undefined): string {
  if (!u) return '';
  return u.split('#')[0].split('?')[0];
}

export function normHashInput(c: SeedCandidate): string {
  // Explicit absent→null/[] normalization ONLY (never a substituted value):
  // undefined is not JSON-serializable, so it must collapse to null/[] for a
  // stable hash. null and 0 stay DISTINCT.
  const partner = c.partnerId === undefined ? null : c.partnerId;
  const times = c.times === undefined ? [] : c.times;
  const bookings = c.showtimeBooking === undefined ? [] : c.showtimeBooking;
  const tags = c.tags === undefined ? [] : c.tags;
  return JSON.stringify({
    id: c.externalId,
    title: c.title,
    startMs: c.startMs,
    venue: c.venue,
    city: c.city,
    link: stripQuery(c.link),
    media: stripQuery(c.mediaUrl),
    price: c.price === undefined ? null : c.price,
    soldOut: c.isSoldOut ? 1 : 0,
    times: [...times].sort(),
    bookings: [...bookings].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)),
    tags: [...tags].sort(),
    partner,
    pending: c.pendingReason === undefined ? null : c.pendingReason,
  });
}

/** Write (upsert) normalized rows. Returns the number of rows written. */
export async function writeRawRows(db: D1Database, input: RawWriteInput, chunkSize: number): Promise<number> {
  const t = now();
  const stmts: D1PreparedStatement[] = [];

  // Resolve each distinct venue ONCE per payload (cinema scopes share one venue,
  // so this turns N lookups into 1).
  const venueCache = new Map<string, string | null>();
  const resolveVenue = async (c: SeedCandidate): Promise<string | null> => {
    // Fixed venues (cinemas) carry a deterministic id — NO venue cache, NO fuzzy
    // match, NO Nominatim. The id is just used as the canonical key.
    if (c.venueId !== undefined && c.venueId !== '') return c.venueId;
    const key = `${venueKey(c.venue)}|${venueKey(c.city)}`;
    if (venueCache.has(key)) return venueCache.get(key)!;
    const lat = typeof c.lat === 'number' ? c.lat : null;
    const lng = typeof c.lng === 'number' ? c.lng : null;
    const city = c.city === '' ? null : c.city;
    // Places WITH coordinates go through the shared upsert first (cheap fuzzy
    // reuse + geo cache); places WITHOUT get a stub id (geo resolved later).
    const id = lat !== null && lng !== null
      ? (await upsertVenue(db, { name: c.venue, lat, lng, city, provider: input.provider, ref: c.geoRef === null || c.geoRef === undefined ? undefined : c.geoRef })
        ?? await ensureCanonicalVenue(db, c.venue, c.city))
      : await ensureCanonicalVenue(db, c.venue, c.city);
    venueCache.set(key, id);
    return id;
  };

  for (const c of input.candidates) {
    const canonicalVenue = await resolveVenue(c);
    const hash = await contentHash(normHashInput(c));
    stmts.push(
      db.prepare(
        `INSERT INTO seed_raw
          (id, day, batch_id, unit_id, provider, external_id, title, title_tokens, raw_venue, city,
           canonical_venue_id, lat, lng, start_min, showtimes, showtime_booking, tags, price_pln, media_url, thumb_url,
           link_url, booking_key, affiliate_link, partner_id, partner_name, is_sold_out, content_hash,
           pending_reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'raw', ?, ?)
         ON CONFLICT(day, provider, external_id) DO UPDATE SET
           title=excluded.title, title_tokens=excluded.title_tokens, raw_venue=excluded.raw_venue,
           city=excluded.city, canonical_venue_id=excluded.canonical_venue_id, lat=excluded.lat, lng=excluded.lng,
           start_min=excluded.start_min,
           showtimes=excluded.showtimes, showtime_booking=excluded.showtime_booking, tags=excluded.tags,
           price_pln=excluded.price_pln, media_url=excluded.media_url, thumb_url=excluded.thumb_url,
           link_url=excluded.link_url, booking_key=excluded.booking_key, affiliate_link=excluded.affiliate_link,
           partner_id=excluded.partner_id, partner_name=excluded.partner_name,
           is_sold_out=excluded.is_sold_out, content_hash=excluded.content_hash,
           pending_reason=excluded.pending_reason,
           status=CASE WHEN seed_raw.content_hash <> excluded.content_hash THEN 'raw' ELSE seed_raw.status END,
           reason=CASE WHEN seed_raw.content_hash <> excluded.content_hash THEN NULL ELSE seed_raw.reason END,
           updated_at=excluded.updated_at`,
      ).bind(
        nanoid(24), input.day, input.batchId, input.unitId, input.provider, c.externalId, c.title,
        JSON.stringify([...titleTokens(c.title, c.venue)]), c.venue, c.city === '' ? null : c.city,
        canonicalVenue,
        typeof c.lat === 'number' ? c.lat : null,
        typeof c.lng === 'number' ? c.lng : null,
        startMin(c.startMs),
        showtimesJson(c), showtimeBookingJson(c), tagsJson(c),
        c.price === undefined ? null : c.price,
        c.mediaUrl,
        c.thumbUrl === undefined ? null : c.thumbUrl,
        c.link, linkKey(c.link),
        c.affiliateLink === undefined ? null : c.affiliateLink,
        c.partnerId === undefined ? null : c.partnerId,
        c.partnerName === undefined ? null : c.partnerName,
        c.isSoldOut ? 1 : 0, hash,
        c.pendingReason === undefined || c.pendingReason === null ? null : c.pendingReason,
        t, t,
      ),
    );
  }
  let n = 0;
  for (let i = 0; i < stmts.length; i += chunkSize) {
    const res = await db.batch(stmts.slice(i, i + chunkSize));
    for (const r of res) n += r.meta.changes;
  }
  return n;
}
