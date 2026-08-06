-- Google identity (non-unique "prestige" column, like apple_id). device_id stays the identity.
ALTER TABLE users ADD COLUMN google_id TEXT;
