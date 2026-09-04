# kupbilecik.pl — partner API

This document describes the kupbilecik partner feed. It explains the endpoint,
the limits, the data, and how we use it. Sentences are short on purpose.

## 1. What it is

kupbilecik.pl sells tickets in Poland. They gave us a private JSON API.
The API returns the full future catalog in one response. One row is one
performance. Each performance has a unique `Id`.

## 2. Endpoint

```
https://www.kupbilecik.pl/api/?k={categories}&w={regions}&t=json&v=1.0&p=631&token={KUPBILECIK_API_TOKEN}
```

| Key | Meaning | Example |
|---|---|---|
| `k` | Categories, comma separated | `teatr,muzyka,kabaret,standup,impro,sport,film,dzieci,festiwal,inne` |
| `w` | Region letters, comma separated | `C,Z,P,N,T,S,G,B,O,D,L,F,K,R,E,W` (all regions) |
| `t` | Format | `json` |
| `v` | API version | `1.0` |
| `p` | Publisher id | `631` |
| `token` | Secret token | keep it secret, never commit it |

The full response is large. Today it is about 60 MB and about 12 000 events.
Size changes when the catalog changes.

## 3. Rate limit — read this first

The API blocks too many requests. The block lasts 24 hours.

**The block is a trap.** A blocked request returns **HTTP 200**, not an error
code. The body is 90 bytes of Polish text:

> Usługa została zablokowana na 24h, ze względu na zbyt dużą częstotliwość odpytań!

Translation: "The service is blocked for 24h because of too many requests."

Rules we must follow:

1. **One request per day.** The daily job fetches the whole catalog once.
   Never fetch per category or per region in a loop (that is up to 160
   requests — it will trigger the block).
2. **Check `res.ok` AND the body.** If the body is not JSON with an `events`
   list, treat it as a temporary error. Never store the block text as data.
3. **Never probe in bursts.** Each manual test request counts. We learned this
   on 2026-09-02, when a series of test downloads tripped the block.
4. **Do not re-download on retry storms.** If ingest fails later (for example
   a media download), do not fetch the catalog again. Reuse the data we
   already have.

## 4. Response format

Top level is one object:

```json
{ "events": [ { ... }, { ... } ] }
```

### 4.1 Event row

| Field | Type | Meaning |
|---|---|---|
| `Id` | number | Unique performance id. Equals the id in `/imprezy/<Id>/` URLs. |
| `CustomId`, `IdPB` | null | Not used. |
| `Name` | string | Title. May contain HTML entities like `&quot;` — decode them. |
| `Date` | string | `"YYYY-MM-DD HH:MM:SS"`, local time. One row is one performance. |
| `Start`, `Update`, `Importance` | string | Internal timestamps. We use `Date` only. |
| `Description` | string | Long HTML text. We do **not** store it. |
| `City` | string | City name, for example `Koszalin`. |
| `Region` | object | `{Country, CountrySign, Voivodeship, VoivodeshipSign}`. |
| `Category` | object | `{Type, Name, SubCategory: {Type, Name}}`. See section 5. |
| `Images` | object | `{Image, Background, Mini}`. All `.webp` URLs. Use `Image` as media, `Mini` as thumb. |
| `TicketsInfo` | object | `{Currency, Price, ReducedPrice}`. Currency is always `PLN`. |
| `Object` | object | Venue. See section 6. |
| `Link` | string | Affiliate ticket page, already stamped with `utm_source=pp&utm_medium=631`. |

### 4.2 Category taxonomy

`Category.Type` values we have seen, with counts from 2026-09-02:

| Type | Events | Our tag |
|---|---|---|
| `muzyka` | ~4 700 | `muzyka` |
| `teatr` | ~4 000 | `teatr` (not `teatr_widowisko`) |
| `standup` | ~1 900 | `komedia` |
| `kabaret` | ~740 | `komedia` |
| `impro` | ~330 | `komedia` |
| `inne` | ~315 | `inne` |
| `dzieci` | ~200 | `inne` |
| `festiwal` | ~28 | `inne` |
| `sport` | ~17 | `sport` |
| `film` | ~5 | `filmy` |

`teatr_widowisko` (a `SubCategory.Type`) maps to `inne`, not `teatr`.
Unknown types map to no tag, never to a guessed tag.

### 4.3 Price and sold-out

- `TicketsInfo.Price` is a number when tickets are on sale (for example `140`).
- `Price` is `null` on a few events (78 of 12 286). Keep `price` null then.
- There is **no sold-out field**. We cannot know sold-out status from the API.
  `isSoldOut` stays `false`.
- Currency is always `PLN`. No currency guard is needed now.

### 4.4 Venue and geo

`Object` always has `Name`, `Address`, `Code` (postal code), and:

```json
"Location": { "Long": "16.184757", "Lat": "54.186285" }
```

Coordinates are ready to use. No geocoding is needed for kupbilecik.
Keep `Address` as the post address. The postal `Code` is dropped from display
by the existing description builder.

## 5. Affiliate links

`Link` already contains our affiliate marks: `utm_source=pp&utm_medium=631`.
`631` is our publisher id (`p=631`).

Each performance has its OWN page: `/imprezy/<Id>/<City>/<slug>/`.
Different times of the same show are different pages with different ids.
Example: 16:00 is `Id 185922`, 19:00 is `Id 185927`.

Rule: one post per event-day-venue, with `showtimes[]` listing all times, and
one booking link PER time (each time opens its own page). The app picks the
link that matches the selected showtime. See `docs/seed-showtimes-links.md`.

## 6. How we integrate

One post per (event, venue, city, day):

- `externalId` = `kupbilecik-<Id>-<day>`, for example
  `kupbilecik-185922-20260908`. Re-runs update the same post. They never
  duplicate it.
- `startMs` = earliest available time of that day at that venue.
- `times` = sorted unique `"HH:MM"` list for the day.
- Aggregation key = normalized title + venue + city. See
  `backend/src/seed/core/aggregate.ts`.
- The same performance repeated in the feed (same `Id`) is one row.
  The same show at two times is two rows. Rows merge into one post with two
  showtimes.

### 6.1 Freshness

The daily job fetches the catalog once. It keeps only the target day.
It discards the rest. No old catalog is stored. Each day uses fresh data.

If the API answers with the 24h block text, the job must fail loudly and
retry later. It must never treat the block text as event data.

### 6.2 Manual check commands

Count events per day (counts, does not store anything). Replace `TOKEN`.

```bash
curl -s "https://www.kupbilecik.pl/api/?k=teatr,muzyka,kabaret,standup,impro,sport,film,dzieci,festiwal,inne&w=C,Z,P,N,T,S,G,B,O,D,L,F,K,R,E,W&t=json&v=1.0&p=631&token=TOKEN" \
  | python3 -c 'import sys,json,collections; d=json.load(sys.stdin); print(len(d["events"]))'
```

Check one image (small response). Replace `URL`.

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" "URL"
```

Verify one batch after a run: approved posts per day must never exceed the
API row count for that day. More posts than rows means duplicates.

## 7. History of mistakes (2026-09-02)

We probed this API in bursts during development. The bursts tripped the 24h
block the same evening. Lessons, already applied or planned:

- Fetch once per day. Never loop categories or regions to "speed things up".
- Validate the body, not only the status. A blocked answer is HTTP 200.
- The daily window seeded before the block (389 approved posts) stayed intact.
  Nothing was deleted or corrupted. Only new fetches were frozen until the
  block lifts.
