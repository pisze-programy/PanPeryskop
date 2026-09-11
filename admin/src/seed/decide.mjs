// Pure per-entry decision: what to do with a manifest entry. No I/O, no env,
// no Date.now() — everything needed comes in via ctx. Deterministic and
// unit-testable without mocks.
import { findBlacklistRule } from './blacklist.mjs';
import { parseCreatedAt } from './dates.mjs';

/**
 * ctx = {
 *   force,                // --force: reprocess entries already marked done
 *   rejectedIds,          // Set<string>
 *   existingIds,          // Set<string> (empty when force)
 *   blacklist,            // [{pattern, venue, partner_id, partner_name}]
 *   now, ttlMs, maxLookaheadMs,
 * }
 *
 * Returns one of:
 *   { action: 'skip',  reason: 'done'|'blacklisted'|'rejected', rule? }
 *   { action: 'existing', affiliateLink: boolean }
 *   { action: 'error', error: string }          // invalid entry — mark status 'error'
 *   { action: 'upload', createdAt: number }     // go upload
 */
export function decide(entry, ctx) {
  const rejectedIds = ctx.rejectedIds ?? new Set();
  const existingIds = ctx.existingIds ?? new Set();
  const blacklist = ctx.blacklist ?? [];

  if (entry.status === 'done' && !ctx.force) return { action: 'skip', reason: 'done' };

  // Blacklist: terminal — never retried, never uploaded.
  const rule = findBlacklistRule(blacklist, entry);
  if (rule) return { action: 'skip', reason: 'blacklisted', rule };

  // Never resurrect a rejected post.
  if (rejectedIds.has(entry.external_id || '')) return { action: 'skip', reason: 'rejected' };

  // Already a post: leave untouched unless an affiliate link needs backfilling.
  if (existingIds.has(entry.external_id || '')) {
    return { action: 'existing', affiliateLink: !!entry.affiliate_link };
  }

  const error = validateEntry(entry, ctx);
  if (error) return { action: 'error', error };

  return { action: 'upload', createdAt: parseCreatedAt(entry.created_at, ctx.now) };
}

/** Pure validation of an entry before upload. Returns error message or null. */
export function validateEntry(entry, ctx) {
  if (!entry.external_id) return 'missing external_id';
  if (typeof entry.lat !== 'number' || typeof entry.lng !== 'number') return 'invalid lat/lng';
  let createdAt;
  try {
    createdAt = parseCreatedAt(entry.created_at, ctx.now);
  } catch (e) {
    return e.message;
  }
  if (createdAt < ctx.now - ctx.ttlMs) return 'created_at too far in the past';
  if (createdAt > ctx.now + ctx.maxLookaheadMs) return 'created_at too far in the future';
  return null;
}