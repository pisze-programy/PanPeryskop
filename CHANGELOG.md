# Changelog

All notable changes to PanPeryskop. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versions follow
[SemVer](https://semver.org/).

## [1.3.0] — build 51, 2026-09-20

### Fixed
- Restaurant pins keep the red gradient with the fork and knife glyph and the
  star badge — the shared photo is only the story background, never the pin.
- Restaurant pages open in the in-app browser. Their domains are outside the
  fixed allow-list, so the first navigation was handed to Safari.
- Restaurant cards show the street address, not just the cuisine and city.
- The story badge strip no longer shows a meaningless "RESTAURANT" source badge
  next to the "Restauracje" tag.

## [1.3.0] — build 50, 2026-09-20

### Added
- "Restauracje" tag: 49 curated Michelin Guide places (11 stars and 38 Bib
  Gourmand) across Polish cities. Stars show a corner badge on the pin; the card
  names the distinction and links to the restaurant's own website. Places are
  evergreen — they appear on every day, not tied to an event date.
- Every restaurant shares one placeholder photo, served from the backend like any
  other event image.

### Changed
- Changing the airport on the trips minimap no longer makes the "Samolot" filter
  jump: the minimap sync no longer echoes a programmatic position back as a user
  selection.

## [1.3.0] — build 49, 2026-09-20

### Changed
- Wycieczki map pins carry identity: a match draws a gradient of the two team
  colours with the stadium glyph, a run draws its distance-palette gradient with
  the runner. Group pins stay the same but get a faint blue sheen so they are not
  fully static.
- Partner banner chevron was drawn in the gradient's own end colour and was
  therefore invisible; it now uses the banner foreground. The eSIM banner reads
  "Karta eSIM — bez limitu w Europie!" / "Poczuj wolność na wyjeździe, od 16 zł".
- Choosing a bus day no longer pins that day to the screen edge; the strip keeps
  its position, like the flight timeline.

## [1.3.0] — build 48, 2026-09-20

### Added
- Return bus section in Wycieczki: a second, independent direction (event city →
  origin) with departures from the event day forward a week. Both directions
  share one component.

### Changed
- Bus offers are listed by departure time; the fastest is badged "Najszybszy,
  <czas>" in green and the cheapest price is green, with a "Najtańszy, <czas>"
  note. The route header sits above the day tabs, and the event day is marked
  with a border and the event icon.
- Bus loading, empty and error states share the offers-card shape, so switching
  days no longer makes the sheet jump.
- Partner banners use a horizontal gradient (blue left, red right for Airhelp;
  a warm cream-to-orange for the eSIM card), and the chevron carries the
  gradient's end colour.

## [1.3.0] — build 47, 2026-09-20

### Added
- Bus day tabs in Wycieczki: a week of departures ending on the event day, opened
  on the event day and scrollable back, so a morning departure can still make an
  evening event. Picking a day reloads the offers.

### Changed
- Bus card now leads with the route ("Poznań → Berlin") and lists up to three
  departures, the cheapest first and then the earliest. The whole card opens the
  booking page; the chevron only marks it as tappable.
- Flights with no fare left for the day now read "Bilety wyprzedane".
- Partner banners are compact: the call-to-action pill is gone and the chevron
  sits on the right, so the two banners take a fraction of their old height and
  no longer outweigh the core sections.

## [1.3.0] — build 46, 2026-09-20

### Added
- Partner banners under the attractions in a Wycieczki event sheet: an Airhelp
  flight-compensation card and an Airalo eSIM card. Full-width cards with the
  partners' own colours, rounded corners, a clear call to action and a chevron;
  the whole card opens the partner page in the in-app browser. A revenue
  add-on, kept separate from the core sections.

## [1.3.0] — build 45, 2026-09-20

### Added
- Anonymous usage analytics on the backend: which features are used (events,
  flights, buses, attractions, stays, outbound link clicks) as daily totals,
  with no user, device or IP. A `/r/:token` shortlink counts booking clicks and
  redirects. Error monitoring (Sentry, EU) reports failures without any
  identifier. The privacy policy names the processors and the legitimate
  interest.

## [1.3.0] — build 44, 2026-09-19

### Added
- Bus option in Wycieczki next to the flights: a "Samolot | Transport publiczny"
  dropdown (default Samolot) switches the section between the flight board and
  live FlixBus offers from the origin city to the event city, showing the
  cheapest ride ("od XX zł"), its hour and duration, and a "Sprawdź na FlixBus"
  button that opens the prefilled booking page. No route shows an honest "Brak
  połączeń busem", a failure shows retry — never a made-up fare.

### Changed
- Onboarding screen rebuilt around a looping background video: the full 15-second
  clip plays behind a bottom-anchored dark gradient, with a small logo and app name,
  the headline "Jedna mapa", a subheadline, and the white Sign in with Apple button.
  The clip is muted, paused in the background, and replaced by a plain background
  when Reduce Motion is on.

### Changed
- Wycieczki explorer: entering Europe or changing the city now frames the whole
  continent at the maximum manual zoom-out, so every arc and event is visible.
- Hotel map: the "Zobacz więcej" list opens at the large detent instead of medium.
- Trips sheet: a flight change no longer re-renders the hotel map for anchors that
  are tied to the event location ("Przy wydarzeniu", "Centrum").
- Toasts (day change, loading, empty) sit directly above the Lokalne | Europa
  switch instead of a fixed offset.
- Category switch: the loader shows next to the Lokalne | Europa labels, not on the
  Home icon.
- Distance chips in a run hero scroll only when they do not fit.
- In-app browser loads cleartext provider links (ATS) and shows a visible failure
  state instead of a blank page.
- Europe event map flags: an empty-image pin uses the same glyph as the story
  preview placeholder; no airplane leaks into local events.

## [1.3.0] — 2026-09-11

### Added
- Wizzair flights in Wycieczki next to Ryanair: every destination served by both
  carriers gets its own flight board (prices, hours, best pair) sorted cheapest
  first, with its own brand-coloured "Kup w Wizzair" / "Kup w Ryanair" button and
  its own booking link. The route rail names every carrier that flies it.
- Wycieczki has no invented fares left: a failed or empty live lookup shows "Nie
  udało się pobrać lotów" with a "Spróbuj ponownie" retry.
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
- Biegi (runs) in Wycieczki: worldsmarathons.com as a second event provider
  (90-day backfill + weekly VPS replenish, Europe-filtered, `meta` carries
  distance/surface/start time/price), and a run-specific sheet hero (distance,
  details, venue map) sharing the flight timeline with a "BIEG" marker.
- Wycieczki tag bar: a default "Wszystkie" pill and a per-tag event count badge
  (`GET /travel/tag-counts`, Europe-wide for the selected day).

### Changed
- Wycieczki events are fetched Europe-wide: the artificial airport-centred bbox
  is gone, so reachable Portugal/Iceland/Ireland events are no longer clipped.
  The per-tag badge is derived from the same response as the pins, so badge and
  pins always agree, and toggling a tag makes no request. `GET /travel/tag-counts`
  is removed.
- Ryanair and Wizzair route snapshots re-pulled from the carriers.
- Wycieczki events show up immediately and refine themselves: the map pins come
  from D1 at once, the flight-reachability filter lands a moment later (the
  response says `enriched: false` and the app asks again). Reachability now walks
  the routes with a two-at-a-time pool, retries each route twice, caches Wizzair
  timetables per route and month for 24 h and failed routes for 5 minutes, and
  never invents a result: a route that fails simply does not count, and when every
  route fails the app shows the retry toast. Cold month: 2.2 s for the pins,
  filtered answer right after (0.2 s), cached after that (0.08 s).
- Wycieczki match header shows the league (ESPN league id → name, stored at
  ingest), the "vs" label is gone, and the bar has room above the sheet handle.
  The hero leads with the stadium name (bold) and the city, left-aligned above
  the map.
- Wycieczki run hero drops the provider surface/difficulty tags; the distances
  read inline ("Dystans: 5 km, 10 km") and the sticky header keeps the run title
  with the distance under it and the date on the right.
- A match whose location is only the city airport (10% of matches, no venue
  geocode) hides the map and says so instead of pinning the wrong place; a real
  stadium coordinate zooms in to the 3D stadium.
- Best-flight pick now trades the fare against the hotel nights a trip forces
  (350 zł per night, 500 zł on a Saturday): a cheap fare a week before the event
  loses to a dearer one the day before, because the extra nights cost more than
  the fare saves.
- Story card badges (SPONSOROWANE / tags / source) moved to the bottom so they
  no longer crowd the title.
- Event tag chips always show their count (zero included); chips sort by count
  (desc, then alphabet), with "Inne" pushed last when empty.
- Sport + Sztuka tags retired — their events are reassigned to "Inne".
- MTP (Targi Poznańskie) events are now all-day (start 00:00 instead of 10:00).
- Wycieczki flight calendar now spans ±7 days around the event and marks "dziś";
  the sheet hero shows the event hour, and the match sheet zooms to the stadium
  (3D).
- Wycieczki booking CTA appears with a single selected flight (one-way link) or
  two (round trip); "Wszystkie" is the default tag; the chosen airport is
  remembered; the map defaults/max zoom out covers the whole of Europe.
- A small loader on the category switcher (Wydarzenia left, Wycieczki right)
  shows during day/place fetches, kept for at least 250 ms.
- Wycieczki sheet sections: Noclegi (Ekonomiczne / Polecane / Premium filter),
  Atrakcje, Transport (mini-map + Google Maps), Wynajem samochodu and
  Ubezpieczenie. A "Zobacz więcej" tile opens a full vertical list, and every
  section shares one planner state (chosen flight + hotel).
- New `GET /travel/places` supplies the section items (deterministic catalogue
  until a real provider exists).
- Flights draw as curved arcs; the flight loader is a day-cell skeleton, so the
  section no longer jumps while prices load.

### Fixed
- Wizzair flights self-heal when Wizzair retires an API version: the backend
  now refreshes the cached version on HTTP 503 (was 404 only) and the fallback
  is 29.17.0, so the 29.16.1 retirement no longer blanks the flight boards.
- Wycieczki tag badges match the map pins: the count is the reachable events per
  tag for the selected day, not the whole of Europe.
- Wycieczki: changing the airport no longer wipes the map. The previous pins stay
  until the new ones arrive, a new choice always cancels the request in flight,
  and a failed or too-slow load (10 s) shows a short "Coś poszło nie tak, spróbuj
  ponownie" toast instead of a dead spinner.
- Wycieczki reachability now looks up fares only for the airports near the day's
  events (2-8 instead of 89-208 routes): the first load on a new airport drops
  from 10-27 s to 1-3 s. The event list is unchanged.
- Run events use the provider's local date and time (was UTC): the date no
  longer shifts by a day and an unknown start time is hidden instead of shown as
  a wrong hour (e.g. 22:00).
- Wycieczki sheet: changing the destination airport no longer resizes the sheet
  (the flight card keeps its height while prices load).
- Wycieczki hero CTA: soccer shows "Zobacz więcej" (was "Kup bilet"), and a run
  without a price shows "Zobacz więcej" too.
- Hotel and attraction cards open the in-app browser instead of the system
  browser (booking.com / getyourguide.com / espn.com added to the allow-list).
- Wycieczki sheet keeps a consistent gap to the handle for grouped and single
  events.
- The in-app browser is a separate sheet now: closing it keeps the event sheet
  open underneath.
- Soccer matches show the venue's local time and date (were shown in the app's
  timezone, so UK/Portugal were off by an hour). Existing matches were updated.
