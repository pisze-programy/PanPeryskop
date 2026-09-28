CREATE TABLE IF NOT EXISTS content_pages (
  origin_id    TEXT PRIMARY KEY,
  slug         TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_pages_updated ON content_pages(updated_at);

CREATE TABLE IF NOT EXISTS stay_cache (
  cache_key  TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stay_cache_expires ON stay_cache(expires_at);
