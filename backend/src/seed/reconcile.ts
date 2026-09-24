// Post-cron reconciliation (queue redesign, step 6): merge cross-source duplicates
// for one day AFTER all its units are terminal, then absorb losers into winners.
// Runs gated (see reconcileIfReady / countOpenUnitsForDay): never mid-write, and fully re-runnable —
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
import { ProviderId, ShowtimeBooking } from './core/types';
import { containment, isCinemaSource, isUkrainian, titleTokens, venuesMatch, flatNorm, isTba } from './core/match';
import { priorityOf } from './providers/registry';
import { now, getOrCreateSeedUser } from './pipeline/queue/state';
import { countOpenUnitsForDay, MAX_UNIT_ATTEMPTS } from './pipeline/queue/units';
import { isCancelled } from './core/filters';
import { ingestWinnerRow, RawWinnerRow } from './pipeline/queue/ingest';
import { SEED_PROVIDERS } from './providers';
import { addDaysWarsaw, warsawDateOf } from './core/dates';
import { snitchReport } from './alert';

/** Single-time rows merge only within this many minutes (booking_key overrides). */
export const RECONCILE_TIME_GUARD_MIN = 30;

/** Two sources rarely agree on the hour: one writes the doors, the other the
 *  set. A pair from different providers gets the wider guard, so the same gig
 *  at 19:00 and 20:00 folds into one post. */
export const RECONCILE_TIME_GUARD_CROSS_MIN = 90;

// A reconcile latch older than this is considered dead (the Worker invocation was
// killed mid-reconcile) and may be taken over by a later finalize — otherwise a
// stuck `reconciling=1` blocks that day forever. Kept comfortably above the
// 5-minute CPU cap so a slow O(n²) reconcile is never taken over mid-run; failure
// rows are keyed deterministically anyway, so even a takeover cannot duplicate.
export const RECONCILE_STALE_MS = 30 * 60_000;

// A raw row left in 'ingesting' this long means the worker died mid-ingest; it is
// returned to 'winner' for a retry. 'error' rows are retried while under this cap.
export const RAW_INGEST_STALE_MS = 10 * 60_000;
export const MAX_RAW_ATTEMPTS = 5;

/** Self-heal the ingest shelf: stale 'ingesting' rows (dead worker) and 'error'
 *  rows still under the attempt cap go back to 'winner' so a later finalize
 *  retries them instead of silently dropping the event. Returns how many opened. */
export async function sweepStuckRaw(db: D1Database): Promise<{ reopened: number }> {
  const t = now();
  const stale = await db
    .prepare(`UPDATE seed_raw SET status='winner', updated_at=? WHERE status='ingesting' AND updated_at < ? AND attempts < ?`)
    .bind(t, t - RAW_INGEST_STALE_MS, MAX_RAW_ATTEMPTS)
    .run();
  const errored = await db
    .prepare(`UPDATE seed_raw SET status='winner', updated_at=? WHERE status='error' AND attempts < ?`)
    .bind(t, MAX_RAW_ATTEMPTS)
    .run();
  return { reopened: Number(stale?.meta?.changes ?? 0) + Number(errored?.meta?.changes ?? 0) };
}

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
  /** 'raw' (not yet ingested) or 'done' (already a post). A done row only ever
   *  loses a group; it is never re-opened, so a live post is not re-ingested. */
  status: string;
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

