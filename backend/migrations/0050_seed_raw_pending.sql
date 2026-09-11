-- Seed v2 data rules: record WHY a raw row must become a PENDING post
-- (missing title/image/link/date). Null = the row has no content-level pending
-- reason (geo/city pending is decided at ingest). Never a reject.
ALTER TABLE seed_raw ADD COLUMN pending_reason TEXT;
