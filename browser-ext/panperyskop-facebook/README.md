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

## Usage (fully automatic — no clicks needed)

1. Open a Facebook events list (`facebook.com/events/…`, page/group events tab)
   and **just scroll**. The addon **passively captures** every event card
   (`a[href*="/events/"]`) as it renders and **auto-submits** it (one at a time,
   paced) to the PanPeryskop API. Watch the console — every line starts with
   `[ppfb]`:
   `[ppfb] CAPTURED | <title> | <date> | <city> | <link>`
   `[ppfb] INGEST pending | <title> | <fbId> | geo=real|city_fallback|zero_fallback`
   `[ppfb] INGEST duplicate | … | winner=<provider>`
   `[ppfb] INGEST error | … | <reason>` / `[ppfb] SKIP no-date|no-image`
2. Events are ingested as **`pending`** (moderation queue) — they go live in the
   app only after you approve them in the admin dashboard
   (`/admin/events?status=pending`), where you also fix geo if needed
   (fallback events show a **geo 0,0** badge; filter **GEO → Geo 0,0 (do poprawy)**).
3. The toolbar icon / context menu **Podsumowanie zbioru** opens a read-only
   review page (per-event submission status). **Clear captures** resets the store
   for a new City/Day filter.

## How capture works

- **Primary — DOM (invisible, default):** `content/content.js` runs a
  `MutationObserver` in the **isolated world** — Facebook's page JS runs in a
  separate world and cannot see the observer. It watches for event cards as you
  scroll, extracts title/date (`parseFbDate`: "Today at 4:30 PM", "This Sunday at
  12 PM", "Thu, Aug 20", Polish "22 sie, 18:00"…) and venue/address, then queues
  the event for submit. No `fetch`/XHR patching, no `postMessage`, no extra
  network requests to Facebook — the fingerprint is exactly your real browsing.
- **Optional — network (raw GraphQL, opt-in):** set `graphqlCapture: true` in
  the addon options for higher-quality structured data. The background then
  injects `content/page-interceptor.js` into the **page's MAIN world**
  (`scripting.executeScript world: 'MAIN'` — Firefox content scripts cannot
  override `window.fetch`; the page world can). It patches `fetch` + XHR and
  reads every `POST /api/graphql/` response via **`clone()`** — the stream is
  never delayed or aborted. **Note:** the page-world patch is the larger
  detection surface, so keep it OFF unless DOM quality is not enough.

## Console logs

All logs carry the `[ppfb]` tag (capture, submit, ingest result + reason) so
they are trivially filterable in the browser console. Levels: `info` for
captured/submitted, `warn` for skipped/duplicate/failed.

## Architecture

```
manifest.json            MV3: permissions, background, content scripts
background.js            menu + toolbar action + badge; opt-in page-world inject
lib/settings.js          API settings (storage.local) + [ppfb] logger
lib/store.js             captured-events persistence (deduped by fbId) + submit state
lib/events-parser.js     DOM/GraphQL event normalization (pure)
lib/api.js               /admin/seed/facebook preview + upload
lib/image.js             cover fetch (page context) + downscale
content/content.js       MutationObserver DOM capture + paced auto-submit queue
content/page-interceptor.js  OPT-IN GraphQL capture (page world, clone())
summary/                 read-only diagnostics (submission status per event)
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
