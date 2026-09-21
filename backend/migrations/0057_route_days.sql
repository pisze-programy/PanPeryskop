-- Materialized flight schedule per route, so a user request never calls a provider
-- for "which days does this route fly". The day list is a bitmask: bit i = the
-- route flies on (horizon_start + i). One row per (origin, dest, carrier).
--
-- The schedule is seasonal and changes rarely, so the drain refreshes it on a
-- long TTL. Prices stay in flight_cache with a short TTL.
CREATE TABLE IF NOT EXISTS route_days (
  origin        TEXT NOT NULL,
  dest          TEXT NOT NULL,
  carrier       TEXT NOT NULL,     -- 'ryanair' | 'wizzair'
  horizon_start INTEGER NOT NULL,  -- epoch day (days since 1970-01-01) of bit 0
  horizon_days  INTEGER NOT NULL,  -- number of valid bits
  mask          TEXT NOT NULL,     -- base64 of ceil(horizon_days/8) bytes
  fetched_at    INTEGER NOT NULL,
  PRIMARY KEY (origin, dest, carrier)
);

CREATE INDEX IF NOT EXISTS idx_route_days_fetched ON route_days(fetched_at);
