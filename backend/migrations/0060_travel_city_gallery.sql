-- A city hero is a gallery, not one photo, and the map pin needs a small image.
-- image_keys is a JSON array of R2 keys (up to 6); thumb_key is the pin image.
ALTER TABLE travel_cities ADD COLUMN image_keys TEXT NOT NULL DEFAULT '[]';
ALTER TABLE travel_cities ADD COLUMN thumb_key TEXT;

UPDATE travel_cities
   SET image_keys = json_array(image_key)
 WHERE image_key IS NOT NULL;
