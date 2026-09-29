-- Four city photos replaced with new Unsplash shots.
-- The bundled thumbnail comes from data/cities.json. The hero and the card come
-- from this table, so a change must land in both places.

UPDATE travel_cities SET
  image_url = 'https://images.unsplash.com/photo-1600160805984-2d44e4a1a903?w=600&h=300&fit=crop&auto=format&q=80',
  image_large_url = 'https://images.unsplash.com/photo-1600160805984-2d44e4a1a903?w=1000&h=500&fit=crop&auto=format&q=80',
  image_photo_url = 'https://unsplash.com/photos/white-concrete-building-beside-body-of-water-during-daytime-yAn892ej5kQ',
  image_credit_name = 'Vincenzo De Simone',
  image_credit_url = 'https://unsplash.com/@vincydesy',
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 'bari-italy';

UPDATE travel_cities SET
  image_url = 'https://images.unsplash.com/photo-1714682115963-b1d1ea3dbd82?w=600&h=300&fit=crop&auto=format&q=80',
  image_large_url = 'https://images.unsplash.com/photo-1714682115963-b1d1ea3dbd82?w=1000&h=500&fit=crop&auto=format&q=80',
  image_photo_url = 'https://unsplash.com/photos/a-narrow-city-street-with-a-church-steeple-in-the-background-p_Ic6hN63YA',
  image_credit_name = 'Grigorii Shcheglov',
  image_credit_url = 'https://unsplash.com/@shegiva',
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 'modena-italy';

UPDATE travel_cities SET
  image_url = 'https://images.unsplash.com/photo-1566724120794-661e2887ed93?w=600&h=300&fit=crop&auto=format&q=80',
  image_large_url = 'https://images.unsplash.com/photo-1566724120794-661e2887ed93?w=1000&h=500&fit=crop&auto=format&q=80',
  image_photo_url = 'https://unsplash.com/photos/aerial-photography-of-building-MsKM7TVbR-g',
  image_credit_name = 'Giordano Rossoni',
  image_credit_url = 'https://unsplash.com/@giordanorossoni',
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 'rimini-italy';

UPDATE travel_cities SET
  image_url = 'https://images.unsplash.com/photo-1669718022108-505b40ed2e65?w=600&h=300&fit=crop&auto=format&q=80',
  image_large_url = 'https://images.unsplash.com/photo-1669718022108-505b40ed2e65?w=1000&h=500&fit=crop&auto=format&q=80',
  image_photo_url = 'https://unsplash.com/photos/a-city-on-the-water-pyTY-UdZIrQ',
  image_credit_name = 'Nejc Soklič',
  image_credit_url = 'https://unsplash.com/@nejc_soklic',
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 'sliema-malta';
