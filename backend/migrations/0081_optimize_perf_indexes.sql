CREATE INDEX IF NOT EXISTS idx_seed_raw_status ON seed_raw(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_seed_raw_created ON seed_raw(created_at);
CREATE INDEX IF NOT EXISTS idx_viator_city_window_end ON viator_city_cache(window_end);
CREATE INDEX IF NOT EXISTS idx_posts_event_date_status ON posts(event_date, status);
