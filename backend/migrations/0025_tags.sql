-- Canonical tags per post (JSON array of canonical tag ids, NULL = none) — the
-- admin moderation UI edits them; seeds auto-assign from the deterministic
-- provider→tag dictionary. Tags are a closed set, never free-form.
ALTER TABLE posts ADD COLUMN tags TEXT;
ALTER TABLE seed_candidates ADD COLUMN tags TEXT;
