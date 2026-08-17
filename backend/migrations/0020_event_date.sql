-- Day-browser support: pins on the map per event day (Europe/Warsaw, YYYY-MM-DD).
-- Derived at write time in doSavePost (from created_at = 06:00 Warsaw of the event
-- day). Only events get a value (external_id present); live posts stay NULL so the
-- day filter never matches them. The index serves the bbox + day map query.
ALTER TABLE posts ADD COLUMN event_date TEXT;
CREATE INDEX IF NOT EXISTS idx_posts_event_date ON posts(event_date, lat, lng);
