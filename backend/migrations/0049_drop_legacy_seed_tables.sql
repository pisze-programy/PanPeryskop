-- Seed v2 cleanup: drop the legacy per-candidate / per-scope tables. The v2
-- pipeline uses seed_units (durable work-list), seed_raw (staging), seed_days
-- (per-day latch/gen); seed_batches / seed_runs stay only as audit anchors.
DROP TABLE IF EXISTS seed_candidates;
DROP TABLE IF EXISTS seed_scopes;
