-- Structured showtimes for cinema events: a film can have multiple sessions per
-- day. JSON array of "HH:MM" strings (e.g. ["10:00","14:30","18:00"]), NULL when
-- unknown or single-time events.
ALTER TABLE posts ADD COLUMN showtimes TEXT;
ALTER TABLE seed_candidates ADD COLUMN showtimes TEXT;
