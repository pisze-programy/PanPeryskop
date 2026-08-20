# Redesign spec — Admin "Media Requests" page (`GET /admin/media-requests`)

> Critical review + full redesign using Tabler 1.4 components (via jsDelivr CDN, SSR, no build step).
> Scope: spec only. No application source was modified.

---

## 1) Reality check — what's wrong with the current page

**File:** `backend/src/admin/dashboard/pages/mediaRequests.ts` (29 lines). A single card with a plain
`table table-vcenter card-table`, hard-coded 14-day window, `LIMIT 200`, joined to `users` for a display
name. Columns: Czas / Użytkownik / Pozycja (lat,lng) / Miasto.

**Criticism:**

| # | Problem | Detail |
|---|---------|--------|
| 1 | **Data is geo data, rendered as text.** The one thing that makes a media request meaningful is *where* it is. The page prints `52.4064, 16.9252` as monospace text and throws away the pin nature of the data. A map is the obvious, expected visualization — the page is currently ~4 rows, so a table alone carries zero information density. |
| 2 | **No filters.** Can't narrow by date range, city, user, or "only active" (TTL is 4h — see Data inventory). The 14d window is baked into the SQL and not even stated in the UI. |
| 3 | **No stats.** Nobody can answer "how many requests today / this week / in Poznań?" without going elsewhere. `overview.ts` already counts totals; the subpage should decompose them. |
| 4 | **No pagination.** `LIMIT 200` silently truncates. With a `page` concept already solved in `events.ts`, this is a regression. |
| 5 | **No notion of "active vs expired".** The API model has a 4h TTL and a 30-min cooldown per user (`MEDIA_REQUEST_TTL_MS` / `MEDIA_REQUEST_COOLDOWN_MS`, `core/models.ts:155-156`), yet the admin cannot tell an active pin from a dead one. |
| 6 | **Repeated logic already exists** — `nearestCity()` (`admin/cities.ts:65`), `daySeries()` (`admin/queries.ts:8`), `cards()` / `pill()` / `empty()` (`admin/ui.ts`) are all unused here. |
| 7 | **JSON API duplication.** `api/mediaRequests.ts` is an exact copy of the page query with a `days` param. A redesign should unify or extend one of them, not drift further. |
| 8 | **"Czas" renders raw UTC ISO** via `fmtDate` — ambiguous for a Poland-based app whose story clock is `Europe/Warsaw` (the rest of the dashboard groups by `+2h`). |

**Verdict:** not broken, but dramatically under-informing. It should be a *map page* with supporting
stats, filters and a detail list — not a bare table.

---

## 2) Data inventory (everything we have to work with)

### 2.1 `media_requests` table (`migrations/0010_media_requests.sql`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `TEXT PRIMARY KEY` | `nanoid(24)` |
| `user_id` | `TEXT NOT NULL REFERENCES users(id)` | |
| `lat` | `REAL NOT NULL` | |
| `lng` | `REAL NOT NULL` | |
| `created_at` | `INTEGER NOT NULL` | epoch **milliseconds** (matches the rest of the app) |

Indexes already present: `(lat, lng, created_at)` — bbox scans, and `(user_id, created_at)` — per-user
scans. Both are exactly what the redesign needs.

### 2.2 Domain constants (`backend/src/core/models.ts:154-156`)

- `MEDIA_REQUEST_TTL_MS = 4h` — a pin is **active** for 4 hours, then expires.
- `MEDIA_REQUEST_COOLDOWN_MS = 30 min` — one pin per user, globally, every 30 min.

These two constants define the "Aktywne vs Wygasłe" axis the current page ignores.

### 2.3 `users` joinable columns (`backend/schema/schema.sql`)

`id`, `device_id`, `username`, `auth_provider`, `created_at`, `last_seen`, `role`, `apple_id`.
Display name is already computed as `COALESCE(NULLIF(username,''), device_id)` in both current queries.
Note: **no photo/avatar field exists** → use Tabler initial-avatars (see §3.4).

### 2.4 City model (`backend/src/admin/cities.ts`)

- `CITIES` — 21 city centers (`Poznań, Warszawa, Gdańsk, Kraków, Łódź, Wrocław, Szczecin, Bydgoszcz, Lublin, Katowice, Białystok, Sopot, Gdynia, Toruń, Kielce, Rzeszów, Olsztyn, Bielsko-Biała, Zielona Góra, Koszalin, Częstochowa`).
- `nearestCity(lat,lng)` — haversine to nearest center, **60 km cutoff** → `"poza miastami (Nkm)"`.
- `cityBbox(id)` — ±0.2° (~22 km) box; this is the SQL-ready way to filter by city.

