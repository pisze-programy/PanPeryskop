// Post-cron reconciliation (queue redesign, step 6): merge cross-source duplicates
// for one day AFTER all its units are terminal, then absorb losers into winners.
// Runs gated (see reconcileReady): never mid-write, and fully re-runnable —
// re-running recomputes the same groups deterministically, so a crash mid-run
// just resumes where it stopped (rows already marked winner/duplicate/failure
// are skipped, only 'raw' rows are grouped).
//
// Grouping mirrors intra-batch dedupe (same primitives from core/match, same
// priority order from the registry) plus two post-state rules:
//   - time guard: single-time rows merge only when |t1-t2| <= 30 min
//     (14:00 vs 14:05 merge, 14:00 vs 16:00 stay separate);
//   - booking-key guard: equal non-null booking_key forces a merge even past the
//     time guard (same performance block); distinct keys with a time gap stay
//     separate (Avatar 14:00/14:30/15:00 blocks are NOT collapsed).
// Cinema sources are never grouped (same as dedupe).
// A loser that maps to a locked or facebook-curated post is NOT auto-demoted —
// it goes to reconciliation_failures for manual review instead.
import { nanoid } from 'nanoid';
import { ProviderId, ShowtimeBooking } from './core/types';
import { containment, isCinemaSource, isUkrainian, titleTokens, venuesMatch } from './core/match';
import { priorityOf } from './providers/registry';
import { now } from './pipeline/queue/state';

/** Single-time rows merge only within this many minutes (booking_key overrides). */
export const RECONCILE_TIME_GUARD_MIN = 30;

export interface RawRow {
  id: string;
  provider: string;
  external_id: string;
  title: string;
  raw_venue: string;
  city: string | null;
  canonical_venue_id: string | null;
  start_min: number;
  showtimes: string[];
  showtime_booking: ShowtimeBooking[];
  price_pln: number | null;
  is_sold_out: number;
  link_url: string | null;
  booking_key: string | null;
}

export interface ReconcileSummary {
  day: string;
  winners: number;
  duplicates: number;
  failures: number;
  rejectedPosts: number;
}

function safeJsonArray<T>(s: string | null | undefined): T[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/** True when every unit for the day is terminal (none pending/claimed). */
export async function reconcileReady(db: D1Database, day: string): Promise<{ ready: boolean; open: number }> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM seed_units WHERE day=? AND status IN ('pending','claimed')`)
    .bind(day)
    .first<{ n: number }>();
  const open = row?.n ?? 0;
  return { ready: open === 0, open };
}

async function loadRawRows(db: D1Database, day: string): Promise<RawRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, provider, external_id, title, raw_venue, city, canonical_venue_id,
              start_min, showtimes, showtime_booking, price_pln, is_sold_out, link_url, booking_key
         FROM seed_raw WHERE day=? AND status='raw'`,
    )
    .bind(day)
    .all<{
      id: string; provider: string; external_id: string; title: string; raw_venue: string;
      city: string | null; canonical_venue_id: string | null; start_min: number;
      showtimes: string | null; showtime_booking: string | null; price_pln: number | null;
      is_sold_out: number; link_url: string | null; booking_key: string | null;
    }>();
  return (results || []).map((r) => ({
    id: r.id,
    provider: r.provider,
    external_id: r.external_id,
    title: r.title,
    raw_venue: r.raw_venue,
    city: r.city,
    canonical_venue_id: r.canonical_venue_id,
    start_min: r.start_min,
    showtimes: safeJsonArray<string>(r.showtimes),
    showtime_booking: safeJsonArray<ShowtimeBooking>(r.showtime_booking),
    price_pln: r.price_pln,
    is_sold_out: r.is_sold_out ? 1 : 0,
    link_url: r.link_url,
    booking_key: r.booking_key,
  }));
}

/** Same event? Venue gating first (canonical id, else fuzzy), then title, then time. */
function sameEvent(a: RawRow, tokensA: Set<string>, b: RawRow, tokensB: Set<string>): boolean {
  if (a.canonical_venue_id && b.canonical_venue_id) {
    if (a.canonical_venue_id !== b.canonical_venue_id) return false;
  } else if (!venuesMatch(
    { venue: a.raw_venue, lat: null, lng: null },
    { venue: b.raw_venue, lat: null, lng: null },
  )) {
    return false;
  }
  const minContainment = a.provider === b.provider ? 1.0 : 0.8;
  if (!containment(tokensA, tokensB, minContainment)) return false;
  if (a.booking_key && b.booking_key && a.booking_key === b.booking_key) return true;
  return Math.abs(a.start_min - b.start_min) <= RECONCILE_TIME_GUARD_MIN;
}

