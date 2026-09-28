-- Hotel price bands per city per week, measured from the Stay22 booking feed.
-- The row covers one week (Mon-based) of the 90-day horizon, so the app can draw
-- a season bar chart and pick the segment cut points for the user's dates.
-- One row per (city, week, mode): mode 'mid' = Tue-Thu, 'weekend' = Fri-Sun.
-- All prices are nightly USD for one adult. Cut points use the priced hotels
-- with a guest score of 7+/10 (a dump is not an economy option); luxury needs
-- 8.5+/10 too. p33/p66 split economy / recommended / luxury.
CREATE TABLE city_hotel_stats (
  city_id     TEXT NOT NULL,     -- travel_cities.id
  week        TEXT NOT NULL,     -- YYYY-MM-DD, the Monday that starts the week
  mode        TEXT NOT NULL,     -- 'mid' | 'weekend'
  p33         REAL NOT NULL,     -- economy max
  p66         REAL NOT NULL,     -- recommended max
  eko_low     REAL NOT NULL,
  eko_high    REAL NOT NULL,
  reco_low    REAL NOT NULL,
  reco_high   REAL NOT NULL,
  lux_low     REAL NOT NULL,
  lux_high    REAL NOT NULL,     -- p95 cap, so one 8000 USD suite is not the band
  hotel_count INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  measured_at INTEGER NOT NULL,
  PRIMARY KEY (city_id, week, mode)
);

CREATE INDEX IF NOT EXISTS idx_city_hotel_stats_week ON city_hotel_stats(week);
