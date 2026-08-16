# Multikino (multikino.pl) provider — integration facts

Everything below was verified against the live site on 2026-08-16. The purpose of this
file is to let an agent implement the `multikino` seed provider without re-researching
the portal.

## Portal architecture

- `https://www.multikino.pl` is a Next.js SPA backed by Sitecore JSS.
- All real-time cinema/showtimes data comes from a **JSON microservice** exposed at:
  `https://www.multikino.pl/api/microservice/...`
- No browser rendering is required. A plain `fetch` is sufficient. The page HTML is
  client-rendered for showtimes, so scraping the HTML of `/repertuar/...` pages will
  NOT contain showtimes.

## Auth (required)

The per-cinema showtimes endpoint returns `401` **unless** an anonymous session cookie
is present. Flow:

1. `POST https://www.multikino.pl/api/microservice/auth/token`
   - Headers: `Accept: application/json` (no body needed).
   - Response: `{"result":{"accessToken":null,...},"responseCode":0}` — the actual
     value is irrelevant.
   - Response `Set-Cookie` headers set (HttpOnly, cookie jar must persist them):
     - `microservicesToken` — JWT, expires after ~12 h. **This is the one that matters.**
     - `microservicesRefreshToken`
     - `accessTokenExpirationTime`, `refreshTokenExpirationTime`
     - plus Cloudflare `__cf_bm` / `__cflb` (harmless to keep).
2. Send the cookie jar (at minimum `microservicesToken`) on all following
   `/showings/*` requests.

The token is valid for ~12 h and can be reused across all requests in a run. Refetch it
when a call starts returning 401.

## Endpoints

Base: `https://www.multikino.pl/api/microservice`

### 1. Cinema / city list

`GET /showings/cinemas?minEmbargoLevel=1`

Returns 17 city groups, 38 cinemas total. Shape (group per city `alpha`):

```json
{
  "result": [
    {
      "alpha": "B",
      "cinemas": [
        {
          "cinemaId": "0006",
          "cinemaName": "Bydgoszcz",
          "fullName": "Bydgoszcz",
          "venueCurrency": "PLN",
          "itemName": "Bydgoszcz",
          "whatsOnUrl": "https://www.multikino.pl/repertuar/bydgoszcz/teraz-gramy",
          "isSecondaryMarket": false,
          "prolongingBookingTimer": 15
        }
      ]
    }
  ]
}
```

Notes:
- `cinemaId` is **zero-padded, 4 chars** (`"0006"`, `"0013"`). Using a non-padded id
  (e.g. `143`) causes `401`. Use exactly the value returned.
- `whatsOnUrl` contains the city slug used by the geo step (section below).
- This list is effectively static; cache it.

### 2. Available showing dates

`GET /showings/showingDates?cinemaId={cinemaId}`

Returns up to ~54 days ahead, each `{"showingDate":"YYYY-MM-DDTHH:MM:SS","hasShowings":bool,...}`.
Only a rolling ~7-day window has a full schedule; further days typically have 1–2
pre-sale/special events. **The provider collects only the target day**, so dates from
this endpoint are informational.

### 3. Films + showtimes for one cinema on one date (main endpoint)

`GET /showings/cinemas/{cinemaId}/films?showingDate={YYYY-MM-DD}&minEmbargoLevel=1&includesSession=true&includeSessionAttributes=true`

Response `result` is an array of films. Each film contains:

```json
{
  "filmId": "HO00002696",
  "filmTitle": "Spider-Man: Całkiem nowy dzień",
  "posterImageSrc": "https://www.multikino.pl/-/media/.../spider-man_plakat.jpg?rev=...",
  "panelImageUrl": "https://www.multikino.pl/-/media/.../banner.jpg?rev=...",
  "filmUrl": "https://www.multikino.pl/filmy/spider-man-calkiem-nowy-dzien",
  "runningTime": 150,
  "synopsisShort": "...",
  "genres": [],
  "hasSessions": true,
  "hasTrailer": false,
  "showingGroups": [
    {
      "date": "2026-08-17T00:00:00",
      "sessions": [
        {
          "sessionId": "82383",
          "bookingUrl": "/rezerwacja-biletow/podsumowanie/0013/HO00002696/82383",
          "startTime": "2026-08-16T14:15:00",
          "endTime": "2026-08-16T17:06:00",
          "showTimeWithTimeZone": "2026-08-16T14:15:00+02:00",
          "isSoldOut": false,
          "screenName": "Sala 2",
          "duration": 150,
          "attributes": [
            {"name": "NAPISY", "attributeType": "Language", "value": "NAPISY"},
            {"name": "2D", "attributeType": "Session", "value": "2D"},
            {"name": "Single Seat", "attributeType": "Session", "value": "Single Seat"}
          ]
        }
      ]
    }
  ]
}
```

