-- Travel events (Wycieczki): separate from `posts` — no TTL, no media R2, no moderation.
CREATE TABLE IF NOT EXISTS travel_events (
  provider    TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  city        TEXT NOT NULL,
  country     TEXT NOT NULL,
  start_ms    INTEGER NOT NULL,
  tag         TEXT NOT NULL,       -- travel tag: citybreak | pilka-nozna | biegi
  link        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (provider, external_id)
);
CREATE INDEX IF NOT EXISTS idx_travel_events_bbox ON travel_events(lat, lng, start_ms);