async function loadRawRows(db: D1Database, day: string): Promise<RawRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, provider, external_id, title, raw_venue, city, canonical_venue_id,
              start_min, showtimes, showtime_booking, price_pln, is_sold_out, link_url, booking_key, status
         FROM seed_raw WHERE day=? AND status IN ('raw','done')`,
    )
    .bind(day)
    .all<{
      id: string; provider: string; external_id: string; title: string; raw_venue: string;
      city: string | null; canonical_venue_id: string | null; start_min: number;
      showtimes: string | null; showtime_booking: string | null; price_pln: number | null;
      is_sold_out: number; link_url: string | null; booking_key: string | null; status: string;
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
    status: r.status,
  }));
}

/** Do two rows name the same venue? An equal canonical id is decisive; a
 *  different id is NOT (the non-fuzzy stub keeps "Hydrozagadka" and "Klub
 *  Hydrozagadka" apart), so the raw names are matched. */
function venuesAgree(a: RawRow, b: RawRow): boolean {
  if (a.canonical_venue_id && b.canonical_venue_id && a.canonical_venue_id === b.canonical_venue_id) return true;
  return venuesMatch(
    { venue: a.raw_venue, lat: null, lng: null },
    { venue: b.raw_venue, lat: null, lng: null },
  );
}

/** Same event? Venue gating first (canonical id, else fuzzy), then title, then time. */
export function sameEvent(a: RawRow, tokensA: Set<string>, b: RawRow, tokensB: Set<string>): boolean {
  if (!venuesAgree(a, b)) return false;
  const sameSource = a.provider === b.provider;
  if (!containment(tokensA, tokensB, sameSource ? 1.0 : 0.8)) return false;
  if (a.booking_key && b.booking_key && a.booking_key === b.booking_key) return true;
  const guard = sameSource ? RECONCILE_TIME_GUARD_MIN : RECONCILE_TIME_GUARD_CROSS_MIN;
  return Math.abs(a.start_min - b.start_min) <= guard;
}

/** Same-source pair that passes 0.8 but fails the 1.0 bar: suspicious, merge nothing.
 *  Identical token sets are NOT ambiguous — same title at different times is simply
 *  two separate showings (the time guard already kept them apart). */
function ambiguousPair(a: RawRow, tokensA: Set<string>, b: RawRow, tokensB: Set<string>): boolean {
  if (a.provider !== b.provider) return false;
  if (a.status !== 'raw' || b.status !== 'raw') return false; // never strand a live post
  if (isCinemaSource(a.provider as ProviderId)) return false;
  if (!venuesAgree(a, b)) return false;
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
  // Deterministic id: a stale-latch takeover running reconcile twice must not
  // duplicate the same failure row. INSERT OR IGNORE keeps the first reason.
  const id = `${day}:${loser.provider}:${loser.external_id}`;
  await db
    .prepare(
      `INSERT OR IGNORE INTO reconciliation_failures
        (id, day, batch_id, provider, external_id, title, reason, snapshot, reviewed, retry_flag, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
    )
    .bind(
      id, day, batchId, loser.provider, loser.external_id, loser.title, reason,
      JSON.stringify({ id: loser.id, title: loser.title, venue: loser.raw_venue, start_min: loser.start_min }),
      t,
    )
    .run();
  await db
    .prepare(`UPDATE seed_raw SET status='failure', reason=?, updated_at=? WHERE id=?`)
    .bind(reason, t, loser.id)
    .run();
}

/** Reject the post a losing row points at, unless it is locked or manually
 *  curated. Returns true when the post was rejected. */
async function demotePost(db: D1Database, post: PostLock | undefined, reason: string): Promise<boolean> {
  if (!post) return false;
  if (post.locked) return false;
  await db.prepare(`UPDATE posts SET status='rejected', rejection_reason=? WHERE id=?`).bind(reason, post.id).run();
  return true;
}

