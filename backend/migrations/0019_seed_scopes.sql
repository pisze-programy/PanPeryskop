-- Per-scope seed state machine (replaces the fragile global scopes_done counter).
-- One row per (batch, provider, scope) fetch unit. Batch completion = ALL scopes in
-- a terminal state (done|failed) — a dead-lettered scope is marked failed by the
-- DLQ re-drive consumer instead of silently leaving the batch hanging in 'fetching'.
-- `attempts` bounds the DLQ re-drive loop (re-enqueue → failed) so a poison scope
-- can never spin the queue forever.

CREATE TABLE IF NOT EXISTS seed_scopes (
  id         TEXT PRIMARY KEY,
  batch_id   TEXT NOT NULL REFERENCES seed_batches(id),
  provider   TEXT NOT NULL,
  scope      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending|running|done|failed
  attempts   INTEGER NOT NULL DEFAULT 0,        -- DLQ re-drive count
  error      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seed_scopes_uniq ON seed_scopes(batch_id, provider, scope);
CREATE INDEX IF NOT EXISTS idx_seed_scopes_batch_status ON seed_scopes(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_seed_scopes_created ON seed_scopes(created_at);

-- Visible failure reason on a batch (watchdog/DLQ), surfaced in the dashboard.
ALTER TABLE seed_batches ADD COLUMN reason TEXT;
