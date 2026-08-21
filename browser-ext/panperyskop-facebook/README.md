# PanPeryskop — Facebook events ingest (Firefox addon)

A manual seed provider: captures Facebook events from the events feed while you
browse, lets you review/edit them, and uploads each to the PanPeryskop API
(`POST /admin/seed/facebook`) where the standard dedupe hierarchy applies
(facebook loses to going/kupbilecik, beats dzisapp/eventylive), geo is resolved
(Nominatim, like the other providers), the cover is stored in R2, and the event
appears in the app with a direct link to the Facebook event.

## Install (temporary, dev)

1. `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
2. Select `browser-ext/panperyskop-facebook/manifest.json`.
3. Open the addon **Options** (or right-click the toolbar icon → Manage) and set:
   - **API base URL** — `https://api.panperyskop.app`
   - **ADMIN_SECRET** — the admin bearer token used by `seed-ingest`
4. Reload any already-open Facebook tabs so the content script + capture attach.

## Usage

1. Open a Facebook events list (`facebook.com/events/…` or a page/group events
   tab) and scroll — the addon **passively captures** the GraphQL feed responses
   (`EventCometHomeDiscoverContentRefetchQuery` and siblings). Watch the console:
   `[panperyskop] captured N facebook events`.
   Online-only events are skipped automatically (no geo venue).
2. Right-click the page → **PanPeryskop → Facebook** → the review page opens.
   To start a fresh capture for a new City/Day filter: right-click →
   **PanPeryskop → Clear captures** first, then load/scroll the new filter.
3. Review each event (title, tag, URL, status). The date, city, venue and
   address are pre-filled from the GraphQL payload (`start_timestamp` +
   `event_place.contextual_name`) and remain editable; uncheck anything wrong.
   **Events from a past day are unchecked by default** (the backend only ingests
   today+). A **Geo** column shows the resolved point (`✓ lat,lng`) or **no geo**
   (fix the Location field and press **⟳** to re-check before submitting). A
   **duplicate** badge appears for events the API already covers with a
   higher-priority provider.
4. **Submit selected** — the addon fetches each cover in the logged-in page
   context, downscales it (≤1080 JPEG + 320 thumb), and posts one multipart
   request per event. Results (`pending / duplicate / no_coords / error`) show
   inline on each row. Events are ingested as **`pending`** (moderation queue) —
   they go live in the app only after approval in the admin dashboard
   (`/admin/events?status=pending`).
   **Download JSON** (dry-run) writes ONE file — `{ events: […], raw: […] }` —
   with the selected events *and* the raw GraphQL payloads they were parsed from,
   so the result can be validated before anything is sent to the API.

## How capture works

- **Primary — network (raw GraphQL):** the background reads every
  `POST https://*.facebook.com/api/graphql/*` response body via
  `webRequest.filterResponseData` (Firefox-native), parses `events.edges[].node`,
  stores the raw payloads (unbounded) + events, and relays a summary to the FB
  page console. A keepalive alarm keeps the MV3 event page from suspending so
  requests are never missed. No `lsd`/`fb_dtsg`/`__dyn` tokens are ever re-issued.
  If a request yields 0 events or the filter errors, a diagnostic line is shown
  in the page console.
- **Fallback — DOM:** on menu click, `content/content.js` scrapes the current
  page for `a[href*="/events/…"]` cards and extracts the title, date/time
  (`parseFbDate`: "Today at 4:30 PM", "This Sunday at 12 PM", "Thu, Aug 20",
  Polish "22 sie, 18:00"…) and venue/address from the card text. DOM-scraped
  events are marked `dom fallback`, and never overwrite a richer network capture
  of the same event.

## Console logs

Every API request/response is `console.log`-ed with the `[panperyskop]` prefix
(capture, preview, upload, results) — see `lib/api.js`.

## Architecture

```
manifest.json            MV3: permissions, background, content scripts
background.js            context menu, webRequest capture, message router
lib/settings.js          API settings (storage.local)
lib/store.js             captured-events persistence (deduped by fbId)
lib/events-parser.js     GraphQL/DOM event normalization (pure)
lib/api.js               /admin/seed/facebook preview + upload
lib/image.js             cover fetch (page context) + downscale
content/content.js       DOM-scrape fallback + submit executor
summary/                 review/edit UI
options/                 settings UI
```

## Backend contract (what the addon talks to)

- `POST /admin/seed/facebook/preview` — JSON `{ events: [{externalId,title,startMs,venue}] }`
  → duplicate verdicts per event.
- `POST /admin/seed/facebook` — multipart per event: `title, startMs, venue,
  address, city, link, external_id (facebook-…), tags, file, thumb`.

Both are `ADMIN_SECRET`-protected. The provider rank (`facebook`, priority 3.5)
lives in `backend/src/seed/providers/registry.ts`; ingest logic in
`backend/src/seed/manual/facebook.ts`; routes in `backend/src/api/facebookSeed.ts`.