### 2.5 Aggregation building blocks already in the repo

- `daySeries(db, table, col, sinceMs, extraWhere)` (`admin/queries.ts:8`) — per-day series grouped by
  **Warsaw date** (`+2 hours` unixepoch shift). Reusable as-is for the "requests per day" bar.
- `cards(items)`, `pill(text, kind)`, `empty()`, `bars(series)` (`admin/ui.ts`).
- Pager pattern (`events.ts:246-253`) — btn-group "‹ Poprzednia / Następna ›".
- JSON bootstrap pattern (`events.ts:345`): `<script>window.ppX = ${JSON.stringify(...)}</script>`.

### 2.6 What is *not* in the DB (important to scope honestly)

- **No "resolved" concept.** There is no status/`resolved_at` column — "active vs resolved" must be
  derived from `created_at` vs TTL (4h). If product wants a true resolved state, that's a migration
  (out of scope for a page redesign; the spec uses TTL-derivation).
- No reverse-geocoding service call — city is always derived via `nearestCity` (JS) or `cityBbox` (SQL).

---

## 3) Proposed page composition

### 3.1 Page header

```
<h2 class="mb-2">Media Requests</h2>
<div class="text-secondary fs-5 mb-3">Piny "poproś o relację" od użytkowników.
  Aktywne przez 4 h od dodania, cooldown 30 min / user.</div>
```

Uses the existing horizontal-nav layout (no change to `ui.ts`). Keeps the `map-pin` nav icon.

### 3.2 Stat cards row (`cards()` helper — `ui.ts:75`)

| Card | Value (SQL) |
|------|-------------|
| **Ostatnie 14 dni** | `SELECT COUNT(*) FROM media_requests WHERE created_at>=?` (now − 14d) |
| **Dziś** (Warsaw day) | `SELECT COUNT(*) FROM media_requests WHERE date(created_at/1000,'unixepoch','+2 hours')=?` bind `todayWarsaw()` |
| **Aktywne teraz** (TTL 4h) | `SELECT COUNT(*) FROM media_requests WHERE created_at>=?` (now − 4h) |
| **Miasta (14d)** | distinct nearestCity count computed in JS from the filtered rows (see §5.3) |
| **Użytkownicy (14d)** | `SELECT COUNT(DISTINCT user_id) FROM media_requests WHERE created_at>=?` |

`color` hints: "Aktywne teraz" → `success` when > 0; "Dziś" → `primary`. All other cards plain.

### 3.3 Map card — THE centerpiece

Layout: `row g-3`, map on the left (`col-12 col-xl-8`), a side column (`col-12 col-xl-4`) with the
"Top miasta" progress list + "Najaktywniejsi użytkownicy" list.

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Mapa próśb</h3>
    <div class="card-actions">
      <span class="badge bg-success-lt text-success">● aktywne</span>
      <span class="badge bg-secondary-lt text-secondary">● wygasłe</span>
    </div>
  </div>
  <div class="ratio ratio-16x9">          <!-- Tabler maps.html pattern, zero custom CSS -->
    <div id="ppMap" class="w-100 h-100"></div>
  </div>
</div>
```

**Markers:** one Leaflet marker per request. Active (< 4h) → `L.divIcon` with a Tabler-colored pin
(`var(--tblr-primary)`); expired → muted gray. Popup = user + city + time + coords. Optionally
`L.markerClusterGroup` (Leaflet plugin CDN) if a single city exceeds ~50 pins.

### 3.4 Right column — "Top miasta" + "Użytkownicy"

```html
<div class="card">
  <div class="card-header"><h3 class="card-title">Miasta</h3></div>
  <div class="card-body">
    <div class="progress" style="height: .5rem">…</div>   <!-- bars() helper: name + % + count -->
  </div>
</div>
<div class="card">
  <div class="card-header"><h3 class="card-title">Użytkownicy</h3></div>
  <ul class="list-group list-group-flush">
    <li class="list-group-item">
      <span class="avatar avatar-sm" style="background-color:#1678c4">PS</span>
      Peryskop no.7121 · <span class="text-muted">3</span>
    </li>
  </ul>
