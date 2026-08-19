-- UGC reporting (Apple guideline 1.2): users can flag content; the admin moderates
-- (reject post / ban device). Reports never auto-block content or users.
CREATE TABLE IF NOT EXISTS reports (
  id                TEXT PRIMARY KEY,
  post_id           TEXT NOT NULL REFERENCES posts(id),
  reporter_user_id  TEXT NOT NULL REFERENCES users(id),
  reason            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'resolved' | 'dismissed'
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_post ON reports(post_id);
