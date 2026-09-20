-- Shortlink redirects. The server mints a token inside a natural product call
-- (a booking link or a place link), so a click is measured without the app
-- calling any analytics endpoint. No user or device identifier is stored.
CREATE TABLE IF NOT EXISTS redirect_tokens (
  token          TEXT PRIMARY KEY,
  kind           TEXT NOT NULL,
  target_url     TEXT NOT NULL,
  target_host    TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  hits           INTEGER NOT NULL DEFAULT 0,
  last_hit_ms    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_redirect_expiry ON redirect_tokens(expires_at);

CREATE TABLE IF NOT EXISTS click_events (
  id          TEXT PRIMARY KEY,
  token       TEXT NOT NULL,
  kind        TEXT NOT NULL,
  target_host TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_click_events_created ON click_events(created_at);
CREATE INDEX IF NOT EXISTS idx_click_events_token ON click_events(token, created_at);
