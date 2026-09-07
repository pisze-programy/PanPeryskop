# Eventim.pl (Awin affiliate datafeed)

Eventim PL events come from the **Awin affiliate network** (partner program, no
scraping — eventim.pl itself is Akamai-blocked for automation). The slim
14-column product feed is warmed to R2 and the Worker provider reads its batch day.

## Feed

- Awin advertiser **19044** (Eventim PL), datafeed **99885**, vertical Tickets,
  **4547 products** (~one row per performance: event_date + custom_1 start time).
- Slim columns (the only ones PanPeryskop uses):
  `aw_product_id, aw_deep_link, aw_image_url, merchant_deep_link,
  Tickets:event_name, Tickets:event_date, Tickets:venue_name, Tickets:venue_address,
  Tickets:latitude, Tickets:longitude, Tickets:genre, Tickets:min_price,
  Tickets:max_price, custom_1` — `custom_1` is the start time `HH:MM`.
- Affiliate links: `merchant_deep_link` = direct eventim ticket page (already
  `affiliate=AWN`); `aw_deep_link` = awin1.com click tracker carrying our publisher
  id (`a=3071193`). The queue ingest swaps to `aw_deep_link` via `resolveLink`.
- Geo: most rows carry lat/lng; `0.0` rows are deferred to the shared venues store
  → Nominatim at ingest (same as ebilet), then a city-center pin + PENDING.

## Warm (VPS, `awin-warm.mjs`)

- Standalone lightweight bundle (mirrors `kup-warm.mjs`), runs **00:03 Warsaw**
  via root crontab, clean env (no proxy — an ~2.5 MB feed does not pay for it).
- Gates on the feed's `Last Imported` timestamp (state file
  `admin/vps/logs/awin-feed.state`); downloads the slim gzip CSV, parses to JSON
  and pushes to `POST /admin/seed/awin/feed` → R2 `seed/awin-eventim.json`.
- Failure aborts with nothing pushed → the morning seed batch throws
  "eventim feed missing" → failed-mail alarm (same loud pattern as kupbilecik).
- Feed key is a secret: `wrangler secret put AWIN_FEED_KEY` (also `AWIN_FEED_KEY`
  in `admin/vps/.env` for the box).

## Provider

- `backend/src/seed/providers/eventim.ts` (Worker, priority 7 like ebilet — wins
  only when nothing else has the event). One feed row = one performance; the same
  event-day-venue at different times collapses into ONE post with `showtimes[]`
  via `aggregateDayCandidates`; multi-day runs are separate posts
  (`externalId = eventim-<aw_product_id>`).
- Reconcile/dedupe against going/kupbilecik/ebilet is the standard worker path.

## Manual

```
# warm (from the box):
node backend/dist/awin-warm.mjs
# force re-seed a day:
curl -X POST "$BASE_URL/admin/seed" -H "Authorization: Bearer $ADMIN_SECRET" \
  -H 'Content-Type: application/json' -d '{"day":"2026-09-13","via":"queue"}'
```