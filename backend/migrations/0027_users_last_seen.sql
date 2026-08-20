-- Last-seen timestamp per user, touched (throttled) on any authenticated request
-- via authenticate(). Powers the admin "Ostatnia aktywność" column.
ALTER TABLE users ADD COLUMN last_seen INTEGER;
