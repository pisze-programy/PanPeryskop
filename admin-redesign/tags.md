# PanPeryskop Admin — `GET /admin/tags` Redesign Spec

**Reviewer:** critical redesign review · **Date:** 2026-08-20
**Target:** `backend/src/admin/dashboard/pages/tags.ts` (SSR, Tabler 1.4 via CDN, no build step)
**Scope:** spec only — no source changes. All numbers below are a **live production snapshot** pulled from D1 (`panperyskop-db`, remote) on the review date.

---

## 1. Reality check — what the current page does, and why it falls short

Current page (`tags.ts:17-77`) renders, top to bottom:

1. A `msg` alert (`added` / `dup` / `invalid`) after form redirects.
2. Four stat cards via the shared `cards()` helper: **Eventy (events)**, **Z tagiem**, **Puste**, **Zablokowane (admin)**.
3. An "Dodaj nowy tag" card with a `form method="post"` → `input.form-control` + `btn btn-primary`, plus a prose disclaimer that tags can only be added, never removed.
4. A flat "Rozkład per tag" table: `Tag | Eventy | % z otagowanych`, built by re-parsing every `posts.tags` JSON row in JS (`tags.ts:32-38`), merged with the `tagCatalog` union (canonical `seed/core/tags.ts` + `admin_tags`), sorted by count desc.

### What's actually good
- The server-side aggregation loop is simple and correct (try/catch around JSON parse, filters non-strings, folds unknown tag ids into the union as `custom`).
- `tagSlug()` in the POST handler is reused from the same diacritic-fold helper the seed uses, so ids stay canonical-safe.
- The kanon/custom distinction exists (`pill('custom','muted')` vs `pill('kanon','ok')`) but is only shown inline.

### Critical problems (ordered by severity)

**P1 — The headline distribution is a lie-ish single slice.** Real production distribution of tagged events (n=6725):

| tag | events | % of tagged |
|---|---|---|
| filmy | 6 623 | 98.5% |
| meetup | 58 | 0.9% |
| muzyka | 21 | 0.3% |
| teatr | 11 | 0.2% |
| inne | 9 | 0.1% |
| komedia | 3 | 0.04% |

`filmy` is forced by the three cinema providers (`FORCED_TAGS` in `seed/core/tags.ts:36-42` → helios 2 780 + cinemacity 2 572 + multikino 1 270 = 6 622 of 6 623). A naive doughnut/pie of this is a single primary-colored slice and **would be a decoration, not an analysis**. Any chart must split "cinema-forced filmy" from the signal that actually lives in non-cinema sources (`going`, `dzisapp`, `eventylive`, `kupbilecik`, `meetup`, `luma`).

**P2 — `% z otagowanych` is ambiguous and slightly misleading.** It divides by tagged events (6725), not all events (7261), but the column header doesn't say so. Two tags can look identical while their absolute impact differs. The spec should show **both** % of tagged and % of all.

**P3 — Dead numbers, no drill-down.** Every table cell is inert. The events page (`events.ts`) already supports `?tag=<id>` and `?tag=none` filters (`queries.ts:65`), and persists filters to `localStorage`. The tags page should deep-link into it — that single link turns the whole page from a report into a workflow. This is the #1 interaction miss.

**P4 — "Zablokowane (admin)" is a zombie card.** `tags_locked=1` is only ever set by the events tag editor (`events.ts:464`), and current prod has **0** locked rows and **0** `admin_tags`. Two of four stat cards (Zablokowane, and arguably Puste) carry no actionable signal; they occupy prime space for data that matters (coverage, multi-tag, custom tags).

**P5 — The custom-tag feature is invisible.** `admin_tags` is empty today; when it isn't, the only evidence is a tiny `custom` pill in the table. There is no list of custom tags, no creation date (`admin_tags.created_at` is never read anywhere), no indicator of which events use them, and no way to inspect the slug that gets created. The add form also gives **no inline feedback** (only redirect alerts) and no live slug preview.

**P6 — No search, no scale.** With ~7 300 events and a long tail of tags, a flat unsorted-per-page table (no `table` filter, no search, no pagination) forces eyeballing. And every render re-reads ~6 700 JSON blobs in JS; fine at this size, but pointless when D1 supports `json_each` (verified working on this DB — see §5).

**P7 — Layout/detail cruft.** `w-50` form floats mid-page; the disclaimer is a wall of prose; no `page-header` / `page-pretitle` (other pages use a bare `<h2>` too, but the tags page is the one that gains the most from a proper header with actions).