- Soccer crests use the club's real colour from the provider (was a generated
  colour); existing matches were updated.
- The flight CTA is a full-width button like the hero: it reads "Wybierz lot aby
  kupić bilet" until a leg is picked, then "Kup bilet" / "Kup bilety" with the
  price.
- Hotel and attraction previews load the full list, so "Zobacz więcej" stays
  after switching the hotel filter.
- The "Open in" map picker no longer closes the event sheet; groups no longer
  jump horizontally on first load; the event pager is off for a single event and
  the airport rail is off for a single airport.
- Soccer matches show the provider's team codes (BEL, FRA, …) on the crest
  instead of generated initials; existing matches were re-fetched.
- Wycieczki sheet no longer flashes full width before settling to its padding.
- The flight CTA is always visible: it enables once at least one leg is picked
  and disables when both are cleared. It buys a one-way outbound, a one-way
  return, or both, and reads "Kup bilet" / "Kup bilety".
- The destination-airport picker is a swipeable map rail (arc + route label +
  dots) instead of the blue pills; swiping changes the airport.
- Tapping the selected flight day again deselects it.

### Changed
- Bottom navigation is now the category switch: Mapa (Wydarzenia), Samolot
  (Wycieczki), Profil. The floating category pill and the "+" UGC button are
  gone; adding content is temporarily disabled (screen kept, no entry point).
