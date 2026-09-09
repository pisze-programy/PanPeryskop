-- Flight data cache (Wycieczki): Ryanair farefinder responses keyed by request.
-- Avoids hammering ryanair.com (ban risk) — availabilities TTL ~24h, prices ~12h.
CREATE TABLE IF NOT EXISTS flight_cache (
  cache_key  TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flight_cache_expires ON flight_cache(expires_at);