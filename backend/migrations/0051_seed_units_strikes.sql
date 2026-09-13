-- Per-unit retry circuit breaker for the v2 seed pipeline. `attempts` bounds the
-- retries WITHIN one seed run; `strikes` counts how many refills have ended with
-- the unit failed. The producer stops re-opening a unit once strikes reach the
-- cap, so a permanently broken provider scope cannot burn proxy bytes forever.
ALTER TABLE seed_units ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0;
