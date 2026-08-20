# Redesign spec — Admin "Events" page (`GET /admin/events`)

> Critical review + full redesign using Tabler 1.4 (jsDelivr CDN, SSR as HTML-string functions, no build step).
> Scope: spec only. No application source was modified.
> Baseline: `backend/src/admin/dashboard/pages/events.ts` (504 lines). All figures below were verified against the live remote D1 (`npx wrangler d1 execute panperyskop-db --remote`, read-only).

---

## 1. Reality check — what's wrong with the current page

The page is the most capable moderation tool in the admin — it has in-place status/tag edits, a geo override with in-place row swap, a link-preview modal with a blocked-host bypass, and localStorage filter persistence. **None of that excuses what it does with the data.** The dataset it governs is 7 261 rows with 9 sources, per-status totals, per-city geometry, tag distribution, lock flags, sold-out flags, rejection reasons and a seed-provenance timeline — the page surfaces almost none of it.

Blunt list, worst first:

| # | Problem | Severity |
|---|---------|----------|
| 1 | **Zero summary context.** The page shows nothing about the dataset it's browsing: no totals, no approved %, no pending-queue size, no per-source counts, no data-quality flags. To learn "how many events are pending" the admin must leave for `/admin/overview`. The page title flips to "Moderacja" when `?status=pending`, yet renders zero queue information — a title pretending to be a queue. | Critical |
| 2 | **The geo filter has exactly one option.** `select name="geo"` contains "Wszystkie" and "Default bbox". A dropdown with a single real choice is not a filter — it is dead UI. Meanwhile the *actually interesting* geo facts (manually locked coords = 2 rows, missing coords = 0) are unfilterable. | Critical |
| 3 | **No text search.** With 7 261 rows and no way to find a title/venue/external_id, the only paths are paging 100 rows at a time or blind-filtering by city+source. An admin investigating a specific event (from a report, from the app, from a seed error) cannot find it. | Critical |
| 4 | **The tag editor silently destroys data.** `parseTags(e.tags)[0]` (`events.ts:259`) keeps only the *first* tag of the JSON array; a re-save rewrites `tags` to a single-element array. The schema (`0025_tags.sql`) and `seed/core/tags.ts` are a closed-set *subset* model; the admin UI is single-select and will clobber multi-tag rows. `tagSelect` also conflates "no tags" with "empty array" and offers a free-form `none` pseudo-tag that re-maps to `[]`. | High |
| 5 | **In-place saves give no feedback.** `ppUpdate` flashes a green outline for 700 ms and nothing else. No toast, no row-level ack, no stat refresh — and errors land in a bare alert modal. Status/tag counts on the page (which don't exist) can't tick down because nothing is wired. | High |
| 6 | **localStorage persistence hijacks navigation.** On first load with no query string the page silently `location.replace()`s to a stored filter (`events.ts:429-433`). A bookmarked `/admin/events` becomes a different page depending on last session, with zero visual indication that this happened. Shareable, back-button-safe URLs are the norm elsewhere in this admin; this is the only page that fights it. | Medium |
| 7 | **Pagination is a bare btn-group, not Tabler `.pagination`.** Prev/next only, no page numbers, no jump, no per-page size. `status=approved` alone is 72 pages of 100. The admin can't reach page 40 without 39 clicks, and there's no page-number state feedback. | Medium |
| 8 | **Overloaded "Wydarzenie" cell.** Title + place + date + showtime selector are stacked into one column while the status/tag selects sit in separate columns — the table is 5 columns wide but reads as a 2-column layout. No source badge, no sold-out badge, no lock badges, no `created_at`, no `rejection_reason`. For 91 rejected rows the admin sees a red select but never *why*. | Medium |
| 9 | **Row actions are a single "⋯" geo button.** `geoButtonHtml` is the only action. Media preview, link preview, copy-id, reject/approve — all exist as inline JS or are impossible, none are reachable from a coherent actions menu. | Medium |
| 10 | **The `from`/`to` event-date filters are near-noise.** The entire dataset spans **4 event dates** (2026-08-20 → 08-23). Two date pickers over a 4-day domain is theater. The axis that actually has history — `created_at` seed runs (4 distinct days, 1502/1855/1914/1990) — is **not filterable at all**, even though `EventFilter.fromMs/toMs` are defined in `queries.ts:47-48` and simply never wired. | Medium |
| 11 | **"Moderacja" mode is dead on arrival.** `pending` currently holds **1 event**. The status select colors make approved the norm and rejected the exception, but the moderation *workflow* (approve/reject the new day's seed) has no affordance: no "today's new" queue, no per-day review grouping, no approval-rate signal. | Medium |
| 12 | **Modals are Bootstrap-flavored, not Tabler-flavored.** `modal fade` + `modal-dialog-centered` work (Tabler ships Bootstrap) but the redesign should use Tabler's `modal-blur` and `modal-status` affordances — the geo save error path in particular is a `modal-status bg-danger` waiting to happen. | Low |
| 13 | **Empty state is a whisper.** `empty()` renders "Brak danych." with no CTA. Filtered-to-zero and truly-empty are indistinguishable; there's no "Wyczyść filtry" escape hatch. | Low |
| 14 | **Dead code / drift.** `EVENT_SOURCES` (`events.ts:15`) duplicates `ProviderId` (`seed/core/types.ts:9`); `jsStr` duplicates escaping that `esc()` + `JSON.stringify` already handle; `fromMs/toMs` are dead fields. Every one of these is a drift trap. | Low |

**Verdict:** not a broken page — a page that under-declares its own data. It needs: a summary layer (what is the dataset, what is the queue), real filters (search, multi-source, geo meaning, seed-day), a readable table with badges and a real actions menu, Tabler pagination, and save flows that close the loop with toasts + stat refresh. Everything below is buildable with Tabler 1.4 stock classes, the existing `ui.ts` helpers, and ~150 lines of page-local JS.

---

## 2. Data inventory (everything usable here, with the queries that produce it)

All timestamps are epoch **ms**; Warsaw-day grouping uses the `+2 hours` unixepoch shift (matches `daySeries`, `queries.ts:8`). Source is derived from `external_id` prefix: `substr(p.external_id,1,instr(p.external_id,'-')-1)`.

### 2.1 `posts` row — the single-row dataset (already selected by `eventsSql`)

| Column | Type | Meaning | Used today? |
|--------|------|---------|-------------|
| `id` | TEXT PK | nanoid | yes |
| `external_id` | TEXT | `{source}-{ref}`, prefix = source | no (only derived `source`) |
| `description` | TEXT | seed format `"Tytuł: HH:MM, Lokalizacja"` (`descParts`, `events.ts:45`) | yes (title/time/loc) |
| `event_date` | TEXT | event day `YYYY-MM-DD` | yes (filter + cell) |
| `showtimes` | TEXT | JSON `["HH:MM",…]`; **7095/7261** events have it | yes (selector) |
| `showtime_booking` | TEXT | JSON `{time,kind,params}` per cinema session; only helios/cinemacity/multikino | yes (deep links) |
| `tags` | TEXT | JSON array of canonical/custom tag ids; **6725 tagged, 536 `NULL`**, `[]` = 0 | yes but clobbers (`[0]`) |
| `status` | TEXT | `approved` **7169** / `pending` **1** / `rejected` **91** | yes |
| `rejection_reason` | TEXT | reason string; **87/91** rejected rows have one | **no — never displayed** |
| `link_url` | TEXT | 0 rows missing → data is clean | yes (preview modal) |
| `thumb_key` / `media_key` | TEXT | R2 media | yes (thumb) |
| `lat` / `lng` | REAL | coords; **0 rows null** | yes (geo modal) |
| `is_sold_out` | INT | **18** rows sold-out | **no** |
| `geo_locked` | INT | **2** rows admin-pinned | **no** |
| `tags_locked` | INT | **0** rows admin-pinned | **no** |
| `created_at` | INT ms | seed time; 4 days, all `06:00 Warsaw` (1502/1855/1914/1990) | **no** |
| `views_count/likes_count/shares_count` | INT | engagement; **351 views across 338 events, 0 likes/shares** | **no** (optional) |

### 2.2 Aggregate datasets (each is one query, all bindable in `Promise.all` — pattern in `overview.ts:31`)

**Status totals (stat cards):**
```sql
SELECT status, COUNT(*) n FROM posts WHERE category='events' GROUP BY status;
-- approved 7169 · pending 1 · rejected 91
```
Approved % is derived in JS: `approved / total`. Total: `SELECT COUNT(*) FROM posts WHERE category='events'` → **7261**.

**Per source (source cards / bars):**
```sql
SELECT substr(external_id,1,instr(external_id,'-')-1) src, COUNT(*) n
FROM posts WHERE category='events' GROUP BY src ORDER BY n DESC;
-- helios 2780 · cinemacity 2573 · multikino 1270 · dzisapp 222 ·
-- eventylive 181 · kupbilecik 110 · going 67 · meetup 40 · luma 18
```

**Per city (bbox = ±0.2° via `cityBbox`, `admin/cities.ts:43`)** — one query per selected card, or none if we show city only inside rows:
```sql
SELECT COUNT(*) n FROM posts WHERE category='events'
  AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?;   -- bind cityBbox(id)
-- warszawa 1029 · katowice 647 · krakow 459 · wroclaw 381 · gdansk 375 ·
-- poznan 350 · lodz 330 · bydgoszcz 234 · lublin 215 · bialystok 197 · szczecin 174
```
(Approximate; bbox is a box, not a radius. Fine for cards — exact figure lives in the row cells via `nearestCity`.)

**Per tag (tag distribution card):** reuse the proven JS-parse pattern from `tags.ts:25-32` — pull `tags` for tagged rows and aggregate in JS:
```sql
SELECT tags FROM posts WHERE category='events' AND tags IS NOT NULL AND tags <> '[]';
-- filmy 6623 · meetup 58 · muzyka 21 · teatr 11 · inne 9 · komedia 3
```
(Catalog = `tagCatalog(db)` → canonical `CANONICAL_TAGS` + `admin_tags`, `core/tagCatalog.ts:12`.)

**Lock/sold-out/data-quality flags (second stat row):**
```sql
SELECT geo_locked, tags_locked, is_sold_out, COUNT(*) n
FROM posts WHERE category='events' GROUP BY geo_locked, tags_locked, is_sold_out;
-- geo_locked 2 · tags_locked 0 · is_sold_out 18 · rest 7241
SELECT COUNT(*) FROM posts WHERE category='events' AND (lat IS NULL OR lng IS NULL);   -- 0
SELECT COUNT(*) FROM posts WHERE category='events' AND (link_url IS NULL OR link_url=''); -- 0
```

**Events per day (event-date axis, `event_date`):** the moderation window.
```sql
SELECT event_date, status, COUNT(*) n FROM posts WHERE category='events'
  GROUP BY event_date, status ORDER BY event_date;
-- 2026-08-20 … 2026-08-23 (4 days) — bounded by the seed window, not a timeseries
```

**Seed runs per day (`created_at`, the axis that actually grows):**
```sql
SELECT date(created_at/1000,'unixepoch','+2 hours') d, COUNT(*) n
FROM posts WHERE category='events' GROUP BY d ORDER BY d;
-- 08-20:1502 · 08-21:1855 · 08-22:1914 · 08-23:1990   (4 points today; +1 daily)
```
This is the honest "events over time" chart — a line chart is only meaningful after a couple weeks of seed days. Until then, a column chart or the CSS `bars()` list is the right tool (see §3.7).

**Moderation queue (the "Co nowego" panel):** the useful queue is the newest seed day still with `pending`/`rejected`:
```sql
SELECT event_date, COUNT(*) pending FROM posts
WHERE category='events' AND status='pending' GROUP BY event_date;
```

### 2.3 Joinable/adjacent data (available, mostly out of scope)

- **`seed_batches` / `seed_runs`** (`0011_seed_runs.sql`, `0013_seed_queue.sql`): provenance per day (run status, ingested counts). Could power a "ostatni seed" hint in the page header — `overview.ts:103` already computes it; **optional**, don't duplicate.
- **`venues`** (`0017_venues.sql`, 791 rows): shared geo store. **No FK to `posts`** — events carry venue names only inside `description`. Joining would require fuzzy match on `loc`; skip.
- **`admin_tags`** (`0028_admin_tags.sql`): feeds `tagCatalog` — already used for the tag select.
- **Engagement** (`posts.views_count` etc.): 351 views total — sparse; expose as an optional sort/key, not a column.

### 2.4 Honest non-data (scope guardrail)

- There is **no per-event `updated_at`/audit trail** — "last edited by admin" cannot be shown without a migration.
- `geo_locked` is write-only: once set it is never reset (`events.ts:494`), so "cofnięte do default bbox" is impossible without a migration. The spec does **not** invent a reset.

---

## 3. Proposed page composition (top → bottom)

Layout wrapper is unchanged (`renderPage` → `layout()` in `admin/ui.ts`); every block below drops into the existing `<div class="container-xl">`. Icons referenced as `{icon-x}` must be added to the `ICONS` sprite in `admin/ui.ts:109` (inventory in §5.5).

### 3.1 Page header (`.page-header` + action buttons)

```html
<div class="page-header d-print-none mb-3">
  <div class="row align-items-center">
    <div class="col">
      <div class="page-pretitle">PanPeryskop Admin</div>
      <h2 class="page-title">Eventy
        <span class="badge bg-secondary-lt text-secondary ms-2">{total} wydarzeń</span>
        <a class="badge bg-warning-lt text-warning ms-1 text-decoration-none" href="/admin/events?status=pending">moderacja: {pending}</a>
      </h2>
      <div class="text-secondary">Wydarzenia z {sources} źródeł · okno {from}–{to} ·
        ostatni seed {lastSeedDay}</div>
    </div>
    <div class="col-auto">
      <div class="btn-list">
        <a class="btn btn-outline-secondary" href="/admin/events?status=pending">Moderacja</a>
        <a class="btn btn-primary" href="/admin/events?export=csv&{currentQ}">Eksport CSV</a>
      </div>
    </div>
  </div>
</div>
```

- **Data source:** `{total}`, `{pending}`, `{sources}` from §2.2 queries; `{lastSeedDay}` from the `created_at` GROUP BY (§2.2). `{currentQ}` = current query string so the export honors the active filter.
- **Interactions:** the title badges and "Moderacja" are plain links; "Eksport CSV" is a link to the same GET handler with `export=csv` (see §4.4). Title badge counts should be recomputed on the current *filtered* set only if you want live numbers — default spec: **global** counts here, filtered count lives in the filter bar (§3.3), so the header stays stable while browsing.
- **Note:** the current "Moderacja vs Eventy" title flip (`events.ts:279,438`) is dropped — the header is always "Eventy"; `status=pending` is just one filter state (fixes §1 #11).

### 3.2 Stat cards (two rows of `card card-sm`, reuse `cards()` from `ui.ts:75`)

**Row A — queue health (4 cards):**

| Card | Value | Color | SQL |
|------|-------|-------|-----|
| Razem wydarzeń | 7261 | plain | `COUNT(*)` (§2.2) |
| Zaakceptowane | 7169 · **98.7%** | success | `GROUP BY status` + JS pct |
| Moderacja (pending) | **1** (whole card = `<a href="?status=pending">`) | warning | `GROUP BY status` |
| Odrzucone | **91** (link `?status=rejected`) | danger | `GROUP BY status` |

```html
<div class="row row-cards mb-3">
  <div class="col-6 col-md-3">
    <div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Razem wydarzeń</div>
      <div class="h2 mb-0">7261</div>
    </div></div>
  </div>
  <div class="col-6 col-md-3">
    <div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Zaakceptowane</div>
      <div class="h2 mb-0 text-success">7169 <span class="fs-5 text-muted">· 98.7%</span></div>
    </div></div>
  </div>
  <div class="col-6 col-md-3">
    <a class="card card-sm text-reset text-decoration-none" href="/admin/events?status=pending"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Moderacja</div>
      <div class="h2 mb-0 text-warning">1</div>
    </div></a>
  </div>
  <div class="col-6 col-md-3">
    <a class="card card-sm text-reset text-decoration-none" href="/admin/events?status=rejected"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Odrzucone</div>
      <div class="h2 mb-0 text-danger">91</div>
    </div></a>
  </div>
</div>
```

**Row B — data quality (4 cards):** sold-out (18, `danger-lt`), geo-locked (2, `primary-lt`), tags-locked (0, `muted`), bez tagu (536, `warning-lt`). Same markup, `col-6 col-md-3`. Each card shows the flag count with a tooltip explaining what it means ("Ręcznie ustawione GEO — nie nadpisywane przez seed"). Data: §2.2 flags query.

**Źródła card (row C, `col-12 col-md-8`):** per-source distribution using the existing CSS `bars()` helper (`ui.ts:86`) — zero chart-library dependency, sorts descending, shows count. Header: `card-title "Źródła"`, `card-actions` shows `{sources} źródeł`.

```html
<div class="card">
  <div class="card-header"><h3 class="card-title">Źródła</h3>
    <div class="card-actions"><span class="text-secondary fs-5">9 źródeł</span></div></div>
  <div class="card-body"> {bars(perSource)} </div>
</div>
```
`bars()` input: `[{label:'helios', value:2780}, …]` (§2.2). Each source row also gets a small count badge. (Optional upgrade: swap to ApexCharts column chart, see §3.7.)

### 3.3 Advanced filter bar (GET form, auto-submit convention from `users.ts`/`events.ts`)

```html
<form method="get" action="/admin/events" class="card card-body mb-3">
  <div class="row g-2">
    <!-- 1. TEXT SEARCH (NEW) -->
    <div class="col-12 col-md-4">
      <label class="form-label">Szukaj</label>
      <div class="input-group">
        <span class="input-group-text"><svg …{icon-search}…/></span>
        <input name="q" class="form-control" value="{q}" placeholder="tytuł, miejsce, miasto, external_id…">
        <button class="btn btn-primary" type="submit">Szukaj</button>
      </div>
    </div>

    <!-- 2. STATUS: Tabler segmented control (links, preserves other params) -->
    <div class="col-12 col-md-5">
      <label class="form-label">Status</label>
      <div class="btn-group btn-group-segmented w-100" role="group">
        <a class="btn btn-sm {active}" href="/admin/events?{qsNoStatus}">Wszystkie</a>
        <a class="btn btn-sm {active}" href="/admin/events?status=pending&{rest}">Oczekujące <span class="text-warning">1</span></a>
        <a class="btn btn-sm {active}" href="/admin/events?status=approved&{rest}">Zaakceptowane</a>
        <a class="btn btn-sm {active}" href="/admin/events?status=rejected&{rest}">Odrzucone</a>
      </div>
    </div>

    <!-- 3. SOURCES: dropdown multi-select (NEW) -->
    <div class="col-6 col-md-3">
      <label class="form-label">Źródła</label>
      <div class="dropdown">
        <button class="btn btn-outline-secondary w-100 dropdown-toggle" type="button" data-bs-toggle="dropdown">{srcLabel}</button>
        <div class="dropdown-menu dropdown-menu-end p-2" style="min-width:230px">
          <label class="dropdown-item"><input class="form-check-input me-2 pp-src" type="checkbox" value="helios" {chk}> helios <span class="text-muted ms-auto">2780</span></label>
          … 9 sources from EVENT_SOURCES §2.2 …
          <div class="dropdown-divider"></div>
          <button class="btn btn-sm btn-primary w-100" type="button" onclick="ppApplySources()">Zastosuj</button>
        </div>
      </div>
      <input type="hidden" name="sources" id="ppSources" value="{sources}">
    </div>

    <!-- 4. CITY / 5. TAG / 6. GEO: plain form-selects (existing pattern) -->
    <div class="col-6 col-md-3">
      <label class="form-label">Miasto</label>
      <select name="city" class="form-select" onchange="this.form.submit()">{cityOpts}</select>
    </div>
    <div class="col-6 col-md-3">
      <label class="form-label">Tag</label>
      <select name="tag" class="form-select" onchange="this.form.submit()">{tagOpts}</select>
    </div>
    <div class="col-6 col-md-3">
      <label class="form-label">GEO</label>
      <select name="geo" class="form-select" onchange="this.form.submit()">
        <option value="">Wszystkie</option>
        <option value="locked">Z ręcznym GEO (2)</option>
        <option value="default">Fallback bbox</option>
        <option value="none">Bez współrzędnych (0)</option>
      </select>
    </div>

    <!-- 7. EVENT DATE RANGE (kept, but demoted) -->
    <div class="col-6 col-md-2">
      <label class="form-label">Data od</label>
      <input type="date" name="from" class="form-control" value="{from}" onchange="this.form.submit()">
    </div>
    <div class="col-6 col-md-2">
      <label class="form-label">Data do</label>
      <input type="date" name="to" class="form-control" value="{to}" onchange="this.form.submit()">
    </div>

    <!-- 8. SEED-DAY RANGE (NEW — wires the dead fromMs/toMs) -->
    <div class="col-6 col-md-2">
      <label class="form-label">Seed od</label>
      <input type="date" name="cfrom" class="form-control" value="{cfrom}" onchange="this.form.submit()">
    </div>
    <div class="col-6 col-md-2">
      <label class="form-label">Seed do</label>
      <input type="date" name="cto" class="form-control" value="{cto}" onchange="this.form.submit()">
    </div>

    <!-- 9. PER PAGE + RESULT COUNT + RESET -->
    <div class="col-6 col-md-2">
      <label class="form-label">Na stronę</label>
      <select name="limit" class="form-select" onchange="this.form.submit()">
        <option value="25">25</option><option value="50" selected>50</option>
        <option value="100">100</option><option value="200">200</option>
      </select>
    </div>
    <div class="col-12 d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
      <span class="text-secondary">Wynik: <strong>{total}</strong> wydarzeń</span>
      <div class="btn-list">
        <a class="btn btn-outline-secondary" href="/admin/events"
           onclick="ppClearFilters(event)">Wyczyść filtry</a>
      </div>
    </div>
  </div>
</form>
```

**Control decisions (with rationale):**

- **`q` search** — new `q` param; SQL in §5.1. It is `description LIKE` (title+venue+city are all inside `description`'s seed format) **plus** `external_id LIKE`. Case-insensitive for ASCII only; Polish diacritics need the exact char (documented in §5.1, enhancement proposed). Submit on Enter or the button — not live (server round-trip per keystroke is wasteful at this scale; a debounced `fetch` live-search is a stretch goal, §5.2).
- **Status as segmented links** (not a `<select>`): it's the single most-used axis; links keep it visually prominent and make `pending`/`rejected` one-click from anywhere. Each segment URL must carry the other active params (`q`, `sources`, `city`, `tag`, `geo`, `from`, `to`, `cfrom`, `cto`, `limit`) — build via the existing `qs`/`qstr` pattern (`events.ts:237-253`). Pending count rendered inside the segment (from §2.2).
- **Sources dropdown** — replaces the single-source select. `{srcLabel}` = `"Wszystkie"` or `"helios +2"` when filtered. Checkboxes write to the hidden `#ppSources`; "Zastosuj" submits the form (`ppApplySources`). Server splits on `,` → `IN (…)` (§5.1). **No Apply-free auto-submit**: toggling 9 checkboxes reloading the page each click is hostile; one explicit apply per open is right.
- **GEO select now means something**: `locked` (geo_locked=1), `default` (existing fallback-bbox), `none` (missing coords). Counts in option text come from §2.2 flags query. (Fixes §1 #2.)
- **Seed-day range** (`cfrom`/`cto`) finally uses `EventFilter.fromMs/toMs` (`queries.ts:47-48`) → `created_at` bounds. This is the real history axis; the event-date pickers stay for the 4-day moderation window.
- **`limit`** per-page param (new) feeds `EventFilter.limit` — fixes §1 #7.
- **"N wydarzeń" live count** sits in the bar itself, so the admin sees filter tightness before scrolling to the pager.

### 3.4 The table

```html
<div class="card">
  <div class="table-responsive">
    <table class="table table-vcenter card-table">
      <thead><tr>
        <th>Media</th>
        <th>Wydarzenie</th>
        <th>Lokalizacja</th>
        <th>Data</th>
        <th>Status</th>
        <th>Tag</th>
        <th class="text-end">Akcje</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </div>
</div>
```

Columns (each cell: Tabler markup + data source):

1. **Media** — existing `eventThumb` (`events.ts:75-81`) unchanged: `span.avatar.avatar-sm.rounded > img` with `onerror` → `bg-secondary-lt`. Keep click-to-open `ppMediaOpen`.
2. **Wydarzenie** — de-overloaded (fixes §1 #8):
   ```html
   <div class="fw-semibold">{titleLink} <span class="badge {sourceBadge}">helios</span>
     <span class="badge bg-danger-lt text-danger">wyprzedane</span>
     <span class="badge bg-primary-lt text-primary" title="GEO ustawione ręcznie">geo 🔒</span>
     <span class="badge bg-primary-lt text-primary" title="Tag ustawiony ręcznie">tag 🔒</span>
   </div>
   ```
   - `{titleLink}` = existing `titleHtml` (`events.ts:86`) — link preview / missing-link ⚠.
   - `{sourceBadge}` = `SOURCE_BADGE` color map (§5.4). Sold-out badge only when `is_sold_out=1` (data: 18 rows).
   - **Data source:** `description` (title via `descParts`), `link_url`, `source` (derived), `is_sold_out`, `geo_locked`, `tags_locked`.
3. **Lokalizacja** — `placeCellHtml` (`events.ts:139`) + city confirmation. `placeLabel` already returns `"Miasto, VENUE"` (`events.ts:120`); append nothing, keep the pin + click → maps embed modal. Geo swap JS unchanged (§4.3).
4. **Data** — split out of the overloaded cell:
   ```html
   <div class="d-flex align-items-center gap-2">
     <span class="text-muted fs-5">{event_date}</span>{showtimeSelect}
   </div>
   <div class="text-muted fs-6" title="Czas seeda">seed {createdAtDay}</div>
   ```
   - `{showtimeSelect}` = existing `dateCell` single/multi select (`events.ts:194`); `{createdAtDay}` = `fmtDate(created_at).slice(0,10)`-style Warsaw day (e.g. `seed 08-21`). **New**: exposes seed provenance at a glance.
5. **Status** — keep the inline auto-submit select (`statusSelect`, `events.ts:52`) but add the rejection reason as a tooltip on rejected rows:
   ```html
   <form method="post" action="/admin/events/{id}">{statusSelectHtml}
     {rejected && reason ? `<i class="text-danger" title="{reason}">⚠</i>` : ''}</form>
   ```
   - **Data source:** `status`, `rejection_reason`. `rejection_reason` is currently never shown (fixes §1 #8).
6. **Tag** — keep inline select (`tagSelect`, `events.ts:64`), **fix the multi-tag clobber** (§5.4): the cell renders the first tag in the select plus a `+N` muted suffix when `parseTags` returns >1, and the save path must merge, not replace. Lock icon when `tags_locked=1`.
7. **Akcje** — replace the bare "⋯" geo button (fixes §1 #9) with a Tabler `.dropdown` kebab:
   ```html
   <div class="dropdown text-end">
     <button class="btn btn-action dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
       <svg class="icon">…{icon-more-horizontal}…</svg>
     </button>
     <div class="dropdown-menu dropdown-menu-end">
       <a class="dropdown-item" href="#" onclick="ppGeoOpen('{id}','{loc}','{lat}','{lng}')">Zmień GEO</a>
       <a class="dropdown-item" href="#" onclick="ppMediaOpen('/media/{full}')">Podgląd mediów</a>
       <a class="dropdown-item" href="#" onclick="ppOpenLink(ppLinkFor('{id}','{url}'));return false;">Otwórz link</a>
       <div class="dropdown-divider"></div>
       <a class="dropdown-item" href="#" onclick="ppCopyId('{id}')">Kopiuj ID</a>
     </div>
   </div>
   ```
   - `btn-action` is Tabler's compact icon-button class; the old `ppGeoBtn` per-row button disappears into the menu, but **keep** the `data-id` + `ppGeoSwap` contract (§4.3) so a geo save re-renders both the place cell and the *new* GEO menu item values.

Row **empty state** — not `empty()` (fixes §1 #13):
```html
<tbody><tr><td colspan="7">
  <div class="empty">
    <div class="empty-icon"><svg class="icon">…{icon-search}…</svg></div>
    <p class="empty-title">Brak wydarzeń</p>
    <p class="empty-subtitle text-secondary">Nic nie pasuje do tych filtrów.</p>
    <div class="empty-action"><a class="btn btn-outline-secondary" href="/admin/events">Wyczyść filtry</a></div>
  </div>
</td></tr></tbody>
```

### 3.5 Pagination (Tabler `.pagination`, top + bottom)

Fixes §1 #7. `PAGE_SIZE` = `limit` param (default 50). Same `eventsCountSql` total + `totalPages` logic (`events.ts:222-253`), carrying all filter params.

```html
<div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
  <span class="text-secondary">{total} wydarzeń · strona {page} / {totalPages}</span>
  <nav><ul class="pagination pagination-sm">
    <li class="page-item {disabled}"><a class="page-link" href="{prev}">‹</a></li>
    {page links: 1 … N with .page-item.active, window ±3 around current,
     collapse runs with .page-link "…" (disabled)}
    <li class="page-item {disabled}"><a class="page-link" href="{next}">›</a></li>
  </ul></nav>
</div>
```

`page` never appears in the URL when `=1`; changing any filter resets `page`. Render once above and once below the table (mirrors `events.ts`).

### 3.6 Modals (converted to Tabler affordances)

Keep the four modal skeletons from `events.ts:300-344` (media / link / alert / geo) — the JS contract (`ppMediaOpen`, `ppLinkOpen`, `ppAlertOpen`, `ppGeoOpen/Save`) stays intact, so `ppMediaOpen`/`ppLinkOpen` keep working from the new kebab menu. Two upgrades:

- Add `modal-blur` to the `modal-dialog` wrapper (Tabler backdrop blur) on **all four**.
- The geo save error path becomes a `modal-status`-style alert. Add a colored top strip inside the geo modal content:
  ```html
  <div class="modal-status bg-danger" id="ppGeoStatus" style="display:none"></div>
  ```
  `ppGeoSave` sets `ppGeoStatus` text + `style.display='block'` on validation failure instead of the generic alert modal; cleared on open. (Fixes §1 #12.)

### 3.7 Optional chart — honest sizing

Two candidates from the task brief:

- **Status doughnut — reject it.** The data is 7169/1/91: a doughnut is a solid blue circle. Useless.
- **Per-source column (ApexCharts CDN) — mild value.** The Tabler demo (`/charts.html`) uses ApexCharts; the informative breakdown is **sources** (2780 vs 18 — a real 155× span), and the CSS `bars()` in §3.2 "Źródła" card already tells that story with zero dependencies.
- **Events/day line — premature.** The honest timeseries is `created_at` seed days (4 points today, +1 per daily cron). A line chart over 4 points is noise.

**Spec decision:** ship the `bars()` "Źródła" card (§3.2) as the chart; add an ApexCharts column chart ("Wydarzenia wg dnia seeda", `created_at` GROUP BY, §2.2) **gated behind `days-since-first-seed >= 14`**, so it appears automatically once the timeline has shape and stays hidden while it's a 4-bar stub. CDN: `https://cdn.jsdelivr.net/npm/apexcharts@4/dist/apexcharts.min.js` (page-level `<script>`, after `tabler.min.js`). ApexCharts init must run after the script loads — either defer the inline init or `window.addEventListener('load', …)`.

---

## 4. Interactions

### 4.1 Filters → list wiring

| Control | Mechanism | Server effect |
|---------|-----------|---------------|
| `q` (text) | Enter or "Szukaj" button submits the GET form | `description LIKE` + `external_id LIKE` (§5.1) |
| Status segmented | `<a>` links; each carries all other params | `status=?` |
| Sources dropdown | checkboxes → hidden `#ppSources` (`a,b`), "Zastosuj" → `ppApplySources()` submits | `IN (…)` over the source expression |
| city / tag / geo | `<select onchange="this.form.submit()">` | existing bbox / tag / new geo conditions |
| from/to (event date) | `onchange` submit | `event_date` bounds (unchanged) |
| cfrom/cto (seed day) | `onchange` submit | `created_at` bounds via `fromMs/toMs` |
| limit | `onchange` submit | `EventFilter.limit` |
| Wyczyść | `ppClearFilters(e)` — `e.preventDefault()`, `localStorage.removeItem('evFilter:*')`, `location='/admin/events'` | reload to unfiltered |

All filter state lives in the URL — shareable, back-button-safe. Every filter change resets `page` to 1. Build all hrefs with the existing `qs`/`qstr` builder (`events.ts:237-253`); extract the shared param serialization into a small `buildQs(overrides)` helper to stop hand-patching 9 params in 5 places.

### 4.2 In-place saves (status/tag) — close the loop

Extend `POST /admin/events/:id` to return `{ ok, status, tag, counts: {total, approved, pending, rejected, untagged} }` (§2.2 queries, cheap). `ppUpdate` (`events.ts:404`) becomes:

1. `fetch` the POST (unchanged contract).
2. On `ok`: **toast** `ppToast('Zapisano.', 'success')`, update the **header badges** (`moderacja: N` and `Razem`) and the **four stat cards** from `resp.counts`, and keep the existing 700ms green outline on the select. DOM-update by id: give each stat card's value node `id="ppStat-{key}"`.
3. On failure: `ppToast('Nie udało się zapisać zmiany.', 'danger')` — **drop the generic alert modal** for save errors.

Status select stays per-row (fast path); the segmented filter + counts stay truthful because the page re-renders stats on every save.

### 4.3 Geo override — keep, extend feedback

- `ppGeoOpen/ppGeoClose/ppGeoSave` and the `ppGeoSwap` in-place swap (`events.ts:377-398`) stay **verbatim** — the swap contract (`data-id` on `.pp-place-cell`/`.pp-geo-btn`) is good.
- Add: toast on successful save (`'GEO zaktualizowane.'`), `modal-blur`, and the `modal-status` error strip (§3.6).
- Keep the coordinate-input UX (Google Maps copy format, whitespace stripping). Note honestly in the modal copy: "Zapis jest trwały (geo_locked)."
- **Do not** add "reset to default bbox" — schema can't express it without a migration (§2.4).

### 4.4 CSV export (optional but cheap)

`GET /admin/events?export=csv&{filters}` → same `eventsSql` but `limit` capped at ~50 000 and `Content-Type: text/csv`. Columns: `id, external_id, source, title, venue, event_date, showtimes, status, tag, city, lat, lng, link_url, created_at, is_sold_out, geo_locked, tags_locked`. Reuses `descParts`/`nearestCity` server-side. Content-Disposition `attachment; filename="events-{date}.csv"`. This is what the header's "Eksport CSV" button links to (§3.1).

### 4.5 localStorage — decision

**Remove the auto-restore redirect** (`events.ts:429-433`). Rationale: it breaks bookmarks, is invisible, and conflicts with shareable-URL convention. If persistence is still wanted, replace with an explicit opt-in: a "Zapamiętaj filtry" checkbox in the filter bar that writes `evFilter:*` keys **only when checked**, with a subtle "Filtry zapisane" text near it. Default spec: drop persistence entirely; `ppClearFilters` just clears the URL.

### 4.6 Moderation workflow (the actual job)

With `status=pending` now one click away (segmented control) and the header "moderacja: N" badge live, add one line under the table header when `status=pending` is active — a Tabler `.alert alert-warning` (or `card-status`): *"Nowy dzień seeda do przejrzenia: {count} wydarzeń z {event_date}."* Data: §2.2 moderation-queue query. This converts the near-empty pending list into a named task.

---

## 5. Implementation notes

### 5.1 New query work — `eventsWhere` (`backend/src/admin/queries.ts:56`)

Add to `EventFilter` (keep it backward compatible):
```ts
export interface EventFilter {
  // existing fields…
  q: string | null;          // text search
  sources: string[] | null;  // multi-source
}
```

`eventsWhere` additions (all bound, no string interpolation — matches existing discipline):

```sql
-- q: title/venue/city are all inside description; external_id for exact lookup.
AND (p.description LIKE ? OR p.external_id LIKE ?)          -- bind '%q%', '%q%'

-- sources (comma list from the hidden #ppSources):
AND substr(p.external_id,1,instr(p.external_id,'-')-1) IN (?, ?, …)  -- bind each

-- geo=locked → real meaning:
AND p.geo_locked = 1
-- geo=none:
AND (p.lat IS NULL OR p.lng IS NULL)

-- seed-day window (wires the dead fromMs/toMs — already in the WHERE, just never set):
-- cfrom → fromMs = Date.parse(`${cfrom}T00:00:00+02:00`)
-- cto   → toMs   = Date.parse(`${cto}T23:59:59.999+02:00`)
```

- The q/description search is `LIKE '%…%'` — **no index possible**, but the table is 7 261 rows; worst case is a full scan of a few MB. Acceptable. State it in a comment.
- **Diacritics caveat:** SQLite `LIKE` folds ASCII case only. `"Łódź"` is matched by `%Łódź%`, not `%lodz%`. Enhancement (out of scope, no migration now): add a generated column `description_norm` (`unicode`-folded via `lower`+replace or an ingest-time fold) and search that; until then, document that search is exact-letter.
- **Multi-tag correctness:** the existing tag save (`events.ts:458-467`) rewrites `tags` wholesale. The redesign must change the tag POST path to **merge**: parse existing `tags`, `push`/`remove` the chosen id, write the array back — never single-element. This preserves `tags_locked` semantics (`events.ts:462-466`) and fixes §1 #4.

### 5.2 Stats plumbing

Single page handler flow (mirror `events.ts:206` + `overview.ts:31`):

```ts
const [total, statusCnt, srcCnt, flagsCnt, seedDays, queue] = await Promise.all([
  totalSql, statusGroupSql, sourceGroupSql, flagsSql, seedDaySeriesSql, pendingQueueSql, // §2.2
]);
```
- Recompute **global** stats once per request (they're dataset-level); the per-filter total comes from the existing `eventsCountSql` row (`events.ts:222`).
- Serialize the four `{total, approved, pending, rejected, untagged}` values into `window.ppCounts` (the same JSON-bootstrap pattern as `window.ppLinkMap`, `events.ts:345`) so `ppUpdate` can patch stat cards client-side after a save without a reload.
- Toasts: reuse the exact `ppToast(msg, kind)` helper from the `reports.md` spec (§4.4 there) — `#ppToastWrap` container + `window.tabler.Toast.getOrCreateInstance`. Page-local inline script.

### 5.3 JS glue (page-local, ~150 lines, in `events.ts` body)

| Function | Responsibility |
|----------|----------------|
| `ppApplySources()` | read `.pp-src` checkboxes → set `#ppSources` → `form.submit()` |
| `ppClearFilters(e)` | `preventDefault` → `location='/admin/events'` (drop localStorage restore) |
| `ppUpdate(id, form)` | existing fetch + green outline **+** `ppToast` + patch stat cards from `resp.counts` |
| `ppToast(msg, kind)` | Tabler toast (§5.2) |
| `ppCopyId(id)` | `navigator.clipboard.writeText(id)` + `ppToast('ID skopiowane.','success')` |
| `ppGeoOpen/ppGeoSave/ppGeoSwap` | unchanged + toast + `modal-status` strip (§3.6) |
| `ppMediaOpen/ppLinkOpen/ppAlertOpen` | unchanged (reused by kebab menu) |

Keep the `window.tabler || window.bootstrap` late-resolution pattern (`events.ts:351`) — Tabler JS loads at the end of `layout()`.

### 5.4 Tabler specifics to get right

- **Segmented control:** `div.btn-group.btn-group-segmented` + `a.btn.btn-sm` items; active = `active` class (`/segmented-control.html`).
- **Dropdown with checkboxes:** `div.dropdown > button[data-bs-toggle="dropdown"]` + `div.dropdown-menu` containing `<label class="dropdown-item"><input class="form-check-input me-2">…` (`/dropdowns.html` demo has checkbox items).
- **Kebab:** `button.btn.btn-action.dropdown-toggle` (`/dropdowns.html`); icon from the `ICONS` sprite.
- **Pagination:** `ul.pagination.pagination-sm > li.page-item(.active|.disabled) > a.page-link` (`/pagination.html`).
- **Modals:** `div.modal.fade` + `div.modal-dialog.modal-blur` + optional `div.modal-status` strip (`/modals.html`).
- **Badges:** source = `SOURCE_BADGE` map:
  ```ts
  const SOURCE_BADGE: Record<string, string> = {
    helios: 'bg-red-lt text-red', cinemacity: 'bg-blue-lt text-blue', multikino: 'bg-cyan-lt text-cyan',
    going: 'bg-green-lt text-green', kupbilecik: 'bg-purple-lt text-purple', dzisapp: 'bg-pink-lt text-pink',
    eventylive: 'bg-orange-lt text-orange', luma: 'bg-teal-lt text-teal', meetup: 'bg-indigo-lt text-indigo',
  };
  ```
- **Sticky table header** (optional polish): `thead th` + `sticky-top bg-surface` inside `.table-responsive` (Tabler ships `.sticky-top`).
- `EVENT_SOURCES` → import `ProviderId` values from `seed/core/types.ts:9` (kill the duplicate list, §1 #14).

### 5.5 `ui.ts` additions

- **Icons to add to the `ICONS` sprite** (`ui.ts:109`): `icon-search`, `icon-more-horizontal`, `icon-check`, `icon-x`, `icon-external-link`, `icon-ticket` (optional), `icon-clock` (optional), `icon-download` (CSV), `icon-lock`. Already present: `calendar-event`, `map-pin`, `alert-triangle`, `tags`, `refresh`.
- **`relAgo(ms)`** — copy from `users.ts:11-20` (already duplicated in `reports.md`'s spec; promote to `ui.ts` so all three pages share it).
- **`pagination(page, totalPages, qstr)`** helper returning the §3.5 `ul.pagination` markup (currently hand-built per page).
- **`cards()` / `bars()` / `pill()` / `empty()`** stay; the events page mostly uses explicit `card card-sm` markup for the clickable cards.

### 5.6 File map / effort

| File | Change |
|------|--------|
| `backend/src/admin/dashboard/pages/events.ts` | rewrite: stats block, filter bar, table + kebab, pager, JS glue, CSV branch |
| `backend/src/admin/queries.ts` | `EventFilter` + `q`/`sources`/`geo=locked/none` in `eventsWhere`; export `sourceGroupSql`, `statusGroupSql`, `flagsSql`, `seedDaySeriesSql`, `pendingQueueSql` (or one `eventStats(db, f)` helper) |
| `backend/src/admin/ui.ts` | icons, `relAgo`, `pagination` helper |
| `backend/src/seed/core/types.ts` | already the single source for `ProviderId` — import it, no change needed |
| `admin-redesign/` | this spec |

No new migrations. No new build-step. One optional CDN (`apexcharts`, §3.7) gated on data age. CSV export (§4.4) is the only new *endpoint* behavior and it reuses the existing GET handler.

### 5.7 Manual test checklist

1. `?q=Multikino` returns only events whose description matches (check the `+2` multi-select source combination).
2. Status segmented links preserve `q`+`sources`+`city`+dates when switching; `page` resets to 1.
3. Sources dropdown: check helios+cinemacity → Apply → both in SQL `IN (…)`, label reads "helios +1".
4. `geo=locked` → exactly 2 rows; `geo=none` → 0 rows + proper empty state with "Wyczyść filtry".
5. Change a status → toast fires, "moderacja: N" and the four stat cards tick down without reload.
6. Tag an event with 2 existing tags (hand-set `tags='["filmy","muzyka"]'` via D1) → save merges, `+1` suffix visible, array intact.
7. `limit=200` + page jump to a middle page renders; prev/next + `…` collapse correct.
8. CSV export of the current filter opens a well-formed file.
9. Bookmark `/admin/events` → loads unfiltered (no localStorage redirect).

---

*Spec for redesigning `backend/src/admin/dashboard/pages/events.ts`. No application source was modified.*
