-- Persistent per-run seed logs (manual + cron). One row per provider run plus
-- a summary row with provider='total'. duration_ms = wall time, browser_ms =
-- Browser Run time consumed (sum of X-Browser-Ms-Used across quickActions).

CREATE TABLE IF NOT EXISTS seed_runs (
  id          TEXT PRIMARY KEY,
  run_type    TEXT NOT NULL,             -- 'manual' | 'cron'
  day         TEXT NOT NULL,             -- 'YYYY-MM-DD'
  provider    TEXT NOT NULL,             -- 'going' | 'kupbilecik' | 'total'
  transport   TEXT NOT NULL,             -- 'fetch' | 'browser'
  candidates  INTEGER NOT NULL DEFAULT 0,
  ingested    INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  error_detail TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  browser_ms  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seed_runs_created ON seed_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_seed_runs_day ON seed_runs(day);
