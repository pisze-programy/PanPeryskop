-- Dashboard support: share events (full per-day chart), auth/login events
-- (logins & signups per day), and admin login rate-limiting (anti brute-force).

-- Full share events: one row per share action with timestamp.
CREATE TABLE IF NOT EXISTS shares (
  post_id   TEXT NOT NULL REFERENCES posts(id),
  user_id   TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shares_created ON shares(created_at);
CREATE INDEX IF NOT EXISTS idx_shares_post ON shares(post_id, created_at);

-- Auth events (login/logout/register) for per-day activity charts.
CREATE TABLE IF NOT EXISTS auth_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  device_id  TEXT,
  event      TEXT NOT NULL,          -- 'login' | 'logout' | 'register'
  provider   TEXT,                   -- 'device' | 'apple' | 'google'
  success    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth_events(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_event ON auth_events(event, created_at);

-- Admin login attempts (rate-limit per IP).
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  ip         TEXT NOT NULL,
  attempted_at INTEGER NOT NULL,
  success    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip ON admin_login_attempts(ip, attempted_at);
