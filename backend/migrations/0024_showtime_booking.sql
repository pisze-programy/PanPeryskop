-- Per-showtime booking identity for cinema events (helios/cinemacity/multikino).
-- JSON array of {time, kind, params} — the client composes the deep booking URL
-- on the fly; full links are never stored. NULL when unknown or non-cinema.
ALTER TABLE posts ADD COLUMN showtime_booking TEXT;
ALTER TABLE seed_candidates ADD COLUMN showtime_booking TEXT;
