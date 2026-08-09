CREATE TABLE IF NOT EXISTS media_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_requests_bbox ON media_requests(lat, lng, created_at);
CREATE INDEX IF NOT EXISTS idx_media_requests_user ON media_requests(user_id, created_at);
