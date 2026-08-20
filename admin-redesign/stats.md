# PanPeryskop Admin — `/admin/stats` Redesign Spec

> Status: design proposal only. No application source was modified.
> Reviewed file: `backend/src/admin/dashboard/pages/stats.ts` (render) + `backend/src/admin/dashboard/api/stats.ts` (JSON) + `backend/src/admin/queries.ts` (`daySeries`) + `backend/src/admin/ui.ts` (`layout`/`page`/`bars`/`cards`).

---

## 1. Reality check — what's wrong today

`GET /admin/stats` renders six stacked `card` blocks, each holding one plain `bars()` progress bar (Tabler `.progress` divs). Critique:

1. **No trend, only magnitude.** A horizontal progress bar shows *relative per-day size*, not *direction*. You cannot tell if views are climbing, flat, or spiked — the entire point of a "Statystyki" page. The only signal is "today's bar vs yesterday's bar", and only when the row is visible.
2. **No interactions.** No metric picker (6 metrics = 6 separate cards), no date-range selector, no drill-in, no hover tooltips, no comparison, no way to share/export the current view. `days` is hardcoded to `14`.
3. **No summary numbers.** Sum over range, best day, average/day, delta vs previous period — none computed. The overview page (`overview.ts`) shows *today's* counters; stats shows *bars*; nobody shows *range aggregates*.
4. **No data table.** The raw `{d, n}` series is invisible. There is no per-day table, no cumulative column, no change-vs-previous-day column.
5. **Zero-count days are missing.** `daySeries` returns only days that have rows (`GROUP BY d`). A sparse real dataset (366 views total) renders as a few isolated bars with empty gaps and no day alignment — a line/area chart would look broken without zero-filling.
6. **Rolling window, not calendar days.** `since = Date.now() - days*86400000` is a rolling 24h slice, so "14 dni" actually produces up to 15 partial buckets and the last day is always "today so far". A stats page should align to Warsaw calendar days.
7. **DST-fragile bucketing.** `daySeries` buckets by `date(col/1000,'unixepoch','+2 hours')`. Poland is `+02:00` (CEST) in summer but `+01:00` (CET) in winter — the hardcoded `+2` misbuckets timestamps near midnight for half the year. The repo already has a correct helper (`warsawOffset()` in `backend/src/seed/core/dates.ts`).
8. **Sequential queries.** The page runs 6 `daySeries` awaits one after another (no `Promise.all`), and `GET /admin/stats` (page) duplicates the metric→table map already defined in `GET /admin/api/stats` (API) — one source of truth is missing.
9. **Minor polish.** Titles are Polish (good) but mixed/singular (`Like`, `Share`, "Media dodane"), the page has no `.page-header`, no totals strip, and the shared `layout()` only loads Tabler's JS — there is no hook for per-page scripts (needed for ApexCharts).
10. **Notebook-scale is fine, chart scale isn't the risk.** Real traffic is small (366 views, 7360 posts) — performance is not a blocker — but the *data model* already supports full day series (event tables with `created_at`), so the redesign should build the complete interaction, not a degraded "small data" fallback.

**Redesign goal:** one page with a **chart toolbar** (metric segmented control + date-range selector + view toggle), a primary **ApexCharts area/line chart**, a **range-stat card row** (sum / best day / avg / delta), an **all-time totals strip**, and a **per-day data table** under the chart — all switching metric/range **without a full page reload** via a JSON bootstrap.

---

## 2. Data inventory (everything the page can show)

Source: `backend/schema/schema.sql` + `backend/migrations/*.sql`. All timestamps are epoch **ms**.

### 2.1 Series-able event tables (per-day counts via `daySeries`-style GROUP BY)

