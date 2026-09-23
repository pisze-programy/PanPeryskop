-- A club night carries data the seed format has no room for: the lineup, the
-- genres, the club's size, the age limit, the price and the ticket flag. The
-- card needs them as fields, never as text to parse.
--
-- `travel_events` has held a `meta` JSON column since 0044. This adds the same
-- column to `posts`, so an event source can put its own fields there.
ALTER TABLE posts ADD COLUMN meta TEXT;

-- The club night fields (lineup, genres, age, price flag) travel with the
-- candidate as a JSON string. seed_raw carries it to ingest, which copies it to
-- the post.
ALTER TABLE seed_raw ADD COLUMN meta TEXT;
