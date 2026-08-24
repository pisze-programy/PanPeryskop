-- Guard for the "day incomplete" watchdog email (separate from seed_digest_done
-- so a late-completing day can still fire the success email afterwards).
CREATE TABLE IF NOT EXISTS seed_digest_incomplete (
  day      TEXT    PRIMARY KEY,
  sent_at  INTEGER NOT NULL
);
