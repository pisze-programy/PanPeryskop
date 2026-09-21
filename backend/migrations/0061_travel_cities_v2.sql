-- City-break destinations, rebuilt from the Nomads.com list. The old Eurostat
-- table is replaced, so the schema is dropped and recreated.
DROP TABLE IF EXISTS travel_cities;
CREATE TABLE travel_cities (
  id              TEXT PRIMARY KEY,   -- Nomads.com long slug, e.g. lisbon-portugal
  name            TEXT NOT NULL,      -- English name
  name_pl         TEXT NOT NULL,      -- Polish name
  country         TEXT NOT NULL,
  country_code    TEXT NOT NULL,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  band_rank       INTEGER NOT NULL,   -- 1 = the most expensive band
  cost_usd        INTEGER NOT NULL,   -- cost_for_local_usd_per_month
  population      INTEGER NOT NULL DEFAULT 0,
  airports        TEXT NOT NULL DEFAULT '[]',
  image_url       TEXT NOT NULL DEFAULT '',
  image_large_url TEXT NOT NULL DEFAULT '',
  video_url       TEXT,
  nearby          TEXT NOT NULL DEFAULT '[]',
  next            TEXT NOT NULL DEFAULT '[]',
  similar         TEXT NOT NULL DEFAULT '[]',
  facts           TEXT NOT NULL DEFAULT '{}',
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_travel_cities_band ON travel_cities(band_rank);
CREATE INDEX IF NOT EXISTS idx_travel_cities_name_pl ON travel_cities(name_pl);
