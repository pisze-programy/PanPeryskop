-- Event blacklist: title/venue/organizer patterns dropped at seed ingest.
-- A rule matches when its pattern tokens are contained in the event title AND
-- (venue, if set) fuzzily matches the event venue AND (partner_id, if set)
-- equals the event's organizer. At least one of (pattern, partner_id) is required.
CREATE TABLE IF NOT EXISTS event_blacklist (
  id           TEXT PRIMARY KEY,
  pattern      TEXT NOT NULL DEFAULT '',
  venue        TEXT,
  partner_id   TEXT,
  partner_name TEXT,
  note         TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL,
  created_by   TEXT
);

-- Organizer carried from goingapp (Algolia partner_id/partner_name) so the
-- blacklist matcher and the admin UI can combine title + organizer.
ALTER TABLE posts ADD COLUMN partner_id TEXT;
ALTER TABLE posts ADD COLUMN partner_name TEXT;
ALTER TABLE seed_candidates ADD COLUMN partner_id TEXT;
ALTER TABLE seed_candidates ADD COLUMN partner_name TEXT;
