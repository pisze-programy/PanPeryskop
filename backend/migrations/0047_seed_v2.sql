-- Seed v2 (producer/consumer + drain), step 1: ADDITIVE schema only.
-- No table drops and no data migration here — the old pipeline keeps working
-- until the cutover. Drops happen in a later migration once the new path is live.

-- Per-day reconciliation/generation state. One row per event day in the window.
--   gen          — the producer run that last planned units for this day.
--   reconciling  — atomic latch: 1 while reconcileDay runs (0 otherwise).
-- The cadence marker stays in seed_cadence (single source of "is it a seed day").
CREATE TABLE IF NOT EXISTS seed_days (
  day         TEXT PRIMARY KEY,       -- 'YYYY-MM-DD'
  gen         INTEGER NOT NULL DEFAULT 0,
  reconciling INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

-- Unit granularity: 'day' = one fetch per (provider, scope, day);
-- 'window' = one fetch per (provider, scope) covering the whole seed window
-- (providers whose API returns every day at once — helios/luma/meetup/multikino/
-- going). Without this, a window provider would re-fetch the same payload once
-- per day (8x proxy cost).
ALTER TABLE seed_units ADD COLUMN generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE seed_units ADD COLUMN kind TEXT NOT NULL DEFAULT 'day';

-- The unique work key now includes kind so a day unit and a window unit for the
-- same provider/slice never collide (they are different fetch operations).
DROP INDEX IF EXISTS idx_seed_units_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS idx_seed_units_uniq ON seed_units(day, provider, slice, kind);

-- Hotlink media: providers serve images from their own CDN, so the post carries
-- the external URL instead of an R2 copy. R2 remains for UGC (and for any
-- provider switched back to 'r2' via the registry). Read paths prefer the
-- external URL, then fall back to media_key (existing R2 posts keep working).
ALTER TABLE posts ADD COLUMN external_media_url TEXT;
ALTER TABLE posts ADD COLUMN external_thumb_url TEXT;
