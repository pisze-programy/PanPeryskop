-- Reports moderation audit trail: status now records the actual outcome
-- ('open' | 'resolved' | 'rejected' | 'banned'); resolved_at/by capture who+when.
-- Backwards compatible: existing 'open'/'resolved' rows stay valid.
ALTER TABLE reports ADD COLUMN resolved_at INTEGER;
ALTER TABLE reports ADD COLUMN resolved_by TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

-- Stats page: per-day series GROUP BY date(...) on these event tables scans
-- their PKs today; cheap created_at indexes keep it sane as they grow.
CREATE INDEX IF NOT EXISTS idx_views_created ON views(created_at);
CREATE INDEX IF NOT EXISTS idx_likes_created ON likes(created_at);
CREATE INDEX IF NOT EXISTS idx_dislikes_created ON dislikes(created_at);
