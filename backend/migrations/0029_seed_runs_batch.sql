-- Link seed_runs rows to the batch they belong to (queue pipeline), so the seed
-- page can show each batch's scope runs grouped together.
ALTER TABLE seed_runs ADD COLUMN batch_id TEXT;
CREATE INDEX IF NOT EXISTS idx_seed_runs_batch ON seed_runs(batch_id);
