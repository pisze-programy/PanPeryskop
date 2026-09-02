# Per-showtime links (unified standard)

This document explains how a seed event links to its ticket pages per showtime.
Cinema providers started the pattern. Ticket providers (ebilet, kupbilecik) now
use the same model.

## 1. The problem

One event post can have several showtimes in one day (for example 16:00 and
19:00). Each showtime can live on its OWN page:

- kupbilecik: each performance has its own page `/imprezy/<Id>/`.
- ebilet: one product page normally holds all times, but the app must not guess.

If the post keeps only ONE link, selecting 20:00 can open the 16:00 page. That
is wrong.

## 2. The model

A post stores two fields:

| Field | Meaning |
|---|---|
| `showtimes` | List of times, for example `["16:00", "19:00"]` |
| `showtime_booking` | One identity PER time |

Each booking identity is:

```json
{ "time": "19:00", "kind": "link", "params": { "url": "https://..." } }
```

The `kind` field tells the app how to build the final URL:

| kind | Meaning |
|---|---|
| `helios`, `cinemacity`, `multikino` | Cinema. The app composes the booking URL from `params` |
| `link` | Generic. `params.url` is the FINAL page URL. The app opens it as-is |

The `link` kind is the standard for ticket providers. Any future provider whose
showtimes live on separate pages (for example a goingapp ticket page) emits the
same shape. No provider-specific UI code is needed.

## 3. Which providers emit it

| Provider | Booking per time | URL |
|---|---|---|
| multikino / cinemacity / helios | kind cinema | composed from `params` |
| ebilet | kind `link` | the TradeDoubler affiliate click URL |
| kupbilecik | kind `link` | the performance page (affiliate, `utm_source=pp`) |

## 4. How the app uses it

The app opens:

```
bookingURL(for: selectedShowtime)  ??  post.link_url
```

- If the user selects a showtime, the app finds the booking entry with the same
  `time` and opens its URL.
- If there is no entry, the app falls back to the single `post.link_url`.

This is the same flow as cinema. The only new thing for ticket providers is the
`link` kind in the app model.

## 5. Aggregation

Several providers merge the same event-day-venue into ONE post. The merge keeps
ONE booking entry per time. It never drops a showtime link.

## 6. Notes

- `post.link_url` stays as the default/fallback link (the earliest showtime).
- Admin time-locks (`time_locked`) keep the stored showtimes and bookings. A
  re-seed does not overwrite a locked post.
- The in-app browser allow-list already covers kupbilecik.pl, ebilet.pl and
  tradedoubler.com.