function minToHhmm(startMin: number): string {
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Reconcile one day: group raw rows, absorb losers into winners, displace
 *  superseded posts. Idempotent: 'raw' and 'done' rows are grouped; a done row
 *  only ever loses (its live post is rejected), never re-opens. Re-running after
 *  a crash picks up the remaining ones. Returns a summary for the digest. */
export async function reconcileDay(db: D1Database, day: string, batchId: string): Promise<ReconcileSummary> {
  const t = now();
  const allRows = await loadRawRows(db, day);
  const summary: ReconcileSummary = { day, winners: 0, duplicates: 0, failures: 0, rejectedPosts: 0 };
  if (allRows.length === 0) return summary;

  // Existing posts for every candidate that could lose, one batched lookup.
  const posts = await existingPosts(db, allRows.map((r) => r.external_id));

  // Cancelled titles never form or win a group (same gate as intra-batch dedupe).
  for (const r of allRows) {
    if (isCancelled(r.title)) {
      await db.prepare(`UPDATE seed_raw SET status='duplicate', reason='title: cancelled', updated_at=? WHERE id=?`).bind(t, r.id).run();
      summary.duplicates += 1;
      if (await demotePost(db, posts.get(r.external_id), `cancelled: ${r.title}`)) summary.rejectedPosts += 1;
    }
  }
  const rows = allRows.filter((r) => !isCancelled(r.title));
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

  // Candidate pairs only, instead of every pair (O(n²)). Two rows can match only
  // if they share a canonical venue id, share a venue-string trigram (venuesMatch
  // needs a high LCS / char overlap, so a shared trigram is implied), or one of
  // them is TBA/empty (venuesMatch then falls back to geo — those go in a shared
  // bucket). ponytail: trigram-overlap prefilter; if a real fuzzy-venue miss is
  // ever observed, replace with a proper n-gram/geo index.
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const buckets = new Map<string, string[]>();
  const addTo = (key: string, id: string) => {
    const arr = buckets.get(key);
    if (arr) arr.push(id); else buckets.set(key, [id]);
  };
  for (const r of rows) {
    if (cinema.has(r.id)) continue; // cinema rows never group
    if (r.canonical_venue_id) addTo(`id:${r.canonical_venue_id}`, r.id);
    const v = flatNorm(r.raw_venue).trim();
    if (!isTba(r.raw_venue) && v.length >= 3) {
      const seenTg = new Set<string>();
      for (let i = 0; i + 3 <= v.length; i++) seenTg.add(v.slice(i, i + 3));
      for (const tg of seenTg) addTo(`t:${tg}`, r.id);
    } else {
      addTo('shared', r.id);
    }
  }
  const seenPair = new Set<string>();
  for (const ids of buckets.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = byId.get(ids[i])!, b = byId.get(ids[j])!;
        if (find(a.id) === find(b.id)) continue;
        const pk = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (seenPair.has(pk)) continue;
        seenPair.add(pk);
        if (sameEvent(a, tokens.get(a.id)!, b, tokens.get(b.id)!)) union(a.id, b.id);
        else if (ambiguousPair(a, tokens.get(a.id)!, b, tokens.get(b.id)!)) ambiguities.push([a, b]);
      }
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

  for (const members of groups.values()) {
    // Ambiguous members were already recorded as failures above — the rest of
    // the group still merges normally, so no row is ever left behind in 'raw'.
    const clean = members.filter((r) => !ambiguousIds.has(r.id));
    if (clean.length === 0) continue;
    if (clean.length === 1) {
      const solo = clean[0];
      if (solo.status === 'done') continue; // already a post — never re-open
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
    // A done winner already has a live post: never re-open it. Only its raw
    // losers are demoted, so a late duplicate is absorbed without re-ingest.
    if (winner.status !== 'done') {
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
    }

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

/** Ingest the day's reconciled winners into posts (idempotent upsert by
 *  external_id). Bounded by `limit` so a request never runs past the CPU limit;
 *  callers repeat while `remaining` > 0. `processed` counts rows that left the
 *  winner shelf this call (success, unknown provider or error) — the signal the
 *  finalize chain uses to know it is still making progress. */
export async function ingestWinnersForDay(env: Env, day: string, limit = 200): Promise<{ ingested: number; processed: number; remaining: number }> {
  const { results } = await env.DB
    .prepare(`SELECT * FROM seed_raw WHERE day=? AND status='winner' LIMIT ?`)
    .bind(day, limit)
    .all<RawWinnerRow>();
  const rows = results || [];
  if (rows.length === 0) return { ingested: 0, processed: 0, remaining: 0 };
  const user = await getOrCreateSeedUser(env.DB);
  let n = 0;
  let processed = 0;
  for (const row of rows) {
    const provider = SEED_PROVIDERS.find((p) => p.id === row.provider);
    if (!provider) {
      await env.DB.prepare(`UPDATE seed_raw SET status='error', reason=?, updated_at=? WHERE id=?`)
        .bind(`unknown provider ${row.provider}`, now(), row.id).run();
      processed += 1;
      continue;
    }
    try {
      await ingestWinnerRow(env, provider, user.id, day, row);
      n += 1;
    } catch (e) {
      console.error(`ingest ${row.provider}/${row.external_id} failed: ${(e as Error).message}`);
    }
    processed += 1;
  }
  const rem = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM seed_raw WHERE day=? AND status='winner'`)
    .bind(day)
    .first<{ n: number }>();
  return { ingested: n, processed, remaining: rem?.n ?? 0 };
}

/** Reconcile `day` once every fetch unit that can write to it is terminal AND
 *  there are unprocessed raw rows. The atomic latch on seed_days.reconciling
 *  makes concurrent callers safe (only one runs); a stale latch is taken over
 *  after RECONCILE_STALE_MS. Idempotent; returns true when it actually ran.
 *
 *  It stops at reconcile — ingest is a separate bounded step driven by
 *  handleFinalizeWake — so neither phase can blow a request's budget. */
export async function reconcileIfReady(env: Env, day: string, batchId: string): Promise<boolean> {
  const open = await countOpenUnitsForDay(env.DB, day);
  if (open > 0) return false;
  const raw = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM seed_raw WHERE day=? AND status='raw'`)
    .bind(day)
    .first<{ n: number }>();
  if (!raw || raw.n === 0) return false;
  const latch = await env.DB
    .prepare(`UPDATE seed_days SET reconciling=1, updated_at=? WHERE day=? AND (reconciling=0 OR updated_at < ?)`)
    .bind(now(), day, now() - RECONCILE_STALE_MS)
    .run();
  if (Number(latch?.meta?.changes ?? 0) !== 1) return false; // another completion won the latch
  try {
    await reconcileDay(env.DB, day, batchId);
  } finally {
    await env.DB.prepare('UPDATE seed_days SET reconciling=0, updated_at=? WHERE day=?').bind(now(), day).run();
  }
  return true;
}

/** Days that have unreconciled raw rows OR un-ingested winners but no open fetch
 *  unit and no live reconcile latch — i.e. a completion's finalize wake was lost.
 *  The watchdog enqueues these so a day can never strand work: `raw` rows get
 *  reconciled, `winner` rows get ingested (handleFinalizeWake does both). */
export async function daysReadyToReconcile(env: Env, sinceDay: string): Promise<{ day: string; batchId: string }[]> {
  const { results } = await env.DB
    .prepare(`SELECT day, MAX(batch_id) AS batch_id FROM seed_raw WHERE status IN ('raw','winner') AND day >= ? GROUP BY day ORDER BY day LIMIT 20`)
    .bind(sinceDay)
    .all<{ day: string; batch_id: string }>();
  const out: { day: string; batchId: string }[] = [];
  for (const r of results || []) {
    if ((await countOpenUnitsForDay(env.DB, r.day)) > 0) continue;
    // Skip only a LIVE latch. A stale `reconciling=1` (the invocation was killed
    // before its finally) must stay eligible: reconcileIfReady takes it over after
    // RECONCILE_STALE_MS. Skipping it here deadlocks the day forever, because this
    // sweep is the only wake left once all units are terminal.
    const latch = await env.DB.prepare('SELECT reconciling, updated_at FROM seed_days WHERE day=?')
      .bind(r.day).first<{ reconciling: number; updated_at: number }>();
    if (latch?.reconciling === 1 && latch.updated_at >= now() - RECONCILE_STALE_MS) continue;
    out.push({ day: r.day, batchId: r.batch_id });
  }
  return out;
}

/** Watchdog alert: email (once per day) which provider scopes are terminally
 *  failed for the current window. Reuses the seed_digest_incomplete guard table
 *  (one row per day) now that the old per-provider digest watchdog is gone. */
export async function alertFailedUnits(env: Env, nowMs: number = Date.now()): Promise<void> {
  const windowStart = addDaysWarsaw(warsawDateOf(nowMs), -1);
  const { results } = await env.DB
    .prepare(
      `SELECT day, provider, COUNT(*) n FROM seed_units
        WHERE status='failed' AND attempts >= ? AND day >= ?
        GROUP BY day, provider ORDER BY day`,
    )
    .bind(MAX_UNIT_ATTEMPTS, windowStart)
    .all<{ day: string; provider: string; n: number }>();
  if (!results || results.length === 0) return;
  const byDay = new Map<string, string[]>();
  for (const r of results) {
    const arr = byDay.get(r.day) ?? [];
    arr.push(`${r.provider}×${r.n}`);
    byDay.set(r.day, arr);
  }
  for (const [day, providers] of byDay) {
    const guard = await env.DB
      .prepare('INSERT OR IGNORE INTO seed_digest_incomplete (day, sent_at) VALUES (?, ?)')
      .bind(day, nowMs)
      .run();
    if (Number(guard?.meta?.changes ?? 0) === 0) continue; // already alerted for this day
    await snitchReport(env, 'panperyskop/seed/unit-failed', 'failed', {
      data: { day, failed: providers.join(', ') },
      message: `Seed units terminally failed for ${day}: ${providers.join(', ')}`,
    });
  }
}
