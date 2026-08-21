-- Admin sold-out & event-hour overrides survive re-seeds: when locked, doSavePost
-- keeps the manually set is_sold_out / showtimes instead of overwriting from the
-- provider (same pattern as geo_locked / tags_locked).
ALTER TABLE posts ADD COLUMN sold_out_locked INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN time_locked INTEGER DEFAULT 0;

-- Persisted display order for tag filter chips (canonical ∪ custom). A tag
-- missing from tag_order falls back to the default order (canonical first, then
-- label). The admin tags page edits it via drag & drop.
CREATE TABLE IF NOT EXISTS tag_order (
  tag_id   TEXT PRIMARY KEY,
  position INTEGER NOT NULL
);