| Table | Col used for day | Per-day series means | Extra filters available | Index on `created_at`? |
|---|---|---|---|---|
| `views` | `created_at` | Liczba wyświetleń | — | ❌ only PK `(user_id, post_id)` |
| `posts` | `created_at` | Media/eventy dodane (uploads + seed) | `category`, `status` | ✅ `idx_posts_user`, bbox |
| `auth_events` | `created_at` | Logowania / rejestracje / wylogowania | `event` (`login|logout|register`), `provider` (`device|apple|google`), `success` | ✅ `idx_auth_events_created`, `idx_auth_events_event` |
| `likes` | `created_at` | Like | — | ❌ only PK `(user_id, post_id)` |
| `dislikes` | `created_at` | Dislike | — | ❌ only PK |
| `shares` | `created_at` | Share | — | ✅ `idx_shares_created` |
| `media_requests` | `created_at` | Zapytania o media | — | ✅ `idx_media_requests_bbox` |
| `client_errors` | `created_at` | Błędy klienta | `error_type` | ❌ none |
| `reports` | `created_at` | Zgłoszenia treści | `status` | ✅ `idx_reports_status` |
| `users` | `created_at` | Nowi użytkownicy (alternatywa dla rejestracji) | `auth_provider` | ❌ none |
| `seed_runs` | `created_at` | Runy seeda / ingested / errors | `run_type` (`manual|cron`), `provider` | ✅ `idx_seed_runs_created`, `idx_seed_runs_day` |

`daySeries(db, table, col, sinceMs, extraWhere)` (`backend/src/admin/queries.ts:8`) is the shared engine — callers pass fixed string literals, never user input. The metric map (table/col/extra) already lives in `api/stats.ts:14`.

### 2.2 All-time totals (production figures)

`posts` **7360**, `views` **366** (real traffic is small), plus `users`, `likes`, `shares`, `media_requests`, `client_errors`, `seed_runs` — all are `COUNT(*)` from `overview.ts:31`. A "totale" strip should include these 8 + `dislikes` + `auth_events`.

### 2.3 Gotchas the spec must solve

- **Zero-fill:** missing days must become `n: 0` (server-side) so the area chart is continuous.
- **Calendar alignment:** bucket by Warsaw day; use `todayWarsaw()` / `addDaysWarsaw()` / `warsawOffset()` from `backend/src/seed/core/dates.ts` instead of `Date.now() - days*86400000` and the hardcoded `+2 hours`.
- **DST:** derive the SQLite bucket offset from `warsawOffset()` → `"+${parseInt(warsawOffset())} hours"` (+2 summer / +1 winter).
- **Indexes:** `views`, `likes`, `dislikes`, `client_errors` lack a `created_at` index; `GROUP BY date(...)` does a full scan. Cheap fix: `CREATE INDEX ... ON views(created_at)` etc. Not blocking at this scale.

---

## 3. Proposed page composition

```
┌─ .page-header ──────────────────────────────────────────────┐
│  Statystyki            [aktualizacja: 2026-08-20 22:00 UTC] │
└─────────────────────────────────────────────────────────────┘
┌─ Chart toolbar (card) ──────────────────────────────────────┐
│  [Views|Media|Logowania|Rejestracje|Like|Share|Błędy|MediaReq] │
│  [7|14|30|90 dni]  [Obszar|Słupki]   [⟳ Odśwież]             │
└─────────────────────────────────────────────────────────────┘
┌─ Range stat cards ──────────────────────────────────────────┐
│ [Suma: 42]  [Najlepszy dzień: 2026-08-12 · 15]  [Śr./dzień: 3]  [▲ +12% vs poprz.] │
└─────────────────────────────────────────────────────────────┘
┌─ Main chart (card) ─────────────────────────────────────────┐
│  Views · ostatnie 14 dni                          [toolbar] │
│  ◢ ApexCharts area/line #chart-stats (height ~280)          │
└─────────────────────────────────────────────────────────────┘
┌─ All-time totals (cards strip) ─────────────────────────────┐
│  [Użytkownicy][Posty][Views][Like][Share][MediaReq][Błędy][Seed] │
└─────────────────────────────────────────────────────────────┘
┌─ Per-day table (card) ──────────────────────────────────────┐
│  Data | Wartość | Zmiana vs poprz. | Rozkład (mini-bar) | Suma narast. │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 `.page-header`

Tabler `page-header` pattern (see Tabler docs "Page headers") — the current `<h2>` becomes a real header:

```html
<div class="page-header">
  <div class="row align-items-center">
    <div class="col">
      <div class="page-pretitle">Analiza</div>
      <h2 class="page-title">Statystyki</h2>
    </div>
    <div class="col-auto ms-auto d-print-none">
      <span class="text-secondary" id="stats-updated">—</span>
    </div>
  </div>
