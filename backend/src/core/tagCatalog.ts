// Combined tag catalog: the closed canonical vocabulary (from seed/core/tags) plus
// admin-created custom tags (admin_tags table). The app chips (/stories/tags) and
// the admin tag editor both use this union; admin-added tags flow through the same
// validation path as canonical ones.
import { CANONICAL_TAGS, TAG_LABELS } from '../seed/core/tags';

export interface TagEntry {
  id: string;
  label: string;
}

export async function tagCatalog(db: D1Database): Promise<TagEntry[]> {
  const rows = await db.prepare('SELECT id, label FROM admin_tags ORDER BY label').all<{ id: string; label: string }>();
  return [...CANONICAL_TAGS.map((id) => ({ id, label: TAG_LABELS[id] })), ...(rows.results ?? [])];
}

export async function tagIdSet(db: D1Database): Promise<Set<string>> {
  const catalog = await tagCatalog(db);
  return new Set(catalog.map((t) => t.id));
}
