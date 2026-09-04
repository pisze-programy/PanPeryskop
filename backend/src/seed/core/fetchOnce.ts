// Fetch discipline for partner APIs. Two origins taught us hard lessons:
// - kupbilecik.pl answers HTTP 200 with 90 bytes of Polish block text after too
//   many requests ("...zablokowana na 24h..."). res.ok is NOT enough.
// - TradeDoubler answers HTTP 429 with a quota JSON after 3 downloads of one
//   file version in 24h.
// Rule: fetch once per source per day, then ALWAYS validate the body before
// storing or parsing it. A block/empty/garbage body is an error, never data.

/** The origin refused with a rate-limit block. Retry tomorrow, not today. */
export class SourceBlockedError extends Error {
  constructor(
    public readonly source: string,
    public readonly detail: string,
  ) {
    super(`${source} blocked: ${detail}`);
    this.name = 'SourceBlockedError';
  }
}

/** The origin answered with an empty body. Nothing to store. */
export class SourceEmptyError extends Error {
  constructor(public readonly source: string) {
    super(`${source} answered with an empty body`);
    this.name = 'SourceEmptyError';
  }
}

/** The body is not the JSON shape we asked for. Never store it as data. */
export class SourceShapeError extends Error {
  constructor(
    public readonly source: string,
    public readonly detail: string,
  ) {
    super(`${source} unexpected body: ${detail}`);
    this.name = 'SourceShapeError';
  }
}

// Known "slow down" markers. kupbilecik's block arrives as HTTP 200 with Polish
// text; TradeDoubler's as HTTP 429 with a quota JSON. Match case-insensitively.
const BLOCKED_MARKERS = [
  'zablokowana na 24h', // kupbilecik.pl 24h frequency block
  'zbyt dużą częstotliwość', // same block, second half
  'request quota exceeded', // TradeDoubler 429 body
  'too many requests', // generic 429 body
];

/** Returns the matched block marker, or null when the body looks like data. */
export function detectBlockedBody(text: string): string | null {
  const lower = (text || '').toLowerCase();
  for (const marker of BLOCKED_MARKERS) {
    if (lower.includes(marker)) return marker;
  }
  return null;
}

/**
 * Validate one fetched body and parse it. Throws SourceBlockedError /
 * SourceEmptyError / SourceShapeError — never returns garbage.
 * `isValid` checks the parsed shape (e.g. "has an events array").
 */
export function parseFeedJson<T>(text: string, source: string, isValid: (v: unknown) => v is T): T {
  if (!text || !text.trim()) throw new SourceEmptyError(source);
  const blocked = detectBlockedBody(text);
  if (blocked) throw new SourceBlockedError(source, `matched "${blocked}"`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SourceShapeError(source, `not JSON (first 60 chars: ${JSON.stringify(text.slice(0, 60))})`);
  }
  if (!isValid(parsed)) throw new SourceShapeError(source, 'missing expected top-level list');
  return parsed;
}
