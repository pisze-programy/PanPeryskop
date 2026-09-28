CREATE TABLE IF NOT EXISTS image_cache (
  cache_key  TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_image_cache_expires ON image_cache(expires_at);
