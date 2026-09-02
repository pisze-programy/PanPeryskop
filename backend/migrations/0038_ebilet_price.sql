-- ebilet (TradeDoubler) provider: store the ticket price (PLN, nullable) for the
-- future "price per event / paid filter" feature, plus the raw affiliate click URL
-- (kept separate from the dedupe-facing link, which must stay per-product unique).
ALTER TABLE posts ADD COLUMN price_pln REAL;
ALTER TABLE seed_candidates ADD COLUMN price_pln REAL;
ALTER TABLE seed_candidates ADD COLUMN affiliate_link TEXT;
