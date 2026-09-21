-- City-break destinations. A city has no event day, so it cannot live in
-- travel_events (start_ms is NOT NULL). The reachable flag is computed from
-- route_days at read time, so this table holds static facts only.
--
-- airports is a JSON list of IATA codes within 150 km of the city point. It maps
-- a city to the routes that can serve it.
CREATE TABLE IF NOT EXISTS travel_cities (
  id           TEXT PRIMARY KEY,   -- Urban Audit code, e.g. FR001C
  name         TEXT NOT NULL,
  country      TEXT NOT NULL,
  country_code TEXT NOT NULL,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  tier         TEXT NOT NULL,      -- metropolis | large | medium
  tier_rank    INTEGER NOT NULL,   -- 1 = most important; drives the zoom ladder
  rank         INTEGER NOT NULL,   -- visitor rank inside the whole extract
  nights_total INTEGER NOT NULL DEFAULT 0,
  airports     TEXT NOT NULL DEFAULT '[]',
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_travel_cities_tier ON travel_cities(tier_rank);
