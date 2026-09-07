# Changelog

All notable changes to PanPeryskop. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

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

## [1.0.0] — first tagged release

Seed pipeline foundation: Worker queue (kupbilecik / ebilet / eventim) + VPS
executor (going / luma / meetup / helios / cinemas), TradeDoubler affiliate
links (going), Awin affiliate datafeed (eventim), streaming kupbilecik warm,
MTP annual backfill, manual Facebook ingest, digest emails.