</div>
```

### 3.2 Chart toolbar (card)

Metric = `btn-group` segmented control (Tabler uses `.btn-group` + `.btn-outline-primary`, active gets `.active`; reuses existing NAV icon names). Range = second `btn-group`. View toggle = third. All buttons carry `data-*` attributes for the JS (see §4).

```html
<div class="card mb-3">
  <div class="card-body d-flex flex-column flex-md-row align-items-center gap-2">
    <div class="btn-group btn-group-sm flex-wrap" role="group" aria-label="Metrika">
      <button type="button" class="btn btn-outline-primary active" data-metric="views">Views</button>
      <button type="button" class="btn btn-outline-primary" data-metric="media">Media</button>
      <button type="button" class="btn btn-outline-primary" data-metric="logins">Logowania</button>
      <button type="button" class="btn btn-outline-primary" data-metric="signups">Rejestracje</button>
      <button type="button" class="btn btn-outline-primary" data-metric="likes">Like</button>
      <button type="button" class="btn btn-outline-primary" data-metric="shares">Share</button>
      <button type="button" class="btn btn-outline-primary" data-metric="errors">Błędy</button>
      <button type="button" class="btn btn-outline-primary" data-metric="media_requests">Media Req.</button>
    </div>
    <div class="btn-group btn-group-sm ms-auto" role="group" aria-label="Zakres dni">
      <button type="button" class="btn btn-outline-secondary" data-days="7">7</button>
      <button type="button" class="btn btn-outline-secondary active" data-days="14">14</button>
      <button type="button" class="btn btn-outline-secondary" data-days="30">30</button>
      <button type="button" class="btn btn-outline-secondary" data-days="90">90</button>
    </div>
    <div class="btn-group btn-group-sm" role="group" aria-label="Typ wykresu">
      <button type="button" class="btn btn-outline-secondary active" data-view="area" title="Wykres liniowy">
        <svg class="icon"><use href="#icon-chart-line"/></svg>
      </button>
      <button type="button" class="btn btn-outline-secondary" data-view="bar" title="Słupki">
        <svg class="icon"><use href="#icon-chart-bar"/></svg>
      </button>
    </div>
    <button type="button" class="btn btn-sm btn-outline-secondary" id="stats-refresh" title="Odśwież">
      <svg class="icon"><use href="#icon-refresh"/></svg>
    </button>
  </div>
</div>
```

> Note: `#icon-chart-bar` is not yet in the icon sprite in `ui.ts:109` — add it (feather `bar-chart-2` path). Alternatively drop the view toggle in v1; the area chart alone already beats today.

### 3.3 Range stat cards (live, tied to selected metric)

Four `card card-sm` cells using the existing `cards()` layout pattern (`ui.ts:75`), but re-rendered by JS (ids, no content server-side):

```html
<div class="row row-cards mb-3">
  <div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
    <div class="text-secondary text-uppercase fw-bold fs-6">Suma</div>
    <div class="h2 mb-0" id="stat-sum">—</div>
  </div></div></div>
  <div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
    <div class="text-secondary text-uppercase fw-bold fs-6">Najlepszy dzień</div>
    <div class="h2 mb-0" id="stat-best">—</div>
    <div class="text-secondary" id="stat-best-date"></div>
  </div></div></div>
  <div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
    <div class="text-secondary text-uppercase fw-bold fs-6">Śr. / dzień</div>
    <div class="h2 mb-0" id="stat-avg">—</div>
  </div></div></div>
  <div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
    <div class="text-secondary text-uppercase fw-bold fs-6">vs poprzedni okres</div>
    <div class="h2 mb-0" id="stat-delta">—</div>
  </div></div></div>
</div>
```

Delta renders `▲ 12%` (`.text-success`) / `▼ -8%` (`.text-danger`) / `— 0%` (`.text-secondary`), comparing the selected window against the equally-long preceding window.

### 3.4 Main chart card — ApexCharts via CDN

Tabler's own charts (`preview/tabler /charts.html`) use **ApexCharts from CDN** rendered into a plain `<div>` inside a card body, with config that reads Tabler CSS variables (`var(--tblr-*)`) for colors/grid/labels. Replicate that pattern — no wrapper library needed.

Add to the page (per-page script hook, see §5.3):

```html
<script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
```

Card markup:

```html
<div class="card mb-3">
  <div class="card-header">
    <h3 class="card-title"><span id="chart-title">Views</span> · <span class="text-secondary" id="chart-range">ostatnie 14 dni</span></h3>
    <div class="card-actions"><span class="text-secondary" id="chart-sub">—</span></div>
  </div>
  <div class="card-body">
    <div id="chart-stats" role="img" aria-label="Wykres" class="position-relative"></div>
  </div>
</div>
```

