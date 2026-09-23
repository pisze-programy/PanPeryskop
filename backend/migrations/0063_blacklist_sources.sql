-- Blacklist rules gain a SOURCE scope. A rule used to be a title pattern gated by
-- a goingapp organizer id, so it only ever fired for `going` — the same promoter's
-- copies from ebilet/eventim/kupbilecik sailed straight through. The organizer gate
-- stays, but the recurring cross-provider junk needs to name the sources instead.
--
-- sources = comma-separated provider ids ('kupbilecik,ebilet,eventim,going,ticketmaster').
-- NULL or empty = every source (the old behaviour, kept for existing rules).
ALTER TABLE event_blacklist ADD COLUMN sources TEXT;
