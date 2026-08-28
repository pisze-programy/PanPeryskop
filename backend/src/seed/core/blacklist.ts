// Event blacklist matching — the SAME title-normalization primitives as dedupe
// (match.ts), so the admin's "add to blacklist" behaves exactly like the dedupe
// fuzzy matcher. A rule is an AND of its parts:
//   pattern   — title tokens contained in the candidate title (containment ≥ 0.8)
//   venue     — fuzzy venue match (seqRatio ≥ 0.8), optional
//   partnerId — exact organizer match (goingapp partner_id), optional
// At least one of (pattern, partnerId) must be set; an empty rule never matches.
import { SeedCandidate } from './types';
import { containment, titleTokens, venuesClose } from './match';

export interface BlacklistRule {
  id: string;
  pattern: string;
  venue: string;
  partnerId: string;
  partnerName: string;
  active: boolean;
}

export interface BlacklistCand {
  title: string;
  venue: string;
  partnerId?: string | null;
}

/** Row from the event_blacklist table → normalized rule ('' for null parts). */
export function ruleFromRow(r: {
  pattern?: string | null; venue?: string | null;
  partner_id?: string | null; partner_name?: string | null;
}): Omit<BlacklistRule, 'id' | 'active'> {
  return {
    pattern: r.pattern ?? '',
    venue: r.venue ?? '',
    partnerId: r.partner_id ?? '',
    partnerName: r.partner_name ?? '',
  };
}

export function blacklistMatch(rule: { pattern: string; venue: string; partnerId: string }, cand: BlacklistCand): boolean {
  const hasPattern = rule.pattern.trim().length > 0;
  const hasVenue = rule.venue.trim().length > 0;
  const hasPartner = rule.partnerId.trim().length > 0;
  if (!hasPattern && !hasPartner) return false;
  if (hasPattern && !containment(titleTokens(rule.pattern), titleTokens(cand.title, cand.venue))) return false;
  if (hasVenue && !venuesClose(rule.venue, cand.venue)) return false;
  if (hasPartner && String(cand.partnerId ?? '') !== rule.partnerId) return false;
  return true;
}

export function blacklistReason(rule: { pattern: string; partnerName: string }): string {
  const p = rule.pattern.trim();
  const o = rule.partnerName.trim();
  if (p && o) return `blacklist: ${p} / ${o}`;
  if (p) return `blacklist: ${p}`;
  if (o) return `blacklist: ${o}`;
  return 'blacklist';
}

/** First ACTIVE rule that matches, or null. */
export function findBlacklist(rules: BlacklistRule[], cand: BlacklistCand): BlacklistRule | null {
  for (const r of rules) {
    if (!r.active) continue;
    if (blacklistMatch(r, cand)) return r;
  }
  return null;
}

export async function loadBlacklistRules(db: D1Database): Promise<BlacklistRule[]> {
  const { results } = await db
    .prepare('SELECT id, pattern, venue, partner_id, partner_name, active FROM event_blacklist')
    .all<{ id: string; pattern: string | null; venue: string | null; partner_id: string | null; partner_name: string | null; active: number | null }>();
  return (results ?? []).map((r) => ({ id: r.id, active: r.active !== 0, ...ruleFromRow(r) }));
}

export type { SeedCandidate };
