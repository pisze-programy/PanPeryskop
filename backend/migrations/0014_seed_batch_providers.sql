-- Track provider completion per seed batch (used to trigger dedupe once all
-- providers have finished fetching).
ALTER TABLE seed_batches ADD COLUMN providers_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE seed_batches ADD COLUMN providers_done INTEGER NOT NULL DEFAULT 0;
