-- Parallel seed: fetch messages are split per scope (city / category) so many
-- queue consumers run concurrently. Track per-scope completion (providers_*
-- columns remain for dashboard compatibility).
ALTER TABLE seed_batches ADD COLUMN scopes_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE seed_batches ADD COLUMN scopes_done INTEGER NOT NULL DEFAULT 0;

-- Which scope (city/category) produced each candidate, for per-scope idempotency.
ALTER TABLE seed_candidates ADD COLUMN scope TEXT;

-- Legacy venue geo cache table (the retired eventylive provider was its only
-- writer). Dropped in 0043_drop_seed_venue_cache.sql; kept here untouched as
-- migration history.
CREATE TABLE IF NOT EXISTS seed_venue_cache (
  venue_name TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seed_venue_cache_day ON seed_venue_cache(day);

