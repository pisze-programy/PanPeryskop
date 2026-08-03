CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  device_id     TEXT NOT NULL UNIQUE,
  session_token TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  description   TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending',
  media_key     TEXT,
  thumb_key     TEXT,
  duration_ms   INTEGER,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  likes_count   INTEGER NOT NULL DEFAULT 0,
  views_count   INTEGER NOT NULL DEFAULT 0,
  shares_count  INTEGER NOT NULL DEFAULT 0,
  grid_cell_id  TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_bbox ON posts(lat, lng, expires_at, status);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at);

CREATE TABLE IF NOT EXISTS views (
  user_id   TEXT NOT NULL REFERENCES users(id),
  post_id   TEXT NOT NULL REFERENCES posts(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS likes (
  user_id   TEXT NOT NULL REFERENCES users(id),
  post_id   TEXT NOT NULL REFERENCES posts(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS grid_cells (
  id   TEXT PRIMARY KEY,
  lat  REAL NOT NULL,
  lng  REAL NOT NULL,
  heat INTEGER NOT NULL DEFAULT 0
);