- "Wyloguj się" moved to the Profile screen; Settings keeps only account
  deletion. The events icon in the bottom bar is a home icon.
- Events and Trips: tags are multi-select (all by default, the last one stays
  on, the choice is remembered) and the "Wszystkie" chip is gone. A Data chip
  opens a day sheet (0–5 days for events, 0–89 for trips) synced with the day
  rail; a past day falls back to today on launch.
- Onboarding lists the real benefits: European trips (event, flights, stay,
  attractions), local events, and what is happening nearby.
- The trips sheet shows a compact sticky header once the hero scrolls away —
  team crests (soccer) or the race distance (runs) plus the event time — and
  tapping it scrolls back to the top.
- Soccer sheet shows the stadium name (from the provider) and a soft team-colour
  gradient across the full sheet width; the destination map marks the arrival
  airport with a landing-plane icon; the section heading reads "Wybierz lot".
- Trips sheet: the gamestrip is a fixed top inset of the page (`safeAreaInset`),
  so it stays glued to the top while the page scrolls under it and never leaves a
  gap when the page overscrolls. One constant look, on an opaque background with
  two soft radial team-colour glows and a soft bottom shadow.
  Soccer puts the crests and names on the sides with "vs" and the date · time in
  the centre; runs show the race name in the bar. The group dots sit at the bottom
  of the bar. Below it both kinds use one shared detail layout: headline, optional
  tags, city, map and ticket button, all left aligned. The run distance and tags
  show here; soccer shows the stadium name.
