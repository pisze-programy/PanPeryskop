-- 0079 rewrote the Unsplash shape (w=600&h=600). The older resize-proxy shape
-- (width=600,height=600) is still supported by the thumb generator, so a database
-- seeded from that shape would keep the 1:1 card photo and the crop jump.
-- Same result, the second shape. 2:1, the ratio of the bundled thumb.
UPDATE travel_cities
SET image_url = replace(image_url, 'width=600,height=600', 'width=600,height=300')
WHERE image_url LIKE '%width=600,height=600%';
