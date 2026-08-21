-- Admin users page: per-user auth lookups + activity filters.
CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);
