// Venue-based auto-tagger: when a candidate carries no tag, a small set of
// canonical venue rules tries to assign one (e.g. "Teatr" in the venue name →
// Teatr, "Kino Luna" → always Filmy). Rules resolve to CANONICAL_TAGS ids; if a
// resolved tag was deleted from the catalog, the rule is skipped with a warning.
import { diacriticFold } from './match';
import { tagIdSet } from '../../core/tagCatalog';

const VENUE_TAG_RULES: ReadonlyArray<{ re: RegExp; tag: string }> = [
  { re: /kino\s*luna/i, tag: 'filmy' }, // "Kino Luna" w nazwie miejsca → zawsze Filmy
  { re: /teatr/i, tag: 'teatr' },       // "Teatr" w nazwie miejsca → wysokie prawdopodobieństwo Teatr
];

/** Deterministic venue-name → canonical tag (null when no rule matches). */
export function venueTagId(venue: string | null | undefined): string | null {
  if (!venue) return null;
  const v = diacriticFold(venue).toLowerCase();
  for (const { re, tag } of VENUE_TAG_RULES) if (re.test(v)) return tag;
  return null;
}

/**
 * Final tags for a candidate about to be saved: keeps existing tags; when the
 * candidate has none, applies the venue auto-tagger. A rule that resolves to a
 * tag missing from the live catalog (deleted) logs a warning and is skipped.
 */
export async function finalCandidateTags(
  tagSet: Set<string>,
  c: { venue?: string | null; tags?: string[] | null },
): Promise<string[]> {
  const current = c.tags && c.tags.length ? [...new Set(c.tags)].sort() : [];
  if (current.length) return current;
  const tag = venueTagId(c.venue);
  if (!tag) return [];
  if (!tagSet.has(tag)) {
    console.warn(`auto-tagger: venue "${c.venue ?? ''}" → tag "${tag}" usunięty z katalogu — pomijam`);
    return [];
  }
  return [tag];
}

/** Live catalog set (canonical ∪ admin_tags) — fetch once per save site. */
export function loadTagSet(env: { DB: D1Database }): Promise<Set<string>> {
  return tagIdSet(env.DB);
}
