-- Permanent per-device bans. Source of truth for auth denial (login + every request).
CREATE TABLE IF NOT EXISTS banned_devices (
  device_id  TEXT PRIMARY KEY,
  reason     TEXT,
  banned_at  INTEGER NOT NULL
);
