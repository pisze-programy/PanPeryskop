-- Queue redesign, step 1: durable unit work-list + raw audit sink +
-- reconciliation failure queue. Written in shadow: nothing routes through these
-- tables yet. The producer (step 4) will fill seed_units; the Phase-1 sink
-- (step 5) will fill seed_raw; reconcile-day (step 6) will read both.

-- Durable unit work-list (the "Kafka-like" list): one row per
-- (day, provider, slice). pending → claimed → done|failed. CF consumers claim
-- via queue wake-ups; the VPS poller claims via UPDATE ... WHERE status='pending'
-- (exactly one winner). Lease expiry lets the watchdog redrive stuck units.
CREATE TABLE IF NOT EXISTS seed_units (
  id               TEXT PRIMARY KEY,   -- nanoid
  day              TEXT NOT NULL,      -- target event day 'YYYY-MM-DD'
  batch_id         TEXT NOT NULL REFERENCES seed_batches(id),
  provider         TEXT NOT NULL,
  slice            TEXT NOT NULL,      -- scope/cinema/category id
  executor         TEXT NOT NULL,      -- 'worker'|'vps' (who may claim it)
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending|claimed|done|failed
  attempts         INTEGER NOT NULL DEFAULT 0,
  claimed_by       TEXT,
  claimed_at       INTEGER,
  lease_expires_at INTEGER,
  rows_written     INTEGER NOT NULL DEFAULT 0,
  error            TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seed_units_uniq ON seed_units(day, provider, slice);
CREATE INDEX IF NOT EXISTS idx_seed_units_claim ON seed_units(status, executor, lease_expires_at);

-- Normalized, source-audited pre-reconcile rows (Phase 2 raw write). One row per
-- (day, provider, external_id); re-runs upsert by the unique key so a re-seed
-- refreshes content instead of duplicating it.
CREATE TABLE IF NOT EXISTS seed_raw (
  id                TEXT PRIMARY KEY,  -- nanoid, stable across re-runs
  day               TEXT NOT NULL,
  batch_id          TEXT NOT NULL REFERENCES seed_batches(id),
  unit_id           TEXT NOT NULL REFERENCES seed_units(id),
  provider          TEXT NOT NULL,
  external_id       TEXT NOT NULL,     -- <source>-<id>-<day>
  title             TEXT NOT NULL,
  title_tokens      TEXT NOT NULL,     -- folded token set, for grouping
  raw_venue         TEXT NOT NULL,
  city              TEXT,
  canonical_venue_id TEXT,             -- venues.id, stamped at raw-write
  start_min         INTEGER NOT NULL,  -- minutes from midnight: 14:00 vs 16:00 rule
  showtimes         TEXT,              -- JSON ["HH:MM",...]
  showtime_booking  TEXT,              -- JSON [{time,kind,params}]
  tags              TEXT,
  price_pln         REAL,
  media_url         TEXT, thumb_url TEXT,
  link_url          TEXT, booking_key TEXT,  -- booking_key = linkKey of the REAL page
  affiliate_link    TEXT,
  partner_id        TEXT, partner_name TEXT,
  is_sold_out       INTEGER NOT NULL DEFAULT 0,
  content_hash      TEXT NOT NULL,     -- sha1 of provider payload: idempotency + change detection
  status            TEXT NOT NULL DEFAULT 'raw',  -- raw|winner|duplicate|failure|ingesting|done|error
  winner_raw_id     TEXT,
  post_id           TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  reason            TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seed_raw_uniq ON seed_raw(day, provider, external_id);
CREATE INDEX IF NOT EXISTS idx_seed_raw_day_status ON seed_raw(day, status);
CREATE INDEX IF NOT EXISTS idx_seed_raw_venue ON seed_raw(canonical_venue_id);
CREATE INDEX IF NOT EXISTS idx_seed_raw_hash ON seed_raw(day, content_hash);

-- Rows reconcile-day could not decide (ambiguous group, locked post, exception).
-- Manual review in admin; retry_flag=1 means "reconsider on the next run".
CREATE TABLE IF NOT EXISTS reconciliation_failures (
  id         TEXT PRIMARY KEY,
  day        TEXT NOT NULL,
  batch_id   TEXT NOT NULL REFERENCES seed_batches(id),
  provider   TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title      TEXT,
  reason     TEXT NOT NULL,
  snapshot   TEXT NOT NULL,            -- loser JSON for manual review
  reviewed   INTEGER NOT NULL DEFAULT 0,
  retry_flag INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recon_failures_day ON reconciliation_failures(day, reviewed);
