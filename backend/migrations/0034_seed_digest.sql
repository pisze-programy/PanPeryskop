-- Seed digest: per-provider daily job status for the admin email digest
-- (cf-snitch). One row per (day, provider) — UNIQUE dedupes retries/DLQ so a
-- provider is reported once per day. `day` is the far-edge seed day (today+6).
CREATE TABLE IF NOT EXISTS seed_digest (
  day         TEXT    NOT NULL,
  provider    TEXT    NOT NULL,
  status      TEXT    NOT NULL,            -- ok | partial | failed
  candidates  INTEGER NOT NULL DEFAULT 0,
  ingested    INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  message     TEXT,
  reported_at INTEGER NOT NULL,
  PRIMARY KEY (day, provider)
);

-- Guards the "day done" / "day incomplete" emails: one row per day → sent once.
CREATE TABLE IF NOT EXISTS seed_digest_done (
  day      TEXT    PRIMARY KEY,
  sent_at  INTEGER NOT NULL
);