---

## 2. Data inventory — everything the backend can show here

All derivations verified against the live schema (`schema/schema.sql`, migrations `0025`/`0026`/`0028`) and the query helpers (`admin/queries.ts`, `admin/cities.ts`).

| # | Data | Source / derivation | Live value (2026-08-20) |
|---|---|---|---|
| D1 | Total events | `SELECT COUNT(*) FROM posts WHERE category='events'` | **7 261** |
| D2 | Tagged events | same + `tags IS NOT NULL AND tags <> '[]'` | **6 725** |
| D3 | Empty events | D1 − D2 | **536** |
| D4 | Locked tags | same + `tags_locked = 1` | **0** |
| D5 | Multi-tag events | count rows where parsed `tags` length > 1 | **0** (system writes single-tag arrays) |
| D6 | Per-tag counts | `json_each(p.tags)` join, or the current JS loop | filmy 6 623 / meetup 58 / muzyka 21 / teatr 11 / inne 9 / komedia 3 |
| D7 | Per-tag × status | D6 + `p.status` | see §2.1 |
| D8 | Per-tag × source | D6 + `substr(p.external_id,1,instr(p.external_id,'-')-1)` | see §2.1 |
| D9 | Per-tag × city | D6 + `nearestCity(p.lat,p.lng)` (JS, mirrors `cities.ts:65`) or `cityBbox()` in SQL | computable |
| D10 | Source totals | `GROUP BY source` (substr on `external_id`) | helios 2 780 / cinemacity 2 573 / multikino 1 270 / dzisapp 222 / eventylive 181 / kupbilecik 110 / going 67 / meetup 40 / luma 18 |
| D11 | Status totals | `GROUP BY status` | approved 7 169 / rejected 91 / pending 1 |
| D12 | Canonical tag set | `CANONICAL_TAG_SET` (`seed/core/tags.ts:13`) — closed vocabulary, labels in `TAG_LABELS` | filmy/muzyka/meetup/komedia/teatr/inne |
| D13 | Custom tags | `admin_tags (id, label, created_at)`; **created_at is unused today** | **0 rows** |
| D14 | Full union catalog | `tagCatalog(db)` = canon ∪ admin_tags (used by events editor + app chips) | 6 ids |
| D15 | Events window / dates | `p.event_date`, `p.created_at` (used by overview.ts window table) | computable per tag |

### 2.1 Cross-tabs already computable today (proof the drill-down is real)

```
tag × source:     filmy → helios 2780, cinemacity 2572, multikino 1270, going 1
                  meetup → meetup 40, luma 18
                  muzyka → going 17, dzisapp 2, kupbilecik 1, cinemacity 1
                  teatr → going 11     inne → going 9     komedia → dzisapp 2, kupbilecik 1
tag × status:     filmy → 6572 approved / 51 rejected
                  muzyka → 19 approved / 1 rejected / 1 pending
```

**Design consequence:** the interesting tag variety lives almost entirely in the **non-cinema tail** (going/dzisapp/eventylive/kupbilecik/meetup/luma = 638 events). The page must be built around that, or the charts will be boring.

---

## 3. Proposed page composition (top to bottom)

Same SSR pattern: build an HTML string in `tags.ts`, pass through `renderPage()`; add ApexCharts via the shared `layout()` (see §5.2). Every Polish label below is the actual copy.

### 3.0 Page header — `.page-header` (replaces bare `<h2>`)

```html
<div class="page-header d-print-none mb-3" aria-label="Nagłówek">
  <div class="row g-2 align-items-center">
    <div class="col">
      <div class="page-pretitle">Panel · Taksonomia</div>
      <h2 class="page-title">Tagi</h2>
      <div class="text-secondary mt-1">7 261 eventów · 6 725 z tagiem (92,6%) · 0 tagów własnych</div>
    </div>
    <div class="col-auto ms-auto d-print-none">
      <div class="btn-list">
        <a class="btn btn-outline-secondary" href="/admin/events">
          <span class="nav-link-icon d-none-navbar-horizontal"><svg class="icon"><use href="#icon-calendar-event"/></svg></span>
          Moderacja
        </a>
        <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#ppTagAddModal">Dodaj tag</button>
      </div>
    </div>
  </div>
</div>
```
**Data:** D1, D2, D13. Subtitle computed once from the counts queried in §3.1.

### 3.1 KPI stat cards — keep 4, but swap the two dead ones

