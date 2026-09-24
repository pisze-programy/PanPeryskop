# Changelog

All notable changes to PanPeryskop. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- The running events source (maratonypolskie) runs on the Worker, so it costs no
  proxy data. Every running post carries one shared poster, and the run story
  draws its own mask over it: the event name, the city and the distance.
- A club night draws its own story mask over the shared club photo: the event
  name, the lineup and the club.
- A restaurant draws its own story mask: the distinction in gold, the name in a
  serif face and the cuisine, anchored at the top over the shared photo. The
  story card of a restaurant, a club night and a run is always dark, so the text
  never sits on a pale band.
- A city photo loads in the scaling flow: the bundled thumb first (instant,
  offline), then the served thumb, then the served large. The pin, the "W
  okolicy" cards and the city hero all use it.
- The flight calendar opens on the current month (a departure inside the last
  three days of a month moves to the next one), and the return calendar follows
  the departure month. A city break can last up to two months, not a week.
- City breaks. The Europa map shows European cities with a photo, beside the
  running events and the football matches. A city opens a sheet with the
  airports that serve it, the flights, the stays, what to see, the cities near
  it, the events within 50 km and the country facts.
- The city list is rebuilt from one source: 327 European cities with a Polish
  name, a position, the airports, the cost, the scores, the weather, the
  neighbours and a photo credit. The list ships to the app as a seed.
- The city page runs on the same parts as an event page: one sheet with one
  horizontal pager, and a page is an event or a city.
- Tapping a city flies the camera above the sheet and opens the flight layer
  with the city's airports and their arcs, exactly like tapping an event.
- A global region: region, country, language and currency in one place, read
  from the environment, changeable in onboarding and the profile. Country names
  come from Foundation, and a provider word with a fixed language goes through
  one map per language with a fallback to the original.
- The city events row: running events and matches within 50 km, from today for
  90 days, with the category, the day, the hour when the source has one and the
  distance from the city. A match card carries the two club crests in their own
  colours, a run card carries the run colour and its distance tags.
- The city events row groups by kind: a football card and a running card end on
  the same line, and a run shows two distances with the rest behind "+N".
- The event sheet has the same airport row as the city sheet: the airport name,
  its distance from the centre and a "Jak dojechać?" button that opens Google
  Maps in transit mode.
- The event sheet lists the cities near the venue, between the flights and the
  stays, with the distance to each.
- A frames-per-second readout for the test builds, and a release flag that turns
  it off.
- A Ticketmaster seed source for Poland, on the open Discovery API. It runs as
  one window unit, paced at 600 ms a page, and ranks below every other source so
  it only fills the gaps.
- A Resident Advisor seed source for the Polish clubs: Warsaw, Krakow, Wroclaw,
  Gdansk and Poznan. It ranks below every other source and carries its own
  lineup, genres, club, age and price.
- A club night card, composed from a shared photo layer: a dark backdrop, a
  band with the club and the lineup, and the same info box as the restaurant
  card. The source sends no flyer.
- A source can declare that its card draws its own background, so an empty image
  does not hold its posts back.
- A blacklist rule is scoped by source and can match an exact title. A rule that
  names its providers cannot touch the others.
- Every city photo comes from Unsplash, with the author and the photo page in the
  credit. No photo links the Nomads file any more.

### Changed

- One cluster for the whole map. Cities and events cluster together, with one
  radius, one look and one tap, so one filter set gives one cluster of
  everything on the map. The zoom span decides the radius: a country shows
  single pins, a continent shows clusters.
- The cluster behaviour is a parameter of the map: the continent keeps its old
  values and the local map gets its own cell size, longitude correction and
  anchor, because one rule cannot serve both a continent and a city street.
- The map no longer draws 3D terrain. The realistic elevation was the largest
  single cost of a camera move at the 60 degree pitch.
- The city tiles read as a label and a value. Air quality reads in words only.
  A positive score is green and nothing else, and a missing value is "---".
- The flight picker keeps its two calendars and stops choosing for the user: no
  dates are written until a day is tapped, the two months are independent, and
  the buy bar enables on an outbound alone so a one-way ticket works.
- The calendar header reads in two lines: the month in a small bold face with
  its arrows centred, the leg below in grey as "Wylot: POZ → BGY". The night
  count sits on the buy button, next to the price.
- Every flight month opens with the skeleton for at least a second, even from
  the cache, so a month change reads the same every time.
- The week starts on Monday, whatever the device region says.
- The city thumbnails in the app bundle are lighter: they are always drawn
  smaller than the file, so the extra quality was dead weight.

### Fixed

- The Lokalne map opens the story preview again when a cluster is tapped.
- A city is reachable through the airports around it, so Poznan reaches Milan
  through Bergamo, and the bus appears only when no airport of the city flies.
- City pins stop jumping: a regroup needs a real change of the radius, not the
  span drift a tilted camera produces while panning.
- The flight requests are paced. One provider call at a time, 600 ms apart, and
  two callers for the same month share one request.
