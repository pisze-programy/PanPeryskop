-- The Unsplash credit the city page carries for its hero photo. The licence
-- needs it shown, so it travels with the city.
ALTER TABLE travel_cities ADD COLUMN image_credit_name TEXT;
ALTER TABLE travel_cities ADD COLUMN image_credit_url TEXT;
ALTER TABLE travel_cities ADD COLUMN image_photo_url TEXT;
