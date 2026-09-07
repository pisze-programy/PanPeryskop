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
5. **Egress / budget (hard-won, 2026-09-07):** access is keyed on the token and
   the usable budget is roughly **10 requests/day TOTAL** (all IPs share it).
   Exceeding it flips the API to a generic **404 HTML page** ("Strona nie
   znaleziona") for every subsequent request — from any IP (home, datacenter,
   proxy), until the window clears. We exhausted it by burst-testing (≈25
   requests across mac/box/CF/webshare) and everything 404'd for the rest of
   the day. Also: Cloudflare Workers egress gets **403** (their HTML page) and
   the Webshare residential pool also 404s once the token budget is gone. The
   warm therefore makes exactly one request per day, and nothing else calls the
   API — never probe, never retry in a loop.

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

The nightly warm fetches the catalog once and trims per-day manifests to R2.

- Runs **00:01 Warsaw** on the VPS box via root crontab:
  `node --max-old-space-size=128 backend/dist/kup-warm.mjs` (see `setup-vps.sh`).
  Clean env — no residential proxy (an 8 MB gzip download does not pay proxy
  bandwidth).
- **Separate lightweight bundle** (`kup-warm.mjs`, ~18 KB) imports ONLY the
  kupbilecik module — NOT the whole orchestrator. The 256 MB box OOM-killed
  (3×, 2026-09-07) when the full vps-seed bundle (≈80 MB baseline, 170 MB heap
  cap) ran the warm concurrently with the orchestrator; the standalone bundle's
  baseline is ~20 MB with a 128 MB cap.
- **Exactly one catalog request per warm** (bounded retries: up to 3 attempts,
  still far below the ~10/day token ceiling — see §3). Send **minimal headers**
  only: `User-Agent: Mozilla/5.0`, `Accept: application/json`. Browser extras
  (`X-Requested-With`, `Referer`, `Accept-Language`, `text/javascript` Accept)
  were verified to flip the catalog request to their 404 page on 2026-09-07.
- **Streaming scanner** (`scanKupEvents` in `backend/src/seed/providers/kupbilecik.ts`)
  never materializes the ~60 MB decompressed JSON: gzip arrives on the wire
  (~8 MB), the scanner walks the stream, parses one top-level object at a time,
  drops heavy fields (Description/Artist) and buckets the rest per window day.
- **BYTE-LEVEL scanning** (memory-critical on the 256 MB box): the scanner reads
  raw `Uint8Array` bytes, never per-char strings. A string-based version
  allocated one 1-char string per input character (~60 M allocations → V8 heap
  spike ~90–190 MB, a real OOM-killer contributor on 2026-09-07). Structural
  bytes are ASCII (< 0x80) and UTF-8 continuation bytes are ≥ 0x80, so
  multi-byte characters cannot collide with them. Measured overhead on a 60 MB
  catalog with realistic (mostly out-of-window) retention: **~1 MB**. Peak warm
  memory ≈ bundle baseline (~20 MB) + one event.
- Manifests are pushed through `POST /admin/seed/kupbilecik/day` (Worker admin
  endpoint → R2 `seed/kupbilecik/<day>.json`). The whole window
  (today..today+SEED_DAYS_AHEAD) is refreshed every night, so one missed run
  never kills a day.
- **Failure mode stays loud:** a block/empty/shape body aborts with nothing
  pushed (never empty manifests). If the warm fails, the morning seed batch
  throws `manifest missing` → failed-mail alarm. Manual run:
  `node backend/dist/vps-seed.mjs --warm-kup` on the box; log
  `admin/vps/logs/warm-kup.log`.

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
