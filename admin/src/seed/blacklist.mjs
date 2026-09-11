// Event blacklist matching — mirror of backend seed/core/blacklist.ts. Runs as
// plain node on the VPS (no tsx), so the shared matcher is duplicated here
// rather than imported from the TS backend.

const TOKEN_RE = /[a-z0-9\u0430-\u044f\u0456\u0454\u0491]+/g;
const BL_STOP = new Set(['w', 'i', 'na', 'z', 'do', 'o', 'a', 'the', 'and', 'or', 'vs', '2026', '2025', '2024', 'poznan', 'warszawa', 'poland', 'polska', 'bilety', 'bilet', 'jest', 'tak', 'nie', 'sala', 'hala', 'pozn', 'kino', 'nad', 'seans', 'seansy', 'premiera', 'dnia', 'czesc']);

export function blFold(s) {
  return String(s || '').normalize('NFC').toLowerCase().replaceAll('ł', 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function blTokens(s) {
  const w = (blFold(s).match(TOKEN_RE) || []);
  return [...new Set(w.filter((x) => x.length >= 3 && !BL_STOP.has(x)))];
}

export function blContain(a, b) {
  if (!a.length || !b.length) return false;
  const bs = new Set(b);
  let shared = 0;
  for (const w of a) if (bs.has(w)) shared++;
  return shared >= 1 && shared / Math.min(a.length, b.length) >= 0.8;
}

function blLcs(A, B) {
  const dp = new Array(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i++) {
    let prevDiag = 0;
    for (let j = 1; j <= B.length; j++) {
      const save = dp[j];
      dp[j] = A[i - 1] === B[j - 1] ? prevDiag + 1 : Math.max(dp[j], dp[j - 1]);
      prevDiag = save;
    }
  }
  return dp[B.length];
}

export function blSeqRatio(a, b) {
  const A = blFold(a).replace(/[^a-z0-9\u0430-\u044f\u0456\u0454\u0491]+/g, ' ');
  const B = blFold(b).replace(/[^a-z0-9\u0430-\u044f\u0456\u0454\u0491]+/g, ' ');
  const n = 2 * blLcs(A, B);
  return A.length + B.length ? n / (A.length + B.length) : 1;
}

/** A rule is an AND of (pattern containment, venue fuzzy-match, partner exact). */
export function blMatch(rule, entry) {
  const hasPattern = !!(rule.pattern && rule.pattern.trim());
  const hasVenue = !!(rule.venue && rule.venue.trim());
  const hasPartner = !!(rule.partner_id && String(rule.partner_id).trim());
  if (!hasPattern && !hasPartner) return false;
  if (hasPattern && !blContain(blTokens(rule.pattern), blTokens(entry.title || entry.description || ''))) return false;
  if (hasVenue && !(entry.venue && blSeqRatio(rule.venue, entry.venue) >= 0.8)) return false;
  if (hasPartner && String(entry.partner_id || '') !== String(rule.partner_id).trim()) return false;
  return true;
}

/** First matching rule, or null. */
export function findBlacklistRule(rules, entry) {
  for (const r of rules) {
    if (r && blMatch(r, entry)) return r;
  }
  return null;
}