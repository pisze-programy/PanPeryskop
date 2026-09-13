-- Provider-specific travel-event extras (JSON): run distance/surface/time/price, etc.
-- Text mirror of a small object; null for events that carry none (ESPN soccer).
ALTER TABLE travel_events ADD COLUMN meta TEXT;