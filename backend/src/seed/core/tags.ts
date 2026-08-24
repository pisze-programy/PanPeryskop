// Canonical tag vocabulary + display labels.
//
// Tags are a CLOSED set — a post carries an empty list or a subset of
// CANONICAL_TAGS. Tags are assigned at seed time ONLY from the certain, explicit
// source type (cinema chains → filmy, meetup/luma → meetup) — see the provider
// candidate builders. Everything else is left UNTAGGED on purpose: better no tag
// than a wrong one (the admin or the facebook ingest assigns tags manually).
// This file intentionally has NO tag-normalization heuristics anymore.
export const CANONICAL_TAGS = ['filmy', 'muzyka', 'meetup', 'komedia', 'teatr', 'sport', 'atrakcje', 'inne'] as const;
export type CanonicalTag = (typeof CANONICAL_TAGS)[number];
export const CANONICAL_TAG_SET: ReadonlySet<string> = new Set(CANONICAL_TAGS);

/** Display labels for the canonical tags (single source of truth — admin + API). */
export const TAG_LABELS: Record<string, string> = {
  filmy: 'Filmy',
  muzyka: 'Muzyka',
  meetup: 'Meetup',
  komedia: 'Komedia',
  teatr: 'Teatr',
  sport: 'Sport',
  atrakcje: 'Atrakcje',
  inne: 'Inne',
};

export function tagLabel(id: string): string {
  return TAG_LABELS[id] ?? id;
}

/** A tag string is canonical when it is one of the closed-set ids. */
export function isCanonicalTag(value: string): value is CanonicalTag {
  return CANONICAL_TAG_SET.has(value);
}
