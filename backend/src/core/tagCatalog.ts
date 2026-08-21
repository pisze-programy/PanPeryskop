// Combined tag catalog: the closed canonical vocabulary (from seed/core/tags) plus
// admin-created custom tags (admin_tags table). The app chips (/stories/tags) and
// the admin tag editor both use this union; admin-added tags flow through the same
// validation path as canonical ones.
//
// Display order: tags with an explicit position in tag_order come first (sorted by
// position — the admin tags page reorders them via drag & drop); everything else
// falls back to the default order (canonical vocabulary in enum order, then custom
// tags alphabetically).
import { CANONICAL_TAGS, TAG_LABELS } from '../seed/core/tags';

export interface TagEntry {
  id: string;
  label: string;
}

export async function tagCatalog(db: D1Database): Promise<TagEntry[]> {
  const [customRows, orderRows] = await Promise.all([
    db.prepare('SELECT id, label FROM admin_tags ORDER BY label').all<{ id: string; label: string }>(),
    db.prepare('SELECT tag_id, position FROM tag_order').all<{ tag_id: string; position: number }>(),
  ]);
  const custom = [...(customRows.results ?? [])].sort((a, b) => a.label.localeCompare(b.label, 'pl'));
  const position = new Map((orderRows.results ?? []).map((r) => [r.tag_id, r.position]));
  const entries = [
    ...CANONICAL_TAGS.map((id) => ({ id, label: TAG_LABELS[id] })),
    ...custom,
  ];
  const fallbackRank = new Map(entries.map((e, i) => [e.id, i]));
  return entries
    .slice()
    .sort((a, b) => {
      const pa = position.get(a.id);
      const pb = position.get(b.id);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return (fallbackRank.get(a.id) ?? 0) - (fallbackRank.get(b.id) ?? 0);
    });
}

export async function tagIdSet(db: D1Database): Promise<Set<string>> {
  const catalog = await tagCatalog(db);
  return new Set(catalog.map((t) => t.id));
}