- Loading never resizes the sheet: the ticket strip, the buy button, the
  destination rail and the place cards all keep a fixed height between their
  skeleton and their loaded state.
- Wycieczki sheet scrolls smoothly: event cards are built only as they come on
  screen, the map behind stops refreshing while trips is open, the sheet is
  opaque, hotels and attractions load once instead of every time the section
  scrolls in, and the ticket strip no longer uses a mask.
- The full hotel or attraction list opens as a sheet over the event card, so the
  card underneath is not rebuilt and the chosen flights stay.
- "Noclegi" shows live hotel prices on a Stay22 map widget instead of invented
  cards: Booking.com hotels only, pick the area (Przy wydarzeniu / Centrum /
  Przy lotnisku), the dates follow the chosen flights, and a tap opens a
  full-height sheet with the chosen date range under the title and one
  "Dostosuj" list (Lokalizacja, Cena — "Za noc" by default or "Za całość (3 noce,
  11-14 listopada)", Standard, Ocena gości). Hotel cards open Booking in the
  system browser. Before a flight pair is chosen the dates default to the night
  before the event. The map loads only when the section scrolls into view, and
  WebKit is warmed up in the background. The fake hotel, car and insurance
  catalogues are gone.
- The "Atrakcje" section shows real tours and activities from Viator for the
  event's city: photo, title, rating, duration, free cancellation and a
  "Sprawdź dostępność" link that opens the Viator page in the in-app browser.
  Hotels and other local rows stay as they were. The Viator destination
  catalogue is refreshed weekly and products are cached per city for a week.
- Run events show the distance range in the bar ("10 km – 21.1 km") and every
  offered distance as "Dystans:" tags above the map, smallest first.
- Run colour scales from light (short, asphalt) to dark (long, trail, ultra) from
  the provider's real distance, surface and difficulty.
- Run surface and difficulty show Polish labels (Asfalt, pagórkowaty, …).
- Race links stay in the in-app browser with a wider policy (they redirect to
  external hosts); other links still use the fixed list.
- The tapped map pin sits lower (0.40) so it is not hidden under the filters.
- Swiping between events in a group no longer jumps, and returning from
  "Zobacz więcej" keeps the sheet at full height.
- Events download by 50 km squares: moving the map inside a downloaded square
  makes no request; leaving it downloads only the new squares (max 5 kept). The
  20s refresh downloads only the squares on screen.
- Wycieczki sheet loads lazily: flights only for the active page, and place
  sections only when they scroll into view. The flight loader re-runs when the
  page comes back from the hotel list, so it never spins forever. The buy button
  reserves its exact height while loading, so the content does not jump when the
  prices arrive. The full list loads on "Zobacz więcej" and fetches more as you
  scroll.
- "Zobacz więcej" expands the same sheet to large and shows the list inline, with
  a native back button and a loading skeleton.
- The expanded list shows the details first and a full-width image below, with a
  right chevron per row.
- Changing the destination airport swaps the flight prices in place; the sheet
  no longer jumps or blanks.
- Tapping the venue map opens a picker for Google Maps or Apple Maps.
- Hotels: the filter is a bottom sheet (default Ekonomiczne) and the price shows
  "X zł za noc" with the total for the chosen number of nights.
- One accent colour for all CTAs; clearer section headers and spacing.
- Transport, car rental and insurance sections are hidden until their data
  exists.

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