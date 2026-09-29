-- The card photo was a 1:1 square (w=600&h=600), while the bundled thumb and the
-- hero photo are 2:1. A square in a wider frame crops the city away: the card
-- showed a zoom on the buildings instead of the whole city, and the bundled
-- thumb (2:1) and the loaded card (1:1) framed the same photo differently, so
-- the picture jumped when the network photo arrived.
--
-- One ratio everywhere: 2:1, the same crop the thumb generator requests.
-- The 4 cities from 0078 are already 2:1 and stay untouched.
UPDATE travel_cities
SET image_url = replace(image_url, 'w=600&h=600', 'w=600&h=300')
WHERE image_url LIKE '%w=600&h=600%';
