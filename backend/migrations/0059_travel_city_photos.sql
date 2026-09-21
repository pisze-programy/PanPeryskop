-- One lead photo per city-break destination, a compressed Wikimedia thumbnail in
-- R2. image_credit keeps the source file page for attribution; the general
-- "Wikimedia Commons" note lives in the app policy screen.
ALTER TABLE travel_cities ADD COLUMN image_key TEXT;
ALTER TABLE travel_cities ADD COLUMN image_credit TEXT;
