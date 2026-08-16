-- Queue-based seed pipeline: per-batch + per-candidate tracking with DLQ visibility.
-- seed_batches tracks one full day's seed; seed_candidates tracks each candidate
-- through fetch → dedupe → ingest, with status/reason for DLQ-style audit.

CREATE TABLE IF NOT EXISTS seed_batches (
  id         TEXT PRIMARY KEY,
  day        TEXT NOT NULL,           -- 'YYYY-MM-DD'
  run_type   TEXT NOT NULL,           -- 'cron' | 'manual'
  status     TEXT NOT NULL DEFAULT 'created',  -- created|fetching|fetch_done|ingesting|done|failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seed_batches_day ON seed_batches(day);

CREATE TABLE IF NOT EXISTS seed_candidates (
  id          TEXT PRIMARY KEY,       -- uuid per candidate run
  batch_id    TEXT NOT NULL REFERENCES seed_batches(id),
  provider    TEXT NOT NULL,          -- going|kupbilecik|dzisapp|eventylive
  external_id TEXT NOT NULL,
  title       TEXT,
  start_ms    INTEGER,
  lat         REAL, lng REAL,
  city        TEXT, venue TEXT, address TEXT,
  link        TEXT, media_url TEXT, thumb_url TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending|ready|no_media|duplicate|ingesting|done|error
  reason      TEXT,                   -- why (dup/error/no_media)
  winner_id   TEXT,                   -- for duplicates: which candidate won
  post_id     TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seed_candidates_batch ON seed_candidates(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_seed_candidates_ext ON seed_candidates(external_id);
