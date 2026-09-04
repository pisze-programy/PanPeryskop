-- Phase-1 sink needs canonical venue rows even when a provider reports no
-- coordinates (e.g. ebilet venue names resolved later via Nominatim). SQLite
-- cannot ALTER a column to drop NOT NULL, so rebuild the table with nullable
-- lat/lng. Geo readers ignore NULL rows (see venueStore.ts), so no resolution
-- path can return null coordinates. INSERT OR IGNORE makes a retried partial
-- migration safe (the journal records 0040 only on full success).
CREATE TABLE IF NOT EXISTS venues_new (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  aliases     TEXT NOT NULL DEFAULT '[]',
  lat         REAL,
  lng         REAL,
  city        TEXT,
  sources     TEXT NOT NULL DEFAULT '{}',
  hit_count   INTEGER NOT NULL DEFAULT 0,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
INSERT OR IGNORE INTO venues_new (id, name, aliases, lat, lng, city, sources, hit_count, first_seen, last_seen, created_at)
  SELECT id, name, aliases, lat, lng, city, sources, hit_count, first_seen, last_seen, created_at FROM venues;
DROP TABLE venues;
ALTER TABLE venues_new RENAME TO venues;
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);