Notes:
- `showingGroups` is keyed by the requested `showingDate`; with `includesSession=true`
  the sessions array is fully populated in this one response (no extra call needed).
- `attributes[].attributeType` distinguishes `Language` (NAPISY / DUBBING / `ua`) from
  `Session` (2D / 3D / MEGAHIT / SUPERHIT). `value` and `name` carry the human string.
- `showTimeWithTimeZone` gives an explicit offset (Poland is `+02:00` in summer).
  `startTime`/`endTime` are local wall-clock without offset.
- Empty / low-activity days (pre-sales) may return a film list where only 1–2 films
  have `hasSessions: true`. That is normal.
- A full day across all 38 cinemas is ~25 films, ~536 film×cinema events, ~1304
  sessions, ~2.8 MB raw JSON. Average payload ~74 KB per cinema per full day.

### 4. Supporting endpoints (not needed for the main flow)

- `GET /showings/films` — all ~80 films currently in the catalogue (same film shape,
  without per-cinema sessions; includes `hasTrailer`, `trailers`).
- `GET /showings/cinemas/{cinemaId}/films/{filmId}/showingGroups?showingDate={date}`
  — sessions for one film (already embedded via `includesSession=true`).

## Geo (lat/lng + address) per cinema

The microservice does **not** return coordinates or addresses. They are only present in
the server-side-rendered HTML of the city repertuar page:

`GET https://www.multikino.pl/repertuar/{city-slug}/teraz-gramy`
(city-slug comes from each cinema's `whatsOnUrl`.)

The page is regular SSR HTML (parseable, no JS needed). Extract:

NOTE: Open question - how to get geo coordinates from the page on CF easlier?
- Coordinates from the Google Maps embed iframe:
  `<iframe ... src="https://www.google.com/maps/embed/v1/place?key=...&q={lat}, {lng}" ...>`
  regex: `maps/embed[^"]*q=(-?[\d.]+), ?(-?[\d.]+)`
  Example (Poznań): `52.40276672871932, 16.9306668234985`.
- Address from the block `cinema-location__address-holder` — plain text lines, e.g.
  `ul. Półwiejska 42` / `61-888 Poznań`.
- The page also contains a directions link ("wskazówki dojazdu") if needed.

These 38 pages are static. Fetch once per cinema and cache the result.

## Images / thumbnails

Media is served from Sitecore (`/-/media/...`). Resizing is supported via query params
appended to `posterImageSrc`:

- Original poster: `posterImageSrc` (~76 KB webp).
- Thumbnail: append `&mw=240&mh=350` → ~30 KB jpeg (verified).
  (`mw` = max width, `mh` = max height; `iar=0` keeps aspect via fit.)

## Links

- Session/event: `https://www.multikino.pl` + `bookingUrl`
  → e.g. `https://www.multikino.pl/rezerwacja-biletow/podsumowanie/0013/HO00002696/82383`
  (direct booking deep-link for that exact screening).
- Film: `filmUrl` (e.g. `https://www.multikino.pl/filmy/spider-man-calkiem-nowy-dzien`).
- Cinema: `whatsOnUrl`.

## Trailer (optional)

- `hasTrailer` flag is present on film objects (≈30 of 80 films). The `trailers` array
  is empty in the API.
- The actual HLS stream is embedded only in the **film detail page** HTML
  (`GET https://www.multikino.pl/filmy/{slug}`), as a Cloudflare Stream manifest:
  `https://customer-{...}.cloudflarestream.com/{id}/manifest/video.m3u8`
  regex: `[a-zA-Z0-9_\-\.:/]+\.m3u8`.

## Headers / etiquette

The API accepts a plain browser-ish User-Agent. No other headers are strictly required
once the cookie is present. Keep a small delay between rapid requests; heavy bursts can
trigger `401` responses on `/showings/cinemas/*` even with a valid token (back off and
retry, or refetch the token).

## Failure modes observed

- `401` on `/showings/cinemas/{id}/films` → token cookie missing/expired; refetch
  `auth/token` and retry.
- `401` with a valid token after many rapid calls → treat as transient throttling; wait
  and retry.
- Non-padded `cinemaId` (e.g. `143`) → `401`.
