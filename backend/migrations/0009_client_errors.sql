-- Client error / dead-letter queue (panperyskop-dlq): app-side upload failures
-- reported by the iOS client for monitoring. device_id identifies the device.
CREATE TABLE IF NOT EXISTS client_errors (
  id         TEXT PRIMARY KEY,
  device_id  TEXT,
  error_type TEXT NOT NULL,
  message    TEXT,
  meta       TEXT,              -- JSON (post type, retries, etc.)
  created_at INTEGER NOT NULL
);