</div>
```

Avatar: **Tabler initial-avatar placeholder** `<span class="avatar avatar-sm">PK</span>` (avatars.html
pattern) with a deterministic background color = hash of `device_id`/`username` (HSL). No photos exist.

### 3.5 Filters row (same GET-form pattern as `events.ts:280-294`)

```
[Zakres: 7/14/30/90 dni]  [Miasto: select z CITIES]  [Użytkownik: select top-20]
[Data od] [Data do]  [Aktywne tylko: checkbox]  [Wyczyść]
```

- **Miasto** → SQL bbox via `cityBbox(id)` (both `lat/lng` BETWEEN) — indexes line up with `idx_media_requests_bbox`.
- **Użytkownik** → `user_id = ?` (index `idx_media_requests_user`).
- **Data od/do** → `created_at >= fromMs AND <= toMs`.
- **Aktywne tylko** → `created_at >= ?` (now − 4h).
- All auto-submit via `onchange="this.form.submit()"`; `Wyczyść` resets to `/admin/media-requests`.

### 3.6 Table card + pagination

```
[‹ Poprzednia | Następna ›]  "N  próśb · strona X / Y"   (pager, events.ts pattern, top AND bottom)
```

| Kolumna | Cell |
|---------|------|
| Użytkownik | initial-avatar + `username ?? device_id` |
| Miasto | `pill(nearestCity(...))` — city name badge; `"poza miastami"` → `muted` |
| Pozycja | `font-monospace` lat, lng (keep) |
| Czas | `fmtDate` **+ Warsaw tz hint**, e.g. `08-20 14:32 UTC (16:32 PL)` |
| Status | `pill('aktywne','ok')` if `created_at >= now-4h`, else `pill('wygasłe','muted')` |
| Wiek | relative ("przed chwilą / 12 min temu / 3 h temu") — mirrors `relAgo()` in `users.ts:11` |

Rows: 50/page (`PAGE_SIZE`), total from a matching `COUNT(*)` — exact copy of `events.ts:221-253`.

### 3.7 Empty state

When a filter yields nothing:
`<tr><td colspan="6"><div class="empty">…Brak danych…</div></td></tr>` (existing `empty()` helper) and
the map shows only base tiles with a `fitBounds` to Poland.

---

## 4) Interactions

| # | Interaction | Mechanism |
|---|-------------|-----------|
| 1 | **Filters → SSR reload** | GET form, `onchange` submit; server re-renders stats, map JSON, table, pager. No client data layer needed (matches every other admin page). |
| 2 | **Map marker ↔ row sync** | Marker `id` attribute = request `id`; row `data-id` matches. Hover/click on marker opens the popup AND flashes the row (`:target`-style or a tiny inline `classList.add('table-light')`); clicking a row pans/opens its marker. Pure ~20-line inline script. |
| 3 | **Map bounds** | After init: `map.fitBounds(group.getBounds().pad(0.2))` so all pins are visible; fallback center `[52.1, 19.3]`, zoom 6 (Poland). |
| 4 | **Legend** | "● aktywne / ● wygasłe" badges in the map card header (§3.3) — both marker colors are defined from the same `TTL_MS` value, so the legend can never drift from the data. |
| 5 | **Active-only toggle** | checkbox in filters (§3.5) → adds the 4h condition to every query; also hides expired markers from the map JSON. |
| 6 | **Auto-refresh** | Optional: `setInterval(() => location.reload(), 60_000)` only when no filter is active (default 14d view). Do *not* add for filtered views — preserve the admin's filter state. |
| 7 | **Pagination** | `page` query param, pager top+bottom (events.ts pattern). Applies to the table only — map always renders the full filtered set (capped at ~5000 pins for sanity). |
| 8 | **Per-user context** | The 30-min cooldown means "1 request per user / 30 min". Row tooltip (`title="Poprzedni: …"`) from a grouped subquery shows the user's last pin time — cheap and reveals abuse patterns at a glance. |

---

## 5) Implementation notes

### 5.1 Map library — Leaflet via CDN (and a Tabler correction)

**Fact-check:** Tabler 1.4's `maps.html` does **not** use Leaflet — it uses **Mapbox GL JS v1.8.0** from
`https://api.mapbox.com/mapbox-gl-js/v1.8.0/mapbox-gl.js` (+ `mapbox-gl.css`), with the layout pattern:

```html
<div class="ratio ratio-16x9"><div><div id="map-markers" class="w-100 h-100 rounded"></div></div></div>
```
```js
new mapboxgl.Marker({ color: "var(--tblr-primary)" }).setLngLat([lng, lat]).addTo(map);
```

