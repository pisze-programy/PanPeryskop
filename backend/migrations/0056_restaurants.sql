-- Curated restaurants (map "Restauracje" tag). A restaurant is evergreen: it has
-- no event day, so the day-browser query must recognise its category. Keeping the
-- distinction code on the row lets the client draw the Michelin star corner badge
-- without leaking award data into the tag vocabulary.
ALTER TABLE posts ADD COLUMN distinction TEXT;