- A venue name with its hall in brackets no longer splits one event into several
  posts: "Sinfonia Varsovia (Namiot)" and "(Aula)" fold onto the building.
- A seed description keeps a title that holds the separator whole, so
  "Koncert przy świecach – La Notte Italiana: włoska noc przy świecach" matches
  its blacklist rule.
- A provider link with a doubled scheme ("http://Http://…") is repaired on the
  way in and on the way out, and the books of the run guide open again.
- The Polish night count inflects: 1 noc, 2 noce, 5 nocy.
- A Ticketmaster or Resident Advisor link opens in the app, not in Safari. Both
  hosts were missing from the in-app browser list.
- A club title stops repeating the lineup. The band already shows it, so the
  title keeps the night's name: "SZEPTY: SALVYAN, ANOLUXX, MONYAL" reads
  "SZEPTY", while a title that opens with the club keeps whole.
- The club card shows its photo. The photo sat in a bundle folder, and the old
  load looked for it at the bundle root, so the card drew a black frame. It now
  loads by its path, and the pin and the card read one shared club photo.
- Resident Advisor posts carry their club data to the app, so the club card
  renders instead of an empty frame, and the map pin has a photo.
- Two sources of one concert fold into one post, even when one source already
  produced the post in an earlier run. The club is matched by its name, not only
  by its internal id, so "Hydrozagadka" and "Klub Hydrozagadka" are one club.
- An event image that is absent is stored as absent, so a missing photo never
  becomes a broken URL.
- The bundled city thumbnails are rebuilt from the served photos, so a city
  whose photo changed (Oslo) no longer shows the old shot. The thumb cache now
  remembers its source URL, so a later change re-downloads it.
- The country on a run or a match card is shown in the reader's language,
  through the same helper the city card uses.
- The story mask no longer drifts to the right: the backdrop is pinned to the
  screen, so the club, run and restaurant bands stay centred. The restaurant mask
  sits below the top bar.
- The story mask is truly centred now: the backdrop is an overlay on a flexible
  base, so its `.fill` overflow can no longer widen the layout and push the band
  to the right. The restaurant band pads inside its frame.
- A story shows the cached photo on the first render, so switching between club
  nights (one shared photo) is instant — no black frame, no flicker. The mask
  band no longer animates in.
- A club price with several tiers shows the first price: "30,40,50" reads 30 zł,
  not 30405030 zł.
- A race link opens in the in-app browser, not Safari — a race site has any host.
- The story card never shows the data source. The SPONSOROWANE badge opens the
  price and external-link disclosure. A run story shows its distance instead of
  the city, and the day reads "27 września, Niedziela" like the day picker.
- The Lokalne map keeps its pins on a full zoom-out. The square cache never
  evicts a square that is on screen, and a region change is never dropped while
  a fetch is in flight.
- A story image loads in order: the thumb first, then the large — never both at
  once. A post without a thumbnail fetches its one image once. The next and
  previous story thumbs are prefetched, so a swipe is instant.
- The story and the map pins load again. A failed image was blocked for a minute
  and never retried; the block is gone, so a retry always follows a miss. A story
  also reads the cache on the first frame, so a cached photo shows at once.
- The city hero keeps its frame on every screen. The photo no longer widens the
  layout, so the name and the country are never cut on a narrower phone.
- A race link is the organiser's own site, read with a session cookie, or a web
  search when there is none. A real link opens in the in-app browser; a search
  opens in Safari. A race shows its real distance; a race without one shows none.


### Removed

- The city dots, the city count badges and the band table, which mixed three
  shapes on one map.

## [1.3.0] — build 60, 2026-09-21

### Fixed
- Wizzair sells by metro area, so it answers a Warsaw Chopin request with a
  Modlin flight and reports the real airport in the response. The app now reads
  that airport: the calendar header, the booking link and the airport map use the
  airport that really flies. Warsaw → Basel opens WMI → BSL, Kraków → Bergamo
  opens KRK → Malpensa, Warsaw → Ciampino opens FCO.
- Fares no longer mix airports of one metro area. Milan Bergamo and Malpensa are
  priced separately instead of taking one arbitrary flight of the two.

## [1.3.0] — build 59, 2026-09-21

### Changed
- A city-break sheet has no photo section: only the Wikipedia lead image is kept,
  as the sticky header background. When a city has no photo, the header shows the
  country gradient alone.
- The city sticky header fills its leading edge with the city photo, faded into
  the country → tier gradient.
- The flight calendar opens on the month picked on the map, and always marks the
  best fare of the month on screen.
- "Sprawdź dostępne terminy" is a single centred line again.

### Removed
- The city photo gallery and its R2 objects. The nearby-Commons source was not
  good enough; only the lead image and the pin thumbnail remain.

## [1.3.0] — build 58, 2026-09-21

### Added
- A city pin shows the city photo, and tapping it zooms the map, like an event pin.