/** Same-source pair that passes 0.8 but fails the 1.0 bar: suspicious, merge nothing.
 *  Identical token sets are NOT ambiguous — same title at different times is simply
 *  two separate showings (the time guard already kept them apart). */
function ambiguousPair(a: RawRow, tokensA: Set<string>, b: RawRow, tokensB: Set<string>): boolean {
  if (a.provider !== b.provider) return false;
  if (isCinemaSource(a.provider as ProviderId)) return false;
  const venueOk = a.canonical_venue_id && b.canonical_venue_id
    ? a.canonical_venue_id === b.canonical_venue_id
    : venuesMatch({ venue: a.raw_venue, lat: null, lng: null }, { venue: b.raw_venue, lat: null, lng: null });
  if (!venueOk) return false;
  if (sameEvent(a, tokensA, b, tokensB)) return false; // merges cleanly, not ambiguous
  if (tokensA.size === tokensB.size && containment(tokensA, tokensB, 1.0)) return false; // identical sets
  return containment(tokensA, tokensB, 0.8);
}

interface PostLock {
  id: string;
  external_id: string;
  locked: boolean;
}

async function existingPosts(db: D1Database, externalIds: string[]): Promise<Map<string, PostLock>> {
  const out = new Map<string, PostLock>();
  for (let i = 0; i < externalIds.length; i += 50) {
    const chunk = externalIds.slice(i, i + 50);
    const ph = chunk.map(() => '?').join(',');
    const { results } = await db
      .prepare(
        `SELECT id, external_id, geo_locked, tags_locked, time_locked, sold_out_locked FROM posts
          WHERE external_id IN (${ph})`,
      )
      .bind(...chunk)
      .all<{ id: string; external_id: string; geo_locked: number; tags_locked: number; time_locked: number; sold_out_locked: number }>();
    for (const r of results || []) {
      out.set(r.external_id, {
        id: r.id,
        external_id: r.external_id,
        locked: !!(r.geo_locked || r.tags_locked || r.time_locked || r.sold_out_locked),
      });
    }
  }
  return out;
}

async function recordFailure(
  db: D1Database, day: string, batchId: string, loser: RawRow, reason: string, t: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reconciliation_failures
        (id, day, batch_id, provider, external_id, title, reason, snapshot, reviewed, retry_flag, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
    )
    .bind(
      nanoid(24), day, batchId, loser.provider, loser.external_id, loser.title, reason,
      JSON.stringify({ id: loser.id, title: loser.title, venue: loser.raw_venue, start_min: loser.start_min }),
      t,
    )
    .run();
  await db
    .prepare(`UPDATE seed_raw SET status='failure', reason=?, updated_at=? WHERE id=?`)
    .bind(reason, t, loser.id)
    .run();
}

