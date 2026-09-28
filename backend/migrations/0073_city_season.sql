-- Monthly tourism seasonality per city, from Eurostat nights (NUTS2) plus
-- Open-Meteo climate. One row per (city, month). index = nights / mean(nights).
-- weather: 0 sun, 1 partly, 2 rain, 3 snow.
CREATE TABLE city_season (
  city_id   TEXT NOT NULL,
  month     INTEGER NOT NULL,
  nights    REAL NOT NULL,
  idx       REAL NOT NULL,
  temp_c    REAL NOT NULL,
  precip_mm REAL NOT NULL,
  sun       REAL NOT NULL,
  weather   INTEGER NOT NULL,
  PRIMARY KEY (city_id, month)
);

CREATE INDEX IF NOT EXISTS idx_city_season_month ON city_season(month);

DROP TABLE IF EXISTS city_hotel_stats;
