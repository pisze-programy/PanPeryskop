-- Viator (tours & activities) for the "Atrakcje" section of a trip card.
-- One small copy of the partner destination catalogue (refreshed weekly) plus a
-- lazily filled product cache per city (one Viator search = 50 products).

CREATE TABLE IF NOT EXISTS viator_destinations (
  destination_id INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL,
  parent_id      INTEGER,
  iata_codes     TEXT,
  lat            REAL,
  lng            REAL,
  currency       TEXT,
  time_zone      TEXT,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_viator_destinations_city ON viator_destinations(type);

-- Product cache. Page 1 is re-ranked by our popularity rule; later pages keep the
-- partner order. `position` is the display order inside a destination.
CREATE TABLE IF NOT EXISTS viator_products (
  destination_id   INTEGER NOT NULL,
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
  PRIMARY KEY (destination_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_viator_products_order ON viator_products(destination_id, position);

-- Per-city bookkeeping: total products reported by the partner, how many pages we
-- already pulled, and when.
CREATE TABLE IF NOT EXISTS viator_city_cache (
  destination_id INTEGER PRIMARY KEY,
  total          INTEGER NOT NULL,
  pages          INTEGER NOT NULL,
  fetched_at     INTEGER NOT NULL
);
