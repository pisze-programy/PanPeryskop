-- going affiliate (TradeDoubler): posts.link_url holds the TD click URL the app
-- opens (commission earned — same as ebilet). The original plain goingapp URL is
-- preserved in source_url for provenance and link rebuilds after TD token
-- rotation. New posts send it via POST /posts; existing matched posts are
-- backfilled by POST /admin/seed/affiliate.
ALTER TABLE posts ADD COLUMN source_url TEXT;