# ebilet (TradeDoubler) — seed provider

This document describes the ebilet seed provider. It explains the source, the
download rules, and how the data is stored in PanPeryskop.

## 1. Source

ebilet sells tickets for events in Poland. The product data comes from
TradeDoubler. TradeDoubler is an affiliate network. We use one feed. The feed
ID is 94944.

The provider runs on the Cloudflare Worker. It is a 'fetch' provider. It does
not need the browser.

Reference documentation (TradeDoubler Products API — Publishers):

- Products API overview:
  <https://dev.tradedoubler.com/products/publisher/>
- Unlimited service (download limits, example requests):
  <https://dev.tradedoubler.com/products/publisher/#Unlimited_service>
- Unlimited Last Updated service:
  <https://dev.tradedoubler.com/products/publisher/#Unlimited_Last_Updated_service>
- Search service + response fields (Availability, priceHistory, categories):
  <https://dev.tradedoubler.com/products/publisher/#Search_service>
- Error management (HTTP codes, PF_ codes):
  <https://dev.tradedoubler.com/products/publisher/#Error_management>

## 2. Endpoints

See the [Unlimited service](https://dev.tradedoubler.com/products/publisher/#Unlimited_service)
and the
[Unlimited Last Updated service](https://dev.tradedoubler.com/products/publisher/#Unlimited_Last_Updated_service)
in the TradeDoubler documentation.

We use two endpoints.

| Purpose | Endpoint |
|---|---|
| Full product list | `https://api.tradedoubler.com/1.0/productsUnlimited.json;fid=94944` |
| Feed version check | `https://api.tradedoubler.com/1.0/productsUnlimited/lastUpdated.json;fid=94944` |

Both need the token in the query: `?token={EBILET_TD_TOKEN}`.

We use the plain JSON endpoint. We do not use the `compress=gz` variant. Plain
JSON is ~3.5 MB.

IMPORTANT: the Cloudflare Worker cannot download the feed. TradeDoubler returns
HTTP 400 (empty body) to Cloudflare egress. Only a residential/office network
can download it. An external job does the download and pushes the feed into R2.
The Worker provider reads that R2 cache only.

Do NOT use the paginated endpoint `products.json`. It returns at most 1000
products. Our feed has ~1292 products.

## 3. Download rule (important)

TradeDoubler allows 3 downloads of the same feed version in 24 hours.
After that, the API returns HTTP 429.

The download permission resets when the advertiser publishes a new version of
the feed.

A new feed has a 5 day grace period. During this period, the download limit
does not apply.

### 3.1 Our method

The download limit applies to the external job only. The external job runs
where a normal download works (VPS or local machine). It follows this method:

1. Call the `lastUpdated` endpoint. This call is small.
2. If the feed version did not change, do nothing.
3. If the feed version changed, download the new feed.
4. Push the feed to R2: `POST {BASE_URL}/admin/seed/ebilet/feed`. The body is
   the raw JSON response. The endpoint requires the admin bearer token.

The Worker provider does not download the feed. It reads the R2 cache object.
If the cache is missing, the provider fails loudly until the external job warms
it.

### 3.2 R2 cache

- Storage: R2 bucket `MEDIA`.
- Key: `seed/ebilet-feed.json`.
- Metadata: `feedUpdated` = the feed version at push time.

The external job refreshes the feed when it changes. All seed batches for the
same day reuse the same cached copy.

## 4. Data model

One product is one ebilet event page. The page has a SourceProductId.

Important fields:

| Field | Meaning |
|---|---|
| `fields` | A list of segments: `Availability|Location|Date|SegmentN` |
| Segment value | `In Stock|Venue, City|YYYY-MM-DD HH:MM:SS|Segment X` |
| `offers[0].productUrl` | TradeDoubler affiliate click URL |
| `offers[0].priceHistory` | Price list. The last entry is the current price |
| `productImage.url` | Event image (webp) |
| `categories` | Event category, for example `Muzyka/Rock` |

Feed facts:

- Segment numbers change between downloads. Do NOT use them in the external ID.
- Some segments are empty (`|||`). Skip them. Empty segments never have a date.
- Some dates are far in the future (for example year 2100). Filter by the seed day.
- The feed has no coordinates. We resolve venue locations later.

## 5. Mapping to PanPeryskop

| PanPeryskop field | Source |
|---|---|
| `externalId` | `ebilet-<SourceProductId>-<event-day>` |
| `title` | Product name |
| `startMs` | Earliest available segment time for the seed day |
| `showtimes` | Every available in-day segment time (sorted unique "HH:MM") |
| `venue`, `city` | Last comma part of the Location string |
| `link` | ebilet event page URL (dedupe key) |
| `affiliateLink` | TradeDoubler click URL (stored on the post) |
| `mediaUrl`, `thumbUrl` | `productImage.url` |
| `isSoldOut` | True when no segment for the day is in stock |
| `price` | Last `priceHistory` value (PLN) |
| `tags` | Mapped from the category (see section 6) |

The external ID is stable. It does not change between downloads.

### 5.1 Showtimes rule

One event-day-venue is ONE post. Do not create duplicate posts.

- All in-day segments of one product become `showtimes` (sorted unique "HH:MM").
- The post start time is the earliest available segment.
- If the same event-day-venue appears as several products, we merge them into one
  post. We keep the union of times and the cheapest price.
- Every showtime carries a booking identity (`kind: "link"`, the TradeDoubler
  affiliate URL), so selecting a showtime in the app opens that product's ticket
  page. See docs/seed-showtimes-links.md for the shared standard.

### 5.1 Link rules

- The dedupe link is the ebilet page URL. Each product has a unique page URL.
- The affiliate click URL is stored separately. It replaces the dedupe link
  when the post is created.
- Do not use the click URL as the dedupe link. All click URLs share one host.
  Dedupe would merge different events.

### 5.2 Geo rules

The feed has no coordinates. We resolve the venue location after dedupe:

1. Check the shared venue store in D1.
2. Ask Nominatim for the venue.
3. If no result, pin the city center. Events outside the 21 cities get a
   pending (0,0) pin. They need admin review.

We do NOT resolve locations during the fetch scope. Nominatim allows only
4 requests per minute from the Worker. Full-Poland resolution would fail.

## 6. Tag map

The category maps to one canonical tag.

| Category | Tag |
|---|---|
| `Muzyka/*`, `Klasyka/Koncerty muzyki poważnej`, `Klasyka/Muzyka filmowa`, `Klasyka/Opera i Operetka` | `muzyka` |
| `Teatr/*`, `Rodzina/Teatr dla dzieci` | `teatr` |
| `Widowiska/Stand-up`, `Widowiska/Kabarety` | `komedia` |
| `Sport/*` | `sport` |
| `Zwiedzanie/*`, `Rodzina/Atrakcje dla rodziny`, `Rodzina/Rekreacja` | `atrakcje` |
| `Biznes/Konferencje`, `Biznes/Szkolenia`, `Biznes/Inne` | `meetup` |
| Other ambiguous paths (`Klasyka/Balet`, `Biznes/Wystawy`, `Biznes/Targi`, `Rodzina/Widowiska dla dzieci`, `Rodzina/Warsztaty|Edukacja`, `Widowiska/Rewie|Show`, `Widowiska/Inne`) | `inne` |

Unknown categories get no tag.

## 7. Registry and schedule

- Provider ID: `ebilet`.
- Executor: Worker (edge queue).
- Priority: 7. Lower-priority providers keep the canonical post when they cover
  the same event.
- Scopes: one scope `pl` (whole Poland).
- Schedule: the daily cron seeds the far edge day (today + 6). Each day is
  seeded once.

## 8. Secrets and data changes

Deploy steps:

1. Apply the migration: `npm run db:migrate -- --remote`.
2. Set the secrets: `wrangler secret put ADMIN_SECRET`, `wrangler secret put EBILET_TD_TOKEN`.
3. Deploy: `wrangler deploy`.
4. Warm the feed (first run and after feed changes). Download it on a machine
   where TradeDoubler is reachable, then push it:
   `curl -sL ".../productsUnlimited.json;fid=94944?token={token}" -o feed.json`
   `curl -X POST {BASE_URL}/admin/seed/ebilet/feed -H "Authorization: Bearer {ADMIN_SECRET}" --data-binary @feed.json`
5. Backfill the window (first run only). Enqueue each day:
   `POST {BASE_URL}/admin/seed` with body `{"day":"YYYY-MM-DD","via":"queue"}`.
6. Verify: `GET {BASE_URL}/admin/seed/coverage`. Check the `ebilet` count.

Data changes (migration 0038):

- `posts.price_pln` — ticket price in PLN (nullable).
- `seed_candidates.price_pln` — price on the candidate.
- `seed_candidates.affiliate_link` — affiliate click URL on the candidate.

The iOS in-app browser whitelists two domains: `ebilet.pl` and
`tradedoubler.com`.

## 9. Verification

Run the tests:

```
cd backend
npx tsc --noEmit
npm test
```

Check the feed version manually:

```
curl "https://api.tradedoubler.com/1.0/productsUnlimited/lastUpdated.json;fid=94944?token={token}"
```