### Changed
- A city hero is a gallery: up to five Wikimedia photos per city, laid out as a
  bento block for one to three and as a horizontal strip at 70 % of the width
  for more.
- The city header is the same gamestrip as an event header — one component, one
  height. The separate city header and its close button are gone.
- The flight sheet uses the standard sheet header ("Anuluj"), not a gradient bar.
- The return calendar opens the next month when the outbound is near the end of
  its month, so a 30.11 outbound offers December returns.

### Removed
- The "Połączenia" block on the city sheet.

## [1.3.0] — build 57, 2026-09-21

### Added
- Every city-break destination has a lead photo: a compressed Wikimedia
  thumbnail in R2, shown as the sheet hero. The source file page is stored per
  city, and the app policy screen carries the Wikimedia Commons CC attribution.
- City-break attractions use the same section as the event sheet, with the full
  list one tap away.

### Changed
- The city-break sheet opens at the medium detent, like the event sheet.
- The city header runs a gradient from the country colour into its lighter tier
  shade, so a city reads as "country → city (tier)".
- The two flight calendars keep independent months, so an October outbound with
  a November return is possible.
- The buy action uses the native bottom-bar shape (rounded rectangle) instead of
  a capsule.
- The event gamestrip and both city headers share one sticky bar component
  (glows, material, divider, drag-indicator padding).

### Fixed
- "Ceny i linki zewnętrzne" uses the shared sheet shell and a full-width close
  button, like the rest of the app.

## [1.3.0] — build 56, 2026-09-21

### Added
- City-break sheet with a month flight calendar. "Sprawdź dostępne terminy" opens
  a dedicated sheet: the airport minimap on top, then a month calendar for each
  leg (origin → destination, destination → origin), and a sticky buy button that
  opens the airline in the default browser. Fares are colour-coded against the
  month (green cheapest, amber average, red dearest), days without a fare are
  greyed out, and the best trip around the day picked on the map is marked.
- City-break attractions as a two-column photo grid.
- `GET /travel/flights/{carrier}?month=YYYY-MM-01` returns a whole month for the
  calendar, reusing the per-month cache of the ±7 day event window.

### Changed
- The city sheet no longer shows the bus option. A bus calendar follows later.
- Destination airports show only after an event is tapped, as before. The
  carrier-coloured dots from build 55 are gone.

### Fixed
- EuroAirport Basel Mulhouse Freiburg is one airport with three IATA codes, but
  Ryanair lists BSL and Wizzair lists BSL and MLH. The destination list showed
  the same airport twice, at the same price. The two codes are merged into BSL.

## [1.3.0] — build 55, 2026-09-21

### Changed
- Travel tag chips sort by count, like the Lokalne filter.
- Map markers scale with the zoom and with the number of pins, so a continent
  view stays readable. City pins use the same circular shape as the event pins.
- Destination airports draw as carrier-coloured dots at low zoom (blue Ryanair,
  purple Wizzair) and open into the IATA badge on zoom-in.

### Fixed
- Restaurant pins no longer draw the 24 h time ring and no longer pulse.
  Restaurants are evergreen and have no expiry.

## [1.3.0] — build 54, 2026-09-21

### Added
- A "City break" filter on the Europa map. City pins show the destinations that
  are reachable from the selected departure city on the selected day, together
  with their connections. Cities are their own map layer: they never group with
  the event pins. The detail follows the zoom — large cities appear first, and
  the next tier stays as a dot until the map zooms in.
- `GET /travel/cities` — city-break destinations with the day's connections,
  computed from the materialized flight schedule (no provider call).

## [1.3.0] — build 53, 2026-09-20

### Added
- An "i" next to the price note opens a modal with the price and external-link
  disclaimer: prices are indicative, outbound links may be affiliate links, and
  the buyer is never charged more.

### Fixed
- Story card height is constant across events: the single-showtime column matched
  the showtime pager (60 pt) instead of being 7 pt taller, and the title always
  reserves two lines. Swiping between stories no longer makes the card jump.
- Restaurant card keeps only the name centred; the distinction, cuisine, address
  and website link stay left-aligned.
- The Michelin star is neutral grey, matching the Bib Gourmand label, instead of
  yellow — on the card and on the map pin badge.

## [1.3.0] — build 52, 2026-09-20

### Fixed
- Restaurant story card: the name is centred like an event, the cuisine sits on
  the distinction line, and the location line shows the street address.
- Restaurants no longer offer "Zgłoś" — the report menu is for live user content
  only, not for seeded events or curated restaurants.
- Multikino Poznań Stary Browar stands at the right place again: 143 pins carried
  pre-fix coordinates because the VPS runs a pre-built bundle that a source fix
  never reached. The bundle is redeployed and the affected pins are corrected and
  geo-locked.

### Changed
- Flight lookups survive a transient Wizzair/Ryanair failure: a cached failure
  marker no longer returns 502 for its whole five-minute TTL, and one delayed
  retry covers network errors, timeouts, 429 and 5xx. Live flight failures now
  reach Sentry.

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