ApexCharts config (mirrors `chartConfig()` output in `tabler/shared/lib/chart-script.ts`):

```js
const chart = new ApexCharts(document.getElementById('chart-stats'), {
  chart: {
    type: view,                       // 'area' | 'bar'
    height: 280,
    fontFamily: 'inherit',
    parentHeightOffset: 0,
    toolbar: { show: false },
    zoom: { enabled: false },
    animations: { enabled: true },
  },
  series: [{ name: metricLabel, data: counts }],       // counts = per-day numbers, zero-filled
  colors: ['var(--tblr-primary)'],
  dataLabels: { enabled: false },
  stroke: { width: 2, curve: 'smooth', lineCap: 'round' },
  fill: view === 'area'
    ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 100] } }
    : undefined,
  grid: { borderColor: 'var(--tblr-border-color)', strokeDashArray: 4,
          padding: { top: -8, right: 8, left: 8, bottom: 0 } },
  xaxis: {
    categories: days,                  // 'YYYY-MM-DD' strings
    axisBorder: { show: false },
    labels: {
      style: { colors: 'var(--tblr-secondary)' },
      formatter: (v) => formatDayLabel(v),   // pl short: "12.08" or "pt."
    },
  },
  yaxis: {
    min: 0,
    forceNiceScale: true,
    labels: { style: { colors: 'var(--tblr-secondary)' },
              formatter: (v) => String(Math.round(v)) },
  },
  tooltip: { theme: 'dark' },
  legend: { show: false },
});
chart.render();
```

`formatDayLabel` = `Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit' })` over `new Date(d + 'T12:00:00')` (T12 avoids TZ boundary flicker).

### 3.5 All-time totals strip (static)

Range-independent, from §2.2 — reuse `cards()` (`ui.ts:75`) unchanged:

```ts
cards([
  { label: 'Użytkownicy', value: totals.users },
  { label: 'Posty', value: totals.posts },
  { label: 'Views', value: totals.views },
  { label: 'Like', value: totals.likes },
  { label: 'Share', value: totals.shares },
  { label: 'Media Requests', value: totals.mediaRequests },
  { label: 'Błędy klienta', value: totals.clientErrors, color: totals.clientErrors ? 'danger' : '' },
  { label: 'Seed runs', value: totals.seedRuns },
]);
```

### 3.6 Per-day data table (card, under the chart)

```html
<div class="card">
  <div class="card-header"><h3 class="card-title">Dziennie · <span class="text-secondary" id="table-title">views</span></h3></div>
  <div class="table-responsive">
    <table class="table table-vcenter table-hover card-table">
      <thead>
        <tr><th>Data</th><th class="text-end">Wartość</th><th class="text-end">Zmiana vs poprz.</th><th>Rozkład</th><th class="text-end">Suma narast.</th></tr>
      </thead>
      <tbody id="stats-table-rows"><tr><td colspan="5">Brak danych.</td></tr></tbody>
    </table>
  </div>
</div>
```

Row (SSR or JS-rendered — same template):

```html
<tr>
  <td class="fw-bold">czw<span class="text-muted fw-normal"> · 2026-08-07</span></td>
  <td class="text-end">8</td>
  <td class="text-end"><span class="text-success">▲ 100%</span></td>
  <td><div class="progress progress-sm"><div class="progress-bar" style="width:53%"></div></div></td>
  <td class="text-end">37</td>
</tr>
```

The mini progress bar reuses the `bars()` width logic (`value/max*100`, min 0.5%). For ≤90 rows no server-side pagination is needed; if a 180/365-day range is added later, reuse the `.table-responsive` (browser scroll) — Tabler's `.pagination` component is unnecessary here.

---

## 4. Interactions — metric/range switching without full reload

### 4.1 JSON bootstrap (no initial fetch)

The SSR render already has all data — don't double-query. Embed it once:

```html
<script>
window.__STATS__ = /* payload from §4.3 */;
</script>
```

Serialized with `JSON.stringify(...).replace(/</g, '\\u003c')` (prevents `</script>` breakout — the payload is a mix of DB values and trusted labels).

### 4.2 Client flow

