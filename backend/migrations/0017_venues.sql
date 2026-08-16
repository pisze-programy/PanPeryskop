-- Persistent, shared venue geo store. Every seed provider (dzisapp, eventylive,
-- kupbilecik, going) upserts venue locations it discovers and reads back matches
-- via fuzzy name matching (venueStore.ts). Poland has a finite set of venues, so
-- this table fills up quickly and eliminates per-event venue page fetches.
CREATE TABLE IF NOT EXISTS venues (
  id          TEXT PRIMARY KEY,          -- venue_key = flat(normalized name)
  name        TEXT NOT NULL,             -- canonical name (first seen)
  aliases     TEXT NOT NULL DEFAULT '[]',-- JSON array: other spellings from providers
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  city        TEXT,
  sources     TEXT NOT NULL DEFAULT '{}',-- JSON map: provider -> reference (e.g. kupbilecik obiekt id)
  hit_count   INTEGER NOT NULL DEFAULT 0,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);

-- Provider-specific reference for deferred geo resolution (e.g. kupbilecik obiekt
-- id). Used after dedupe to resolve coordinates only for surviving candidates.
ALTER TABLE seed_candidates ADD COLUMN geo_ref TEXT;
