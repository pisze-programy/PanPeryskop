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
import { showtimesJson, showtimeBookingJson, tagsJson } from '../../core/dedupe';
import { toWarsawIso } from '../../core/dates';
import { ensureCanonicalVenue, upsertVenue } from '../../venues/venueStore';
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
  const hm = toWarsawIso(startMs).slice(11, 16); // "HH:MM"
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Write (upsert) normalized rows. Returns the number of rows written. */
export async function writeRawRows(db: D1Database, input: RawWriteInput, chunkSize: number): Promise<number> {
  const t = now();
  const stmts: D1PreparedStatement[] = [];
  for (const c of input.candidates) {
    const lat = typeof c.lat === 'number' ? c.lat : null;
    const lng = typeof c.lng === 'number' ? c.lng : null;
    // Places WITH coordinates go through the shared upsert first: cheap fuzzy
    // reuse within the city (no geo API call), and a miss SAVES the provided geo
    // to the cache so future seeds never hit the geo API for it either.
    // Places WITHOUT coordinates get a stub id (geo resolved later, winners only).
    const canonicalVenue = lat !== null && lng !== null
      ? (await upsertVenue(db, { name: c.venue, lat, lng, city: c.city || null, provider: input.provider, ref: c.geoRef ?? undefined })
        ?? await ensureCanonicalVenue(db, c.venue, c.city))
      : await ensureCanonicalVenue(db, c.venue, c.city);
    const hash = await contentHash(
      [c.externalId, c.title, c.startMs, c.venue, c.city, c.link, c.mediaUrl, c.price ?? '', c.isSoldOut ? 1 : 0,
        showtimesJson(c) ?? '', showtimeBookingJson(c) ?? '', tagsJson(c) ?? '', c.partnerId ?? ''].join('|'),
    );
    stmts.push(
      db.prepare(
        `INSERT INTO seed_raw
          (id, day, batch_id, unit_id, provider, external_id, title, title_tokens, raw_venue, city,
           canonical_venue_id, start_min, showtimes, showtime_booking, tags, price_pln, media_url, thumb_url,
           link_url, booking_key, affiliate_link, partner_id, partner_name, is_sold_out, content_hash,
           status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'raw', ?, ?)
         ON CONFLICT(day, provider, external_id) DO UPDATE SET
           title=excluded.title, title_tokens=excluded.title_tokens, raw_venue=excluded.raw_venue,
           city=excluded.city, canonical_venue_id=excluded.canonical_venue_id, start_min=excluded.start_min,
           showtimes=excluded.showtimes, showtime_booking=excluded.showtime_booking, tags=excluded.tags,
           price_pln=excluded.price_pln, media_url=excluded.media_url, thumb_url=excluded.thumb_url,
           link_url=excluded.link_url, booking_key=excluded.booking_key, affiliate_link=excluded.affiliate_link,
           partner_id=excluded.partner_id, partner_name=excluded.partner_name,
           is_sold_out=excluded.is_sold_out, content_hash=excluded.content_hash,
           status='raw', reason=NULL, updated_at=excluded.updated_at`,
      ).bind(
        nanoid(24), input.day, input.batchId, input.unitId, input.provider, c.externalId, c.title,
        JSON.stringify([...titleTokens(c.title, c.venue)]), c.venue, c.city || null, canonicalVenue, startMin(c.startMs),
        showtimesJson(c), showtimeBookingJson(c), tagsJson(c), c.price ?? null, c.mediaUrl, c.thumbUrl ?? null,
        c.link, linkKey(c.link), c.affiliateLink || null, c.partnerId || null, c.partnerName || null,
        c.isSoldOut ? 1 : 0, hash, t, t,
      ),
    );
  }
  let n = 0;
  for (let i = 0; i < stmts.length; i += chunkSize) {
    const res = await db.batch(stmts.slice(i, i + chunkSize));
    n += res.length;
  }
  return n;
}
