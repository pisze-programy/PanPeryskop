-- Drop the retired eventylive venue cache. Its only writer (buildVenueCache, fed
-- from the dzis.app API) was removed with the dzisapp/eventylive providers, so
-- the table is write-orphaned. Live providers resolve geo through the shared
-- `venues` store (venues table) instead — see 0017_venues.sql.
DROP TABLE IF EXISTS seed_venue_cache;