```js
const state = { metric: 'views', days: 14, view: 'area', chart: null };

function setActive(groupSel, attr, value) {
  document.querySelectorAll(groupSel).forEach((b) => {
    const on = b.dataset[attr] === value;
    b.classList.toggle('active', on);
  });
}
function busy(on) {
  document.querySelectorAll('.btn-group .btn, #stats-refresh').forEach((b) => (b.disabled = on));
  document.getElementById('stats-updated').textContent = on ? 'Ładowanie…' : fmtTs(Date.now());
}
async function load() {
  busy(true);
  try {
    const res = await fetch(`/admin/api/stats?metric=${state.metric}&days=${state.days}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    render(await res.json());                 // chart.updateOptions + cards + table
    history.replaceState(null, '', `/admin/stats?metric=${state.metric}&days=${state.days}`);
  } catch (e) { console.error(e); }
  busy(false);
}
// buttons
document.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () => { state.metric = b.dataset.metric; setActive('[data-metric]', 'metric', state.metric); load(); }));
document.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { state.days = +b.dataset.days; setActive('[data-days]', 'days', state.days); load(); }));
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; setActive('[data-view]', 'view', state.view); rebuildChart(); }));
document.getElementById('stats-refresh').addEventListener('click', load);
// deep-link: on boot read ?metric=&days= from location.search (validated against whitelists)
```

### 4.3 Extended API contract — `GET /admin/api/stats`

Extend the existing handler (`api/stats.ts`) — it already does cookie auth + the metric map. New payload:

```jsonc
// GET /admin/api/stats?metric=views&days=14
{
  "metric": "views",
  "days": 14,
  "rangeStart": "2026-08-07",          // Warsaw calendar day (inclusive)
  "rangeEnd": "2026-08-20",            // todayWarsaw()
  "series": [ { "d": "2026-08-07", "n": 8 }, { "d": "2026-08-08", "n": 0 }, /* ... zero-filled */ ],
  "sum": 42,
  "bestDay": { "d": "2026-08-12", "n": 15 },
  "avgPerDay": 3.0,
  "deltaPct": 12.5,                    // vs equally-long preceding window; null if none
  "totals": { "users": 4, "posts": 7360, "views": 366, "likes": 0, "shares": 0,
              "mediaRequests": 0, "clientErrors": 0, "seedRuns": 0 }
}
```

Metric map expanded (table / col / extra-where) — keep it the **single source of truth**, import it into the page route too:

```ts
export const STAT_METRICS = {
  views:          { label: 'Views',       table: 'views',         col: 'created_at' },
  media:          { label: 'Media',       table: 'posts',         col: 'created_at' },
  logins:         { label: 'Logowania',   table: 'auth_events',   col: 'created_at', extra: " AND event='login'" },
  signups:        { label: 'Rejestracje', table: 'auth_events',   col: 'created_at', extra: " AND event='register'" },
  likes:          { label: 'Like',        table: 'likes',         col: 'created_at' },
  shares:         { label: 'Share',       table: 'shares',        col: 'created_at' },
  errors:         { label: 'Błędy',       table: 'client_errors', col: 'created_at' },
  media_requests: { label: 'Media Req.',  table: 'media_requests', col: 'created_at' },
} as const;   // table/col are fixed literals — never user input (same rule as daySeries)
```

`days` whitelist: `7 | 14 | 30 | 90`; default `14`; reject anything else.

Server-side zero-fill + calendar alignment (this is the core new query logic — the `daySeries` helper stays but the **route** does the filling):

```ts
import { todayWarsaw, addDaysWarsaw } from '../../../seed/core/dates';
const offsetHours = parseInt(warsawOffset());           // +2 summer / +1 winter → SQLite modifier
// 1. raw per-day rows (reuse daySeries shape)
const raw = await daySeries(db, m.table, m.col, sinceMs, m.extra);
// 2. build full day list today-14+1 .. today
const days: string[] = [];
for (let i = 1; i <= days; i++) days.unshift(addDaysWarsaw(todayWarsaw(), -i));
days.push(todayWarsaw());
// 3. map onto it, default 0
const byDay = new Map(raw.map((r) => [r.d, r.n]));
const series = days.map((d) => ({ d, n: byDay.get(d) ?? 0 }));
```

All 8 metrics + totals can run in one `Promise.all` (7 queries + 1 totals query) — no sequential awaits.

---

## 5. Implementation notes

### 5.1 Query layer
- **Fix DST in `daySeries`** (`queries.ts:17`): replace `'+2 hours'` with a dynamic offset: `+${parseInt(warsawOffset())} hours`. Buckets then always land on Warsaw midnight.
- **Add a `statsRange` helper** (or do it inline in `api/stats.ts`): zero-fills the calendar-day list as in §4.3. Keep `daySeries` as the raw primitive; fillers live in the route.
- **Add an all-time totals helper** (one `COUNT(*)` per table in `Promise.all`) — reuse the exact queries from `overview.ts:31`.
- **Indexes (optional, cheap):** `CREATE INDEX idx_views_created ON views(created_at);` + the same for `likes`, `dislikes`, `client_errors`. At 366 views it's cosmetic, but the `GROUP BY date(...)` is a full scan and these tables will grow with users.

### 5.2 Markup layer (`ui.ts` / pages)
- **`layout()` hook for scripts:** change `layout(title, active, body)` → `layout(title, active, body, scripts: string[] = [])`, emitting `<script src="...">` tags after `tabler.min.js` (line 67). Thread it through `page()` (`ui.ts:71`) and `renderPage` (`dashboard/pages/shared.ts`) so **only the stats page** loads ApexCharts (keeps other admin pages light). No CSP header exists today, so CDN scripts work.
- **New helper for the delta badge** (e.g. `deltaBadge(pct)` returning the `.text-success`/`.text-danger` span from §3.3) and a **`dayRow`** table-row builder — both small, keep them next to `bars()` in `ui.ts` so SSR (first paint) and JS (switching) share identical markup.
- Add `#icon-chart-bar` (and optionally `#icon-trending-up` / `#icon-trending-down`) to the sprite in `ui.ts:109` if the view toggle is kept.
- Keep Polish labels; pluralize properly: `Views`, `Media`, `Logowania`, `Rejestracje`, `Like`, `Share`.

