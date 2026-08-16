-- Speed up the 4-day audit cleanup (pruneSeedData deletes by created_at) and the
-- daily venue upserts/reads. Without these the cleanup would scan the whole table.
CREATE INDEX IF NOT EXISTS idx_seed_candidates_created ON seed_candidates(created_at);
CREATE INDEX IF NOT EXISTS idx_seed_runs_created ON seed_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_seed_batches_created ON seed_batches(created_at);
