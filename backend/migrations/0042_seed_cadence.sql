-- Seed cadence marker: last full-window refill (SEED_INTERVAL_DAYS). Warms and
-- the VPS orchestrator read it via GET /admin/seed/cadence to run only on seed days.
CREATE TABLE IF NOT EXISTS seed_cadence (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);