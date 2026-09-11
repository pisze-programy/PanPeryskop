-- Seed v2 fix: preserve the provider-supplied coordinates per raw row. The raw
-- row previously kept only canonical_venue_id, so ingest used the fuzzy-matched
-- venue geo — which collapsed chain branches (e.g. all Cinema City Warszawa) to
-- one point. Storing lat/lng lets ingest use the source's exact coordinates and
-- only fall back to venue/Nominatim when the source has none.
ALTER TABLE seed_raw ADD COLUMN lat REAL;
ALTER TABLE seed_raw ADD COLUMN lng REAL;
