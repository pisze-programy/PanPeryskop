-- Sponsored events / scheduling via created_at window.
-- Visibility rule: post is public iff status='approved' AND now-24h <= created_at <= now.
-- expires_at is dropped (derived from created_at + TTL), no separate scheduled_for.

ALTER TABLE posts ADD COLUMN is_sponsored INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN link_url TEXT;
ALTER TABLE posts ADD COLUMN external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_external_id ON posts(external_id) WHERE external_id IS NOT NULL;

DROP INDEX IF EXISTS idx_posts_bbox;
CREATE INDEX IF NOT EXISTS idx_posts_bbox ON posts(lat, lng, created_at, status);

ALTER TABLE posts DROP COLUMN expires_at;

-- Remove legacy 'text' posts (type restricted to photo|video).
DELETE FROM likes  WHERE post_id IN (SELECT id FROM posts WHERE type = 'text');
DELETE FROM views  WHERE post_id IN (SELECT id FROM posts WHERE type = 'text');
DELETE FROM posts  WHERE type = 'text';
