-- Admin geo/tag overrides survive re-seeds: when locked, doSavePost keeps the
-- manually set coordinates / tags instead of overwriting them from the provider.
ALTER TABLE posts ADD COLUMN geo_locked INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN tags_locked INTEGER DEFAULT 0;