Use the existing `cards()` helper with new labels; replace "Zablokowane" (D4 = 0) and keep "Puste" but make it clickable (see §4):

```
cards([
  { label: 'Eventy (events)', value: 7261 },
  { label: 'Z tagiem',        value: 6725, color: 'success' },
  { label: 'Puste',           value: 536,  color: nEmpty ? 'warning' : '', href: '/admin/events?tag=none' },
  { label: 'Tagów (kanon)',   value: 6 },                  // D12 count
  { label: 'Tagów własnych',  value: admin_tags.length },  // D13
  { label: 'Multi-tag',       value: 0 },                  // D5 — honest signal
])
```
`cards()` currently renders plain `<div class="card card-sm">` — extend it with an optional `href` (wraps the card in `<a class="text-reset text-decoration-none">`), or emit the link inline in this page.

**Why:** the KPI row should answer "how healthy is the taxonomy", not restate counts. Multi-tag = 0 is the interesting diagnostic (the app's own chip model implies a tag *list*, but the admin editor and all seeds only ever write one tag — worth surfacing).

### 3.2 Coverage bar — the one "chart" that isn't decoration

A single segmented progress bar answering "how many events are findable by tag". Built from D1/D2/D3, pure CSS (no JS):

```html
<div class="card mb-3">
  <div class="card-header"><h3 class="card-title">Zasięg tagowania</h3></div>
  <div class="card-body">
    <div class="progress mb-2" style="height: 1.5rem">
      <div class="progress-bar bg-success" style="width: 92.6%">92,6%</div>
      <div class="progress-bar bg-warning" style="width: 7.4%"></div>
    </div>
    <div class="d-flex justify-content-between text-secondary fs-5">
      <span>6 725 z tagiem</span><span>536 bez taga</span>
    </div>
  </div>
</div>
```

### 3.3 Chart row — doughnut ×2, deliberately honest about `filmy`

The demo pattern to copy (verified in Tabler 1.4 `charts.html`): a card with a title, a `.row` with the `<div id="chart-…" class="position-relative"></div>` on the left and a `.divide-y.divide-y-fill` legend list (`.status-dot` + `.h2`) on the right.

**Left card (col-lg-7) — "Rozkład tagów" (doughnut, `sparkline`):**
Split **filmy vs nie-filmy** into the doughnut so the 98.5% slice is *readable*, with the non-filmy tail broken out in the side legend:

```html
<div class="card">
  <div class="card-header"><h3 class="card-title">Rozkład tagów</h3></div>
  <div class="card-body">
    <div class="row">
      <div class="col"><div id="chart-tag-dist" class="position-relative"></div></div>
      <div class="col-md-auto">
        <div class="divide-y divide-y-fill">
          <div class="px-3"><div class="text-secondary"><span class="status-dot bg-primary"></span> Filmy</div><div class="h2">6 623 · 91,2%</div></div>
          <div class="px-3"><div class="text-secondary"><span class="status-dot bg-success"></span> Meetup</div><div class="h2">58</div></div>
          <div class="px-3"><div class="text-secondary"><span class="status-dot bg-azure"></span> Muzyka</div><div class="h2">21</div></div>
          <div class="px-3"><div class="text-secondary"><span class="status-dot bg-purple"></span> Teatr / Inne / Komedia</div><div class="h2">23</div></div>
        </div>
      </div>
    </div>
  </div>
</div>
```
Series = `[6623, 58, 21, 23]` (filmy, meetup, muzyka, remainder). Label in the legend is "% of tagged" (D6 / D2); the tooltip shows both counts and %.

**Right card (col-lg-5) — "Tagi poza kinami" (doughnut, `sparkline`):**
The actual signal — distribution *within non-cinema sources* (D8 minus the cinema rows, denominator = 638):

```
meetup 58 · muzyka 21 · teatr 11 · inne 9 · komedia 3  (zaokrągl. do kategorii)
```
Series/labels from the same D6 map, restricted to `source NOT IN (helios, cinemacity, multikino)` (SQL: `substr(external_id,1,instr(external_id,'-')-1) NOT IN ('helios','cinemacity','multikino')`). Caption: *"kina (helios/cinemacity/multikino) zawsze trafiają do filmy — ten wykres pokazuje resztę."* Both doughnuts click through to the filtered events list (§4).

If only one chart fits the budget, keep this one: it is the only chart that could ever surprise the admin.

### 3.4 Add-tag — compact form in a card, moved next to the tag list

Replace the standalone `w-50` card with a `.card` that carries the form in an `.input-group` plus a live list of custom tags:

```html
<div class="card mb-3">
  <div class="card-header">
    <h3 class="card-title">Dodaj nowy tag</h3>
    <div class="card-actions"><span class="badge bg-secondary-lt">tylko dodawanie</span></div>
  </div>
  <div class="card-body">
    <form method="post" action="/admin/tags" class="d-flex gap-2 mb-2" onsubmit="return ppTagValidate(this)">
      <div class="input-group w-100">
        <input name="label" class="form-control" placeholder="np. Sport" required maxlength="40"
               oninput="ppTagSlugPreview(this.value)" aria-label="Nazwa nowego tagu" />
        <button class="btn btn-primary" type="submit">Dodaj</button>
      </div>
    </form>
    <div class="text-secondary fs-5 mb-3" id="ppTagSlugHint"></div>
    <div class="d-flex align-items-center gap-2 text-secondary fs-5">
      <span class="text-uppercase fw-bold fs-6">Tagi własne</span>
      <div class="tags-list" id="ppCustomTags">
        <!-- 0 dziś; gdy >0: <span class="tag">slug</span> × created_at -->
      </div>
    </div>
  </div>
</div>
```
- Keep the POST endpoint + redirect semantics (`tags.ts:79-92`) — they work. Add a **slug preview** line: `nowy-tag → admin_tags.id = "nowy-tag"` computed with the *same* `tagSlug()` algorithm (mirror it in JS, or return it from a tiny `GET /admin/tags/slug?label=` endpoint — see §5.4).
- When `admin_tags` is non-empty, render each as `<span class="tag">` with `created_at` (`fmtDate`) in the `title`.
- **Explicitly warn** when a canonical tag is typed: disable submit if `CANONICAL_TAG_SET` contains the folded id (client check + the existing `msg=dup` path).

### 3.5 Per-tag grid — searchable card grid (replaces the flat table)

Keep a full-fidelity table **below** the grid for completeness, but the primary "Rozkład per tag" view becomes a `.row.row-cards` of tag cards (`.col-md-6 col-xl-4`), each generated server-side:

```html
<div class="card mb-3">
  <div class="card-header">
    <div class="card-title">Rozkład per tag</div>
    <div class="card-actions">
      <div class="input-icon">
        <input type="search" class="form-control form-control-sm" id="ppTagSearch" placeholder="Szukaj taga…" />
        <span class="input-icon-addon"><svg class="icon"><use href="#icon-search"/></svg></span>
      </div>
    </div>
  </div>
  <div class="card-body">
    <div class="row row-cards g-2" id="ppTagGrid">
      <div class="col-md-6 col-xl-4" data-tag="filmy" data-custom="0">
        <div class="card card-sm">
          <div class="card-body">
            <div class="d-flex align-items-center gap-2 mb-2">
              <span class="badge bg-primary-lt text-primary">Filmy</span>
              <span class="badge bg-secondary-lt">kanon</span>
            </div>
            <div class="d-flex align-items-baseline gap-2">
              <span class="h2 mb-0">6 623</span>
              <span class="text-secondary">91,2% z tagiem</span>
            </div>
            <div class="progress progress-sm my-2"><div class="progress-bar" style="width:98.5%"></div></div>
            <div class="d-flex justify-content-between text-secondary fs-6 mb-2">
              <span>helios · cinemacity · multikino</span>
            </div>
            <a class="btn btn-sm btn-outline-secondary w-100" href="/admin/events?tag=filmy">Eventy →</a>
          </div>
        </div>
      </div>
      <!-- …one block per catalog entry… -->
    </div>
    <div class="text-secondary fs-5" id="ppTagEmpty">Brak wyników.</div>
  </div>
</div>
```
Each card packs, left to right: **tag badge + kanon/custom pill, count (h2), % of tagged, mini progress bar, source chips** (the D8 top-2/3 sources as `.text-secondary`), and the **"Eventy →"** deep-link. Row order = count desc (as today), with a client-side sort toggle (§4).

Below it, keep the **exact data** of today's table as a collapsible "Pełna tabela" card (`.collapse`, `data-bs-toggle`) — Tag / typ / Eventy / % z tag / % ogółem / statusy (`.text-success/warning/danger`) — so no information is lost in the redesign and screen readers/dumps keep a tabular view.

### 3.6 Custom tags warning

Small alert (`.alert.alert-warning`) when `admin_tags` is empty, exactly matching today's disclaimer but as a Tabler alert instead of prose:
> Tagi można tylko dodawać — usuwanie nie jest obsługiwane. Kanoniczne tagi (Filmy, Muzyka…) są w kodzie i zawsze na liście.

---

## 4. Interactions

| # | Trigger | Behavior |
|---|---|---|
| I1 | Search box (§3.5) | Client-side filter over `#ppTagGrid > [data-tag]`: hide non-matching, show `#ppTagEmpty` when zero. No round-trip. |
| I2 | Card "Eventy →" | `location.href = '/admin/events?tag=<id>'`. Works today (`queries.ts:65`); the events page also persists the filter to `localStorage` (`events.ts:425-435`) so the admin lands in a stable filtered list. |
| I3 | "Puste" KPI card | Same mechanism with `?tag=none` (existing sentinel). |
| I4 | Doughnut click | `chart.on('dataPointSelection', …)` → `location.href='/admin/events?tag=<label-id>'`. Non-filmy doughnut maps label→id; filmy maps to the full list. |
| I5 | Sort toggle (grid) | Segmented control (`.btn-group` `btn-group-sm` with `data-bs-toggle="buttons"`) — *według liczby* / *alfabetycznie*. Client-side re-order of grid nodes. |
| I6 | Kanon/custom filter | Small `.form-select.form-select-sm` (Wszystkie / Kanon / Własne) next to the search box; filters `data-custom`. |
| I7 | Add tag | Modal `#ppTagAddModal` (`.modal` / `.modal-dialog` / `.modal-content`, matching the existing geo modal in `events.ts:329-344`) — keeps the header clean. Live slug preview in the modal. On 409/`dup` show inline `.alert` instead of a full redirect. |
| I8 | Tag card hover | `.card` already gives hover affordance; make the whole card `href`-wrapped to the filtered list (mirror of I2) with the button as secondary. |
| I9 | Collapse "Pełna tabela" | `data-bs-toggle="collapse"` — one less vertical meter by default, data still reachable. |

---

## 5. Implementation notes

### 5.1 ApexCharts via the *same* CDN/version as Tabler
Tabler 1.4 vendors ApexCharts at `dist/libs/apexcharts/`. Don't introduce a second CDN + version risk — load it from the same host/version as `tabler.min.css`:

```html
<script src="https://cdn.jsdelivr.net/npm/@tabler/core@1.4.0/dist/libs/apexcharts/dist/apexcharts.min.js" defer></script>
```
(equivalent to the demo's `./dist/libs/apexcharts/dist/apexcharts.min.js`).

### 5.2 Script injection into `layout()`
`layout()` (`admin/ui.ts:35`) only emits `tabler.min.js` at the end of `<body>`. Add an optional `extraScripts` (or `pageScripts`) param to `layout()`/`page()`/`renderPage()` and have `renderPage(c, title, active, html, scripts)` append them **after** `tabler.min.js`. Inline page scripts (like `events.ts:346-437`) already work fine on this stack — keep that pattern.

### 5.3 Chart init — copy the Tabler demo exactly
Match the demo's own init (guarded `window.ApexCharts &&`, `DOMContentLoaded`, `fontFamily:'inherit'`, `animations:{enabled:false}`, `toolbar:{show:false}`, colors via `color-mix` over Tabler CSS vars so dark mode stays consistent):

```html
<script>
document.addEventListener('DOMContentLoaded', function () {
  window.ApexCharts && new ApexCharts(document.getElementById('chart-tag-noncinema'), {
    chart: { type: 'donut', fontFamily: 'inherit', height: 240, sparkline: { enabled: true }, animations: { enabled: false } },
    series: [58, 21, 11, 9, 3],
    labels: ['Meetup', 'Muzyka', 'Teatr', 'Inne', 'Komedia'],
    colors: ['color-mix(in srgb, transparent, var(--tblr-success) 100%)',
             'color-mix(in srgb, transparent, var(--tblr-azure) 100%)',
             'color-mix(in srgb, transparent, var(--tblr-purple) 100%)',
             'color-mix(in srgb, transparent, var(--tblr-yellow) 100%)',
             'color-mix(in srgb, transparent, var(--tblr-gray-400) 100%)'],
    tooltip: { theme: 'dark', fillSeriesColor: false },
    legend: { show: true, position: 'bottom', markers: { width: 10, height: 10, radius: 100 } },
    chart: { events: { dataPointSelection: function (e, c, o) {
      if (o && o.w && o.w.config && o.w.config.labels) {
        var map = window.ppTagIdMap;  // { label → tag id } bootstrapped below
        var id = map && map[o.w.config.labels[o.dataPointIndex]];
        if (id) location.href = '/admin/events?tag=' + encodeURIComponent(id);
      }
    } } }
  }).render();
});
</script>
```

### 5.4 JSON bootstrap for chart data
Follow the proven `events.ts` pattern — inline `<script>` with `JSON.stringify` (already used for `window.ppLinkMap`):

```html
<script>
window.ppTagData = {
  dist: { series: [6623, 58, 21, 23], labels: ['Filmy', 'Meetup', 'Muzyka', 'Pozostałe'] },
  nonCinema: { series: [58, 21, 11, 9, 3], labels: ['Meetup', 'Muzyka', 'Teatr', 'Inne', 'Komedia'] }
};
window.ppTagIdMap = { 'Meetup':'meetup', 'Muzyka':'muzyka', 'Teatr':'teatr', 'Inne':'inne', 'Komedia':'komedia', 'Filmy':'filmy', 'Pozostałe':null };
</script>
```
Labels are safe (fixed vocab), but **always escape `</script`** when a label/id could come from `admin_tags` (custom labels are admin-entered). `events.ts` doesn't have a `jsStr` for this because labels are server-controlled — here they're not, so add a guard (`esc()` + replace `</` before embedding).

### 5.5 Kill the JS aggregation loop — D1 has `json_each`
Verified working on this exact DB:

```sql
SELECT j.value AS tag, COUNT(*) AS n
FROM posts p, json_each(p.tags) j
WHERE p.category='events' AND p.tags IS NOT NULL AND p.tags <> '[]'
GROUP BY j.value ORDER BY n DESC;
```
→ replaces `tags.ts:32-38` and the count map. Use the same query for the cross-tabs by adding `p.status` / source substr to the `SELECT`+`GROUP BY`. Keeps the loop as a fallback only for the (still useful) unknown-id → custom fold.

### 5.6 New/changed routes
- `GET /admin/tags` — redesigned body (this spec), `renderPage(c,'Tagi','/admin/tags',body, scripts)`.
- `GET /admin/tags/slug?label=` — optional JSON `{ id: tagSlug(label) }` for the live preview (avoids duplicating `tagSlug()` in JS). Cheap, no DB.
- `POST /admin/tags` — unchanged behavior (keep `msg=` redirects; optionally return JSON when the client sends `Accept: application/json` for the modal flow).
- Drill-downs are **links to the existing `/admin/events?tag=`** — no new page needed.

### 5.7 Server cost
Current: 1 pass over ~6 700 rows + JSON parse per render (~ms, D1 remote read). With `json_each` it's one indexed-ish grouped query. Either is fine — the point of the redesign is not perf, but **not caching a static ~10-number aggregate**: consider a tiny in-memory cache (60s TTL) keyed on a `MAX(posts.updated_at)`-style stamp if the page gets hot. Low priority.

### 5.8 Accessibility / hardening notes
- Keep `table` for the full-data view (grid is decorative on top).
- Card buttons carry real `href`s (no `javascript:` for the primary actions).
- `maxlength="40"` + required on the tag input; server already validates `tagSlug()` non-empty.
- All new icons must be added to the `ICONS` sprite in `admin/ui.ts:109` (e.g. `icon-search`, `icon-plus`) — the layout inlines a fixed sprite subset.

---

## 6. Acceptance checklist (what "done" looks like)

- [ ] Page header with pretitle + actions; subtitle derived from live D1/D2/D13.
- [ ] KPI row: multi-tag + custom-tag counts replace the zombie "Zablokowane" card; "Puste" is a working `?tag=none` link.
- [ ] Coverage progress bar (§3.2).
- [ ] Two doughnuts: tagged-distribution (filmy split out) and **non-cinema** distribution — both click-through to `/admin/events?tag=`.
- [ ] Add-tag in an `.input-group` inside a card + slug preview + custom-tag list (with `created_at`).
- [ ] Searchable, sortable, filterable tag card grid (§3.5) with per-card source chips + "Eventy →".
- [ ] Collapsible full table retained below.
- [ ] ApexCharts from `@tabler/core@1.4.0` path, `renderPage` accepts page scripts, `dataPointSelection` wired to the tag map, JSON bootstrap escaped.
- [ ] `json_each` aggregation replaces the JS loop (loop kept only for unknown-id fold).
