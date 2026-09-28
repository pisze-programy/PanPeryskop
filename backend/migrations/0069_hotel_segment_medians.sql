-- The season element shows a median, not a cut point. The cut point (p33) is
-- the top of the economy third, which is not a bookable price; the user read it
-- as "cheapest from". Add the median per segment. The measurement uses a 3-star
-- floor, so a hostel never sets a band.
ALTER TABLE city_hotel_stats ADD COLUMN eko_med REAL NOT NULL DEFAULT 0;
ALTER TABLE city_hotel_stats ADD COLUMN reco_med REAL NOT NULL DEFAULT 0;
ALTER TABLE city_hotel_stats ADD COLUMN lux_med REAL NOT NULL DEFAULT 0;
