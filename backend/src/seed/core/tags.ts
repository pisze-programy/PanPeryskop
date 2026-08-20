// Canonical tag vocabulary + deterministic provider→tag normalization.
//
// Tags are a CLOSED set — a post carries an empty list or a subset of
// CANONICAL_TAGS. `normalizeTags` maps provider-specific values (categories,
// genre slugs, listing paths, title keywords) onto that set; anything ambiguous
// maps to NOTHING (never invents a new tag). The set grows over time by editing
// this one file.
import { ProviderId } from './types';
import { diacriticFold } from './match';

export const CANONICAL_TAGS = ['filmy', 'muzyka', 'meetup', 'komedia'] as const;
export type CanonicalTag = (typeof CANONICAL_TAGS)[number];
export const CANONICAL_TAG_SET: ReadonlySet<string> = new Set(CANONICAL_TAGS);

/** A tag string is canonical when it is one of the closed-set ids. */
export function isCanonicalTag(value: string): value is CanonicalTag {
  return CANONICAL_TAG_SET.has(value);
}

// Providers whose events are ALWAYS one canonical tag — cinema chains are films,
// meetup/luma are community gatherings.
const FORCED_TAGS: Partial<Record<ProviderId, CanonicalTag[]>> = {
  [ProviderId.HELIOS]: ['filmy'],
  [ProviderId.MULTIKINO]: ['filmy'],
  [ProviderId.CINEMACITY]: ['filmy'],
  [ProviderId.MEETUP]: ['meetup'],
  [ProviderId.LUMA]: ['meetup'],
};

// Deterministic raw-value → canonical tag. Keys are diacritic-folded, lowercased,
// whitespace/underscore collapsed to `-`. A value that matches no key is IGNORED.
const VALUE_TAGS: Record<string, CanonicalTag> = {
  // muzyka
  koncert: 'muzyka',
  koncerty: 'muzyka',
  muzyka: 'muzyka',
  music: 'muzyka',
  gig: 'muzyka',
  'festiwal-muzyczny': 'muzyka',
  // komedia
  komedia: 'komedia',
  komedie: 'komedia',
  kabaret: 'komedia',
  kabarety: 'komedia',
  standup: 'komedia',
  'stand-up': 'komedia',
  comedy: 'komedia',
  // filmy
  film: 'filmy',
  filmy: 'filmy',
  kino: 'filmy',
  seans: 'filmy',
  cinema: 'filmy',
  filmowa: 'filmy',
};

// Title-keyword heuristic for providers with no structured category (eventylive).
// Only used when there are no raw values to map. Deliberately small and specific.
const TITLE_KEYWORDS: Array<[string, CanonicalTag]> = [
  ['koncert', 'muzyka'],
  ['festiwalu muzyczn', 'muzyka'],
  ['dj set', 'muzyka'],
  ['stand-up', 'komedia'],
  ['standup', 'komedia'],
  ['kabaret', 'komedia'],
  ['komedia', 'komedia'],
  ['seans film', 'filmy'],
  ['premiera film', 'filmy'],
  ['kino', 'filmy'],
  ['seans', 'filmy'],
];

function keyOf(value: string): string {
  return diacriticFold(value)
    .toLowerCase()
    .trim()
    .split('?')[0]
    .replace(/^\/+|\/+$/g, '')
    .replace(/[\s_]+/g, '-');
}

/**
 * Deterministic mapping of a candidate to its canonical tag list (sorted, unique,
 * subset of CANONICAL_TAGS, possibly empty).
 */
export function normalizeTags(input: {
  source: ProviderId;
  rawTags?: Iterable<string | null | undefined>;
  title?: string;
}): string[] {
  const forced = FORCED_TAGS[input.source];
  if (forced) return forced;

  const out = new Set<CanonicalTag>();
  for (const raw of input.rawTags ?? []) {
    if (!raw) continue;
    const tag = VALUE_TAGS[keyOf(raw)];
    if (tag) out.add(tag);
  }

  if (out.size === 0 && input.title) {
    const title = diacriticFold(input.title).toLowerCase();
    for (const [kw, tag] of TITLE_KEYWORDS) {
      if (title.includes(kw)) {
        out.add(tag);
        break; // first title hint is enough — deterministic and conservative
      }
    }
  }

  return [...out].sort();
}
