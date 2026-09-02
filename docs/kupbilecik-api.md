# kupbilecik — seed provider (official partner API)

This document describes the kupbilecik seed provider. It replaces the old
module that scraped the website with Cloudflare Browser Run.

## 1. Source

kupbilecik sells tickets for events in Poland. We use the official partner API.
The API returns the whole future catalog in one JSON response (~60 MB,
~12 000 performances).

The provider runs on the Cloudflare Worker. It is a 'fetch' provider. It does
not need the browser.

## 2. API facts

- One response = the whole future catalog (all categories, all regions).
- One row = one performance. The row has a unique `Id`. The URL
  `/imprezy/<Id>/` uses the same id.
- Row fields we use:

| Field | Meaning |
|---|---|
| `Name`, `Date` | Event title, date+time `YYYY-MM-DD HH:MM:SS` |
| `City` | City |
| `Category.Type` | Category, for example `muzyka`, `teatr`, `standup` |
| `Images.Image`, `Images.Mini` | Full image and small image (webp) |
| `TicketsInfo.Price` | Ticket price (PLN). The API does not expose availability |
| `Object.Name`, `Object.Address`, `Object.Code` | Venue name, address, postal code |
| `Object.Location.Lat/Long` | Venue coordinates (ready to use) |
| `Link` | Affiliate link with `utm_source=pp&utm_medium=631` |

The API answers from the Cloudflare edge. We verified this with a probe
(API and image returned HTTP 200).

## 3. Why we split the feed by day

The full response is ~60 MB. It is too large to parse on the Worker for every
seed batch day. Also the Worker needs only one day at a time.

So an external job downloads the catalog once and pushes one small manifest per
window day. The provider reads only the manifest of its batch day.

### 3.1 The external job

Run `node backend/scripts/kup-warm.mjs`. The job:

1. Downloads the full catalog.
2. Filters the events to the seed window (today .. today+6).
3. Trims each event (it removes the heavy description).
4. Pushes each day to `POST {BASE_URL}/admin/seed/kupbilecik/day`.

The Worker stores each manifest in R2. The key is
`seed/kupbilecik/<day>.json`.

Run the job:
- after a catalog change (the feed has no version endpoint),
- before a backfill,
- on a schedule, for example once per day.

The job needs these environment values (from `admin/vps/.env`):
`BASE_URL`, `ADMIN_SECRET`, `KUPBILECIK_API_TOKEN`.

## 4. Mapping to PanPeryskop

| PanPeryskop field | Source |
|---|---|
| `externalId` | `kupbilecik-<Id>-<event-day>` |
| `title` | `Name` (HTML entities decoded) |
| `startMs` | Performance time for the batch day |
| `lat`, `lng` | `Object.Location` |
| `venue` | `Object.Name` |
| `city` | `City` |
| `address` | `Object.Address` |
| `link` | `Link` (affiliate, already stamped) |
| `mediaUrl`, `thumbUrl` | `Images.Image`, `Images.Mini` |
| `price` | `TicketsInfo.Price` (PLN, nullable) |
| `isSoldOut` | always false (the API exposes no availability) |
| `tags` | Mapped from `Category.Type` (section 5) |

### 4.1 Showtimes rule

One event-day-venue is ONE post. Do not create duplicate posts.

The same event often has several performances in one day (for example 16:00
and 19:00). These rows share the same title, venue and city. We merge them
into one post:

- The post carries the union of the times in `showtimes`.
- The post keeps the cheapest price.
- The post keeps the earliest performance as its start time and its id.
- Every showtime keeps its OWN performance link as a booking identity
  (`kind: "link"`, the affiliate `/imprezy/<Id>/` URL). Selecting a showtime in
  the app opens that exact performance. See docs/seed-showtimes-links.md for
  the shared standard.

## 5. Tag map

| `Category.Type` / subcategory | Tag |
|---|---|
| `muzyka/*` | `muzyka` |
| `teatr/*` (not `teatr_widowisko`) | `teatr` |
| `standup`, `kabaret`, `impro` | `komedia` |
| `film` | `filmy` |
| `sport` | `sport` |
| `teatr_widowisko`, `dzieci`, `festiwal`, `inne` | `inne` |

Unknown categories get no tag.

## 6. Registry and schedule

- Provider ID: `kupbilecik`.
- Transport: `fetch` (was `browser`).
- Executor: Worker.
- Priority: 3 (unchanged).
- Scopes: one scope `pl`.
- Schedule: the daily Worker cron seeds the far edge day. Each day is seeded once.

## 7. Migration notes

The old scraper created posts with legacy `/wydarzenia/<legacyId>` external
ids. The new provider uses `/imprezy/<Id>` ids. Before the first new run we
deleted all old kupbilecik posts:

```
POST {BASE_URL}/admin/events/cleanup?source=kupbilecik
```

Then we re-seeded the window. The old Browser Run code is gone.

## 8. Deploy steps

1. Deploy: `wrangler deploy`.
2. Warm the manifests:
   `node backend/scripts/kup-warm.mjs`.
3. (First migration) clean the old posts:
   `POST {BASE_URL}/admin/events/cleanup?source=kupbilecik`.
4. Backfill the window: enqueue each day via `POST {BASE_URL}/admin/seed`
   with `{"day":"YYYY-MM-DD","via":"queue"}`.
5. Verify: `GET {BASE_URL}/admin/seed/coverage`. Check the `kupbilecik` count.
