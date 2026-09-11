// Pure date helpers for the seed ingest. Deterministic: `now` is a parameter,
// never read internally.
//
// warsawMidnightMs mirrors backend/src/seed/core/dates.ts — the FIRST instant
// whose Europe/Warsaw calendar date is `isoDate` (i.e. Warsaw midnight). Uses
// formatToParts (not en-CA short-date) because Node 24 stopped rendering en-CA
// as ISO, which broke the old `fmt.format()` comparison.

function warsawYmd(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** '2026-08-05' → unix ms of 00:00 Europe/Warsaw (2026-08-04T22:00:00Z in CEST). */
export function warsawMidnightMs(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  while (warsawYmd(t) === isoDate) t -= 3_600_000;
  return t + 3_600_000;
}

/** Manifest created_at → unix ms. Date-only resolves to Warsaw midnight; full
 *  timestamps parse as-is. Throws on unparseable strings. */
export function parseCreatedAt(value, now) {
  if (typeof value !== 'string') return now;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return warsawMidnightMs(value);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Invalid created_at: ${value}`);
  return ms;
}