Recommendation: **Leaflet 1.9.x from jsDelivr** instead of Mapbox GL, because:
- Mapbox GL **requires an access token** (Tabler's is a shared public demo token — not usable in prod);
- the repo already standardizes on **jsDelivr** for Tabler core (`ui.ts:45,67`);
- Leaflet + OSM tiles needs **no key, no account**.

Keep Tabler's **ratio-wrapper** markup (it gives Leaflet an explicit height with zero custom CSS):

```html
<!-- page-level, added to the page body -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css">
<div class="ratio ratio-16x9"><div id="ppMap" class="w-100 h-100"></div></div>
<!-- end of body, after layout's tabler.min.js -->
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
```

Leaflet `L.divIcon` with inline SVG pin (no image asset needed). If clustering: add
`leaflet.markercluster` CSS+JS from jsDelivr and swap the group for the layer.

### 5.2 JSON bootstrap for markers

Server builds a compact array and inlines it (pattern already proven in `events.ts:345`):

```ts
const markers = rows.map((r) => ({
  id: r.id, lat: Number(r.lat), lng: Number(r.lng),
  user: r.user, city: nearestCity(r.lat, r.lng),
  at: r.created_at, active: r.created_at >= Date.now() - MEDIA_REQUEST_TTL_MS,
}));
```
```html
<script>
window.ppRequests = ${JSON.stringify(markers).replace(/</g,'\\u003C')};
</script>
```

- `JSON.stringify` of already-sanitized values; escape `<` so a hostile `username` can never break out
  of the inline script.
- Init **after** `leaflet.js` (place the inline script at the end of the page body; the layout already
  loads `tabler.min.js` last, so an appended page script always runs after both).

### 5.3 Aggregation queries (all bound, no string interpolation)

```sql
-- per-day bars (Warsaw day): reuse daySeries(db,'media_requests','created_at',since)
-- SELECT date(created_at/1000,'unixepoch','+2 hours') AS d, COUNT(*) AS n
--   FROM media_requests WHERE created_at>=? GROUP BY d ORDER BY d

-- city counts: derive in JS from the filtered row set (bounded by the same filters)
--   city = nearestCity(lat,lng)   // admin/cities.ts:65, 60 km cutoff

-- top users (per-user abuse view)
SELECT COALESCE(NULLIF(u.username,''), u.device_id) AS user, COUNT(*) AS n,
       MAX(r.created_at) AS last_at
FROM media_requests r JOIN users u ON r.user_id = u.id
WHERE r.created_at >= ?
GROUP BY r.user_id ORDER BY n DESC, last_at DESC LIMIT 10;

-- per-user last pin (row tooltip / cooldown context)
SELECT user_id, MAX(created_at) AS last_at FROM media_requests GROUP BY user_id;
```

- Run the stat queries in `Promise.all` (pattern in `overview.ts:31`).
- City filter uses `cityBbox(id)` ±0.22° in SQL so the bbox index is hit; `nearestCity` stays the
  *display* labeling for rows inside the box.
- All timestamps: `created_at` is epoch **ms**; Warsaw day grouping uses the `+2 hours` shift, never
  `new Date().getDate()` on the server (matches `daySeries`).

### 5.4 JSON API alignment

`/admin/api/media-requests?days=N` already exists (`api/mediaRequests.ts`). Extend it in-place to accept
`city`, `userId`, `from`, `to`, `activeOnly`, `limit` and to return `{ requests, total }`, then have the
SSR page reuse the same query builder (single source of truth, kills the current copy-paste drift — §1 #7).

### 5.5 Security / hygiene

- Keep the `esc()`/`jsStr()` discipline from `events.ts` for all user-derived text (avatar title,
  popup content, row cells).
- The inline `window.ppRequests` payload must be `<`-escaped (§5.2) — never emitted raw.
- OSM tile usage: include the required attribution control (`L.control.attribution`), and note that a
  production deployment behind a strict CSP needs `connect-src 'self' https://tile.openstreetmap.org`.
- No new migrations required — everything derives from existing columns/constants.

### 5.6 Effort / file map

| File | Change |
|------|--------|
| `backend/src/admin/dashboard/pages/mediaRequests.ts` | rewrite (query builder + composition above) |
| `backend/src/admin/dashboard/api/mediaRequests.ts` | extend filters + `total` (shared query builder) |
| `backend/src/admin/queries.ts` | optional `mediaRequestsSql/filter` helper mirroring `eventsSql` |
| `backend/src/admin/ui.ts` | **no change** (all helpers already exist) |

No new files, no build-step changes, no Tabler CSS/JS changes — the whole redesign rides on existing
helpers plus two Leaflet CDN `<script>`/`<link>` tags and one inline script (~60 lines).
