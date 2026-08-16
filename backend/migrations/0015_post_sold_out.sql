-- Mark posts whose tickets are sold out so the app can show a badge instead of
-- hiding them. Filled by seed providers with reliable availability data
-- (kupbilecik HTML `sold-out` div, eventylive/ebilet offers.availability).
ALTER TABLE posts ADD COLUMN is_sold_out INTEGER NOT NULL DEFAULT 0;

-- Track the flag per candidate through fetch → ingest (same default as posts).
ALTER TABLE seed_candidates ADD COLUMN is_sold_out INTEGER NOT NULL DEFAULT 0;
