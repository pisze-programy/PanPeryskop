// Event blacklist matching — the SAME title-normalization primitives as dedupe
// (match.ts), so the admin's "add to blacklist" behaves exactly like the dedupe
// fuzzy matcher. A rule is an AND of its parts:
//   pattern   — title, matched by `matchMode` (see below)
//   venue     — fuzzy venue match (seqRatio ≥ 0.8), optional
//   partnerId — exact organizer match (goingapp partner_id), optional
//   sources   — comma-separated provider ids the rule applies to, optional
// At least one of (pattern, partnerId) must be set; an empty rule never matches.
//
// matchMode:
//   'fuzzy' (default) — the pattern's tokens are contained in the candidate title
//                       (≥ 0.8). Greedy: a long pattern also matches a short title.
//   'exact'           — the folded titles must be EQUAL. This is the "concrete
//                       entry" mode: one exact title, nothing else. Use it for the
//                       recurring junk so a ban can never widen by accident.
//
// The source scope exists because a partner-scoped rule only fires for `going`
// (the one provider that carries an organizer id), so the same recurring junk from
// ebilet/eventim/kupbilecik was unstoppable. A source scope blocks it there while
// leaving a one-off event on another provider (meetup) alone.
import { SeedCandidate } from './types';
import { containment, titleTokens, venuesClose, flatNorm } from './match';

export type BlacklistMatchMode = 'fuzzy' | 'exact';

export interface BlacklistRule {
  id: string;
  pattern: string;
  venue: string;
  partnerId: string;
  partnerName: string;
  /** Comma-separated provider ids; '' = every source. */
  sources: string;
  /** 'fuzzy' (default) or 'exact'. */
  matchMode: BlacklistMatchMode;
  active: boolean;
}

export interface BlacklistCand {
  title: string;
  venue: string;
  partnerId?: string | null;
  /** Provider id of the candidate (posts.external_id prefix). '' = unknown. */
  source?: string | null;
}

/** Rule row → normalized rule ('' for null parts, 'fuzzy' for a null mode). */
export function ruleFromRow(r: {
  pattern?: string | null; venue?: string | null;
  partner_id?: string | null; partner_name?: string | null;
  sources?: string | null; match_mode?: string | null;
}): Omit<BlacklistRule, 'id' | 'active'> {
  return {
    pattern: r.pattern ?? '',
    venue: r.venue ?? '',
    partnerId: r.partner_id ?? '',
    partnerName: r.partner_name ?? '',
    sources: r.sources ?? '',
    matchMode: r.match_mode === 'exact' ? 'exact' : 'fuzzy',
  };
}

/** The provider ids a rule is limited to. Empty = every source. */
export function ruleSources(sources: string): string[] {
  return sources.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function blacklistMatch(
  rule: { pattern: string; venue: string; partnerId: string; sources?: string; matchMode?: string },
  cand: BlacklistCand
): boolean {
  const hasPattern = rule.pattern.trim().length > 0;
  const hasVenue = rule.venue.trim().length > 0;
  const hasPartner = rule.partnerId.trim().length > 0;
  if (!hasPattern && !hasPartner) return false;
  const scope = ruleSources(rule.sources ?? '');
  if (scope.length > 0 && !scope.includes(String(cand.source ?? '').trim().toLowerCase())) return false;
  if (hasPattern) {
    const ok = rule.matchMode === 'exact'
      ? flatNorm(rule.pattern) === flatNorm(cand.title)
      : containment(titleTokens(rule.pattern), titleTokens(cand.title, cand.venue));
    if (!ok) return false;
  }
  if (hasVenue && !venuesClose(rule.venue, cand.venue)) return false;
  if (hasPartner && String(cand.partnerId ?? '') !== rule.partnerId) return false;
  return true;
}

export function blacklistReason(rule: { pattern: string; partnerName: string; sources?: string; matchMode?: string }): string {
  const p = rule.pattern.trim();
  const o = rule.partnerName.trim();
  const s = ruleSources(rule.sources ?? '').join(',');
  const head = p && o ? `blacklist: ${p} / ${o}` : p ? `blacklist: ${p}` : o ? `blacklist: ${o}` : 'blacklist';
  const exact = rule.matchMode === 'exact' ? ' =' : '';
  return s ? `${head}${exact} [${s}]` : `${head}${exact}`;
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
    .prepare('SELECT id, pattern, venue, partner_id, partner_name, sources, match_mode, active FROM event_blacklist')
    .all<{ id: string; pattern: string | null; venue: string | null; partner_id: string | null; partner_name: string | null; sources: string | null; match_mode: string | null; active: number | null }>();
  return (results ?? []).map((r) => ({ id: r.id, active: r.active !== 0, ...ruleFromRow(r) }));
}

export type { SeedCandidate };
