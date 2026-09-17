-- The availability window is part of the cache key now: products for the trip day
-- ±1 differ from the same city asked for another date, so the key must carry it.

DROP TABLE IF EXISTS viator_products;
DROP TABLE IF EXISTS viator_city_cache;

CREATE TABLE IF NOT EXISTS viator_products (
  cache_key        TEXT NOT NULL,
  product_code     TEXT NOT NULL,
  position         INTEGER NOT NULL,
  title            TEXT NOT NULL,
  image_url        TEXT,
  from_price       REAL,
  currency         TEXT,
  duration_minutes INTEGER,
  rating           REAL,
  review_count     INTEGER,
  product_url      TEXT NOT NULL,
  flags            TEXT NOT NULL DEFAULT '[]',
  fetched_at       INTEGER NOT NULL,
  PRIMARY KEY (cache_key, product_code)
);

CREATE INDEX IF NOT EXISTS idx_viator_products_order ON viator_products(cache_key, position);

CREATE TABLE IF NOT EXISTS viator_city_cache (
  cache_key      TEXT PRIMARY KEY,
  destination_id INTEGER NOT NULL,
  window_start   TEXT NOT NULL,
  window_end     TEXT NOT NULL,
  total          INTEGER NOT NULL,
  pages          INTEGER NOT NULL,
  fetched_at     INTEGER NOT NULL
);