function minToHhmm(startMin: number): string {
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Reconcile one day: group raw rows, absorb losers into winners, displace
 *  superseded posts. Idempotent: only 'raw' rows are grouped; re-running after
 *  a crash picks up the remaining ones. Returns a summary for the digest. */
export async function reconcileDay(db: D1Database, day: string, batchId: string): Promise<ReconcileSummary> {
  const t = now();
  const rows = await loadRawRows(db, day);
  const summary: ReconcileSummary = { day, winners: 0, duplicates: 0, failures: 0, rejectedPosts: 0 };
  if (rows.length === 0) return summary;

  const tokens = new Map(rows.map((r) => [r.id, titleTokens(r.title, r.raw_venue)] as const));

  // Union-find over non-cinema rows.
  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b));
  };
  const ambiguities: Array<[RawRow, RawRow]> = [];
  const cinema = new Set<string>();
  for (const r of rows) if (isCinemaSource(r.provider as ProviderId)) cinema.add(r.id);
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (cinema.has(a.id) || cinema.has(b.id)) continue;
      if (find(a.id) === find(b.id)) continue;
      if (sameEvent(a, tokens.get(a.id)!, b, tokens.get(b.id)!)) union(a.id, b.id);
      else if (ambiguousPair(a, tokens.get(a.id)!, b, tokens.get(b.id)!)) ambiguities.push([a, b]);
    }
  }
  const groups = new Map<string, RawRow[]>();
  for (const r of rows) {
    if (cinema.has(r.id)) {
      groups.set(`solo:${r.id}`, [r]);
      continue;
    }
    const root = find(r.id);
    const arr = groups.get(root) ?? [];
    arr.push(r);
    groups.set(root, arr);
  }

  const ambiguousIds = new Set<string>();
  for (const [a, b] of ambiguities) {
    ambiguousIds.add(a.id);
    ambiguousIds.add(b.id);
    await recordFailure(db, day, batchId, b, `ambiguous same-source pair with ${a.external_id} (title matches, venue/time conflict)`, t);
    // Both sides need review — either could be the real event, so neither may win.
    await db
      .prepare(`UPDATE seed_raw SET status='failure', reason=?, updated_at=? WHERE id=?`)
      .bind(`ambiguous same-source pair with ${b.external_id}`, t, a.id)
      .run();
    summary.failures += 1;
  }

  // Existing posts for every candidate that could lose, one batched lookup.
  const extIds = rows.map((r) => r.external_id);
  const posts = await existingPosts(db, extIds);

  for (const members of groups.values()) {
    // Ambiguous members were already recorded as failures above — the rest of
    // the group still merges normally, so no row is ever left behind in 'raw'.
    const clean = members.filter((r) => !ambiguousIds.has(r.id));
    if (clean.length === 0) continue;
    if (clean.length === 1) {
      const solo = clean[0];
      await db.prepare(`UPDATE seed_raw SET status='winner', updated_at=? WHERE id=?`).bind(t, solo.id).run();
      summary.winners += 1;
      continue;
    }
    const sorted = [...clean].sort(
      (x, y) =>
        priorityOf(x.provider as ProviderId) - priorityOf(y.provider as ProviderId) ||
        (isUkrainian(x.title) ? 1 : 0) - (isUkrainian(y.title) ? 1 : 0) ||
        x.start_min - y.start_min,
    );
    const winner = sorted[0];
    if (ambiguousIds.has(winner.id)) continue; // winner itself ambiguous: handled above, skip group
    // Absorb: union of times + per-time bookings, cheapest price, all-sold-out flag, earliest start.
    const times = new Set<string>();
    const bookings = new Map<string, ShowtimeBooking>();
    let price: number | null = null;
    let soldOut = true;
    let startMin = winner.start_min;
    for (const m of sorted) {
      for (const s of m.showtimes.length > 0 ? m.showtimes : [minToHhmm(m.start_min)]) times.add(s);
      for (const b of m.showtime_booking) if (!bookings.has(b.time)) bookings.set(b.time, b);
      if (typeof m.price_pln === 'number' && (price === null || m.price_pln < price)) price = m.price_pln;
      if (!m.is_sold_out) soldOut = false;
      if (m.start_min < startMin) startMin = m.start_min;
    }
    await db
      .prepare(
        `UPDATE seed_raw SET status='winner', showtimes=?, showtime_booking=?, price_pln=?, is_sold_out=?, start_min=?, updated_at=? WHERE id=?`,
      )
      .bind(JSON.stringify([...times].sort()), JSON.stringify([...bookings.values()]), price, soldOut ? 1 : 0, startMin, t, winner.id)
      .run();
    summary.winners += 1;

    for (const loser of sorted.slice(1)) {
      if (ambiguousIds.has(loser.id)) continue;
      const post = posts.get(loser.external_id);
      if (loser.provider === 'facebook' || (post && post.locked)) {
        await recordFailure(
          db, day, batchId, loser,
          post ? `existing post ${post.id} is locked or manually curated — not auto-demoted` : 'facebook content is never auto-demoted',
          t,
        );
        summary.failures += 1;
        continue;
      }
      await db
        .prepare(`UPDATE seed_raw SET status='duplicate', winner_raw_id=?, reason=?, updated_at=? WHERE id=?`)
        .bind(winner.id, `covered by ${winner.provider}/${winner.external_id}`, t, loser.id)
        .run();
      summary.duplicates += 1;
      if (post) {
        await db
          .prepare(`UPDATE posts SET status='rejected', rejection_reason=? WHERE id=?`)
          .bind(`duplicate of ${winner.external_id} (${winner.provider})`, post.id)
          .run();
        summary.rejectedPosts += 1;
      }
    }
  }
  return summary;
}
