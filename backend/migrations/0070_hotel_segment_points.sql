-- The point is a real listing price at a segment percentile; the median can fall between listings.
ALTER TABLE city_hotel_stats ADD COLUMN eko_point REAL NOT NULL DEFAULT 0;
ALTER TABLE city_hotel_stats ADD COLUMN reco_point REAL NOT NULL DEFAULT 0;
ALTER TABLE city_hotel_stats ADD COLUMN lux_point REAL NOT NULL DEFAULT 0;
