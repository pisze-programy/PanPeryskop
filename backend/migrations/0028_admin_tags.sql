-- Admin-created tags (custom, beyond the closed canonical vocabulary). Stored
-- per-event in posts.tags like any other tag; /stories/tags and the admin tag
-- editor expose the union (canonical ∪ admin_tags).
CREATE TABLE IF NOT EXISTS admin_tags (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