### 5.3 Rendering strategy (progressive enhancement)
- SSR renders the full page **from `window.__STATS__` data** (same payload shape as the API) — chart boots instantly, no fetch on first paint.
- Only *interactions* (metric/range/view buttons, refresh, table sort none) hit the JSON API. No full reloads.
- ApexCharts instance: keep **one** instance; on metric/range change call `chart.updateOptions({ xaxis: { categories }, series: [{ name, data }] }, true)`; on view toggle destroy + re-render (type is immutable in updateOptions). Simpler alternative: `chart.destroy()` + `new ApexCharts(...)` on every change — fine at this scale, loses nothing visually except a re-mount flicker.
- **Empty data**: if `sum === 0`, still draw the chart (flat zero line) but set `#chart-sub` to "Brak ruchu w tym zakresie" and keep the table row "Brak danych." (reuse `empty()` copy).
- **Zero counts**: ApexCharts `yaxis.min: 0` + `forceNiceScale` prevents "jumpy" axes; `formatter` rounds (counts are integers).

### 5.4 Security
- `table`/`col`/`extra` stay **fixed literals** from `STAT_METRICS` — no interpolation of user input (existing rule in `queries.ts:6`, keep it).
- Whitelist `metric` and `days` on the API (unknown → 400/fallback), same in the boot `?metric=&days=` deep-link parsing.
- Embedded JSON → `JSON.stringify(...).replace(/</g, '\\u003c')` to neutralize `</script>` breakout; labels are translated constants, series data is numeric.
- API is already cookie-auth gated (`requireSession`, `common.ts`) — same-origin `fetch` sends the cookie automatically; no change needed.

### 5.5 Scope / sequencing (suggested)
1. `queries.ts`: DST fix + `statsRange` (zero-fill) + totals helper.
2. `api/stats.ts`: single `STAT_METRICS` map + extended payload (`sum/bestDay/avgPerDay/deltaPct/totals`).
3. `ui.ts` + `shared.ts`: `scripts` hook + `deltaBadge`/`dayRow` helpers + 1-2 new icons.
4. `pages/stats.ts`: rewrite — `.page-header`, toolbar, stat cards, chart card, totals strip, table; embed `__STATS__`; inline JS for §4 interactions.
5. Verify locally: `cd backend && npx wrangler dev`, open `/admin/stats`, flip metrics/ranges, confirm no reload + correct zero-filled curves.

**Files touched by a future implementation:** `backend/src/admin/queries.ts`, `backend/src/admin/ui.ts`, `backend/src/admin/dashboard/pages/stats.ts`, `backend/src/admin/dashboard/api/stats.ts`, `backend/src/admin/dashboard/pages/shared.ts` (+ optional migration for `created_at` indexes).
