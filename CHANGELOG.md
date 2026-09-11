# Changelog

All notable changes to PanPeryskop. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versions follow
[SemVer](https://semver.org/).

## [1.3.0] — 2026-09-11

### Added
- Wycieczki (Trips) category on the map: pick a Polish origin airport, browse
  European soccer + running events per day (0–89 day slider), native bottom
  sheet with a Ryanair-style flight calendar (outbound before / return after the
  event), multi-airport rail with best-pair pre-selection and "Lecimy ✈" booking.
- Live Ryanair flight prices: backend fetches the open farefinder endpoints
  (`availabilities` + `cheapestPerDay`, no bot-wall), cached in D1
  (`flight_cache`); events are filtered to only those reachable by air from the
  chosen origin (geo ≤200 km + strict before/after flight window), each tagged
  with its `reachableAirports`.
- In-app browser now blocks geolocation / push-notification prompts from
  providers (JS stubs + camera/mic capture denied).

### Changed
- Story card badges (SPONSOROWANE / tags / source) moved to the bottom so they
  no longer crowd the title.
- Event tag chips always show their count (zero included); chips sort by count
  (desc, then alphabet), with "Inne" pushed last when empty.
- Sport + Sztuka tags retired — their events are reassigned to "Inne".
- MTP (Targi Poznańskie) events are now all-day (start 00:00 instead of 10:00).

## [1.2.1] — 2026-09-08

### Added
- Map tag filter badges: each tag chip (and "Wszystkie") shows the number of
  approved events for the selected day in the selected city. City-scoped (not the
  map viewport) via the new `GET /stories/tag-counts?city=&day=` endpoint; hidden
  when zero. Counts refresh on app start and on city/day/category/tag change —
  never polled (seeds change ~every 3 days).

## [1.2.0] — 2026-09-07

### Added
- Seed cadence: full-window refill every 3 days (was daily far-edge rolling).
  The refill covers `[today..today+SEED_DAYS_AHEAD+2]` so the app window
  `[today..+5]` is never left with unseeded days between refills. Nightly
  warm jobs (kupbilecik / Awin) run only on seed days (~1/3 the kupbilecik API
  requests). Cadence marker lives in D1 (`seed_cadence`), read by the VPS
  orchestrator and the warms via `GET /admin/seed/cadence`.
- Digest: day-done email now fires only for the current far edge; the watchdog
  scopes missing-provider checks to the last refill window.

### Changed
- App browse window: 5 days forward (was 3) — `DaySliderView` maxDay 3→5.
- `SEED_DAYS_AHEAD` 6→5.

### Fixed
- MTP (Targi Poznańskie) posts had no thumbnail — the map pin resolved a
  non-existent `posts/{id}/thumb.jpg`. Seed posts now carry `thumb_key = media_key`
  (poster reused as thumbnail); 290 existing MTP posts backfilled.

### Changed
- Notifications: Wydarzenia never push. The "new media nearby" notifier now
  delivers Live only; the Wydarzenia toggle was removed from Settings.
- Event tag + source badges on the story card are now dark gray (adaptive to the
  color scheme); SPONSOROWANE / WYPRZEDANE keep their orange / red colors.

## [1.1.0] — 2026-09-05

### Added
- Eventim (Awin affiliate datafeed), MTP annual backfill, going TradeDoubler
  affiliate links, streaming kupbilecik warm, manual Facebook ingest.