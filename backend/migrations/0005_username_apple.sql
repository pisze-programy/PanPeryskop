-- User identity: display username + Apple ID groundwork.
-- username is a free-form display name (NOT unique); default "Peryskop no.<4 digits>".
-- auth_provider: 'device' | 'apple' (Sign in with Apple comes later; column ready now).

ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'device';
ALTER TABLE users ADD COLUMN apple_id TEXT;

-- Moderation: remember why a post was rejected.
ALTER TABLE posts ADD COLUMN rejection_reason TEXT;

-- Backfill existing users with a default display name.
UPDATE users SET username = printf('Peryskop no.%04d', abs(random()) % 10000) WHERE username IS NULL OR username = '';
