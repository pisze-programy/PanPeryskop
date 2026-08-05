-- Content category enum ('live' | 'events').
-- is_sponsored stays purely visual (story preview badge/link); it does NOT drive categories.
ALTER TABLE posts ADD COLUMN category TEXT NOT NULL DEFAULT 'live';

-- Backfill existing rows. Today seed/imported posts are exactly the ones with
-- external_id AND is_sponsored=1, so keying the backfill off is_sponsored is
-- equivalent. If that invariant ever changes, re-key by external_id.
UPDATE posts SET category = 'events' WHERE is_sponsored = 1;
