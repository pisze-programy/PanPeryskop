-- Content category enum ('live' | 'events').
-- is_sponsored stays purely visual (story preview badge/link); it does NOT drive categories.
ALTER TABLE posts ADD COLUMN category TEXT NOT NULL DEFAULT 'live';

-- Backfill existing rows: seed/imported posts were marked sponsored -> 'events'.
UPDATE posts SET category = 'events' WHERE is_sponsored = 1;
