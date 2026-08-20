# Seed admin page — critical review & redesign spec

Scope: replace `GET /admin/seed` (backend/src/admin/dashboard/pages/seed.ts, 170 lines).
UI stays Tabler 1.4 (CDN) SSR, no build step. **No application source modified — this is a spec.**

---

## 1. Reality check (what's wrong today)

### 1.1 Dump, not a dashboard
- **500-run cap with no count, no pagination.** `LIMIT 500` on `seed_runs` with the flat table rendered to the end of a 10 950-row table. The user has no idea how many rows matched, what page they're on, or whether the table is truncated.
- **Filters are split across two disjoint grids.** Day from/to + batch status apply *only* to batch cards; provider/transport/type apply *only* to the runs table. There is no way to scope `seed_runs` by a day range — the #1 question ("what happened on Friday?") is unanswerable with the runs table.
- **The two grids duplicate each other.** Every batch card already renders its runs (via `IN()` on `batch_id`), then the whole window of runs is re-rendered below. Same rows, two representations, two filter vocabularies.

### 1.2 No aggregation anywhere
- 4 stat cards are raw counts with zero context: no completion rate (`providers_done/total`), no success/error rate, no duration, no trend, no budget progress. "Failed: 3" is meaningless without knowing the total.
- `errSum` sums `seed_runs.errors` over **all** rows including legacy `provider='total'` summary rows (migration 0011 pre-dates batch linking, migration 0029). If a day has per-provider rows **and** a `'total'` row, errors are double-counted. Same risk applies to any ingested/candidates roll-up — aggregates **must** exclude `provider='total'` or restrict to `batch_id IS NOT NULL`.

### 1.3 Zero charts
- `seed.ts` has no charts at all; the stats page (pages/stats.ts) only has CSS-width `bars()`. The richest operational signal — ingested/day trend, provider health, error spikes, browser-budget consumption over time — is invisible. A page about a *pipeline* with no time series is a log file, not a monitoring page.

### 1.4 Anti-Tabler patterns
- **Native `<details>/<summary>`** for batch cards — inconsistent with Tabler's collapse/card/list-group vocabulary, and the summary line is a raw `d-flex` text soup (badges + counters + date + truncated reason all jammed inline, un-clickable whitespace, no affordance chevron).
- **Budget is an `alert-success/alert-danger`**, binary. No progress bar, no "used in %", no per-day breakdown. The overview page already does this better (progress bar in seedHtml).
- **Alerts stacked for "info / cron / budget"** — three competing visual-weight elements at the top push real data below the fold.
- **Hardcoded provider list** (`['helios','multikino','cinemacity',...]`, seed.ts:129) will drift from the actual `seed_runs.provider` values. A filter populated from `SELECT DISTINCT provider` cannot rot.
- **Error drill-down is a title tooltip** with 30–50 chars; `error_detail` (full text) is effectively unreadable.
- **No totals/empty/loading states** beyond `empty()`; no way to tell "done" from "page truncated".

### 1.5 Concrete wins a redesign buys
| Now | After |
|---|---|
| 500-row flat dump | paginated runs (25/50/100) + counts + totals row |
| dual filter grid | one filter bar (day range applies to both views) + errors-only toggle |
| raw count cards | stat cards with progress + rates |
| no charts | ingested/day area, batches/day stacked bar, budget/day with month limit |
| `<details>` soup | Tabler collapse cards / hoverable list-group with status dots |
| budget alert | progress card |
| tooltip errors | expandable row / modal with full `error_detail` |
| hardcoded providers | `DISTINCT provider` from DB |

---

## 2. Data inventory (everything available)

### 2.1 Tables (migrations 0011, 0013, 0014, 0016, 0019, 0029)

**`seed_batches`** — one row = full seed of one day.
`id`, `day` (YYYY-MM-DD), `run_type` (`cron|manual`), `status` (`created|fetching|fetch_done|ingesting|done|failed`), `providers_total`, `providers_done`, `scopes_total`, `scopes_done`, `reason` (watchdog/DLQ failure), `created_at`, `updated_at`.
Indexes: `idx_seed_batches_day`, `idx_seed_batches_created`.

**`seed_scopes`** — per-(batch, provider, scope) fetch unit, per-scope state machine.
`id`, `batch_id`, `provider`, `scope`, `status` (`pending|running|done|failed`), `attempts` (DLQ re-drive count), `error`, `created_at`, `updated_at`.
Uniq: `(batch_id, provider, scope)`.

**`seed_runs`** — per-run log line (legacy per-provider + `total` rows; queue path writes per-provider rows linked to batch).
`id`, `run_type`, `day`, `provider`, `transport` (`fetch|browser`), `candidates`, `ingested`, `skipped`, `errors`, `error_detail`, `duration_ms`, `browser_ms`, `batch_id` (nullable, migration 0029), `created_at`.
⚠️ Legacy `provider='total'` rows have `batch_id NULL` — always exclude `provider='total'` in roll-ups, or filter `batch_id IS NOT NULL`.

**`seed_candidates`** — per-candidate audit trail through fetch → dedupe → ingest.
`id`, `batch_id`, `provider`, `external_id`, `title`, `start_ms`, `lat`, `lng`, `city`, `venue`, `address`, `link`, `media_url`, `thumb_url`, `status` (`pending|ready|no_media|duplicate|ingesting|done|error`), `reason`, `winner_id` (dedupe winner), `post_id`, `attempts`, `scope`, `created_at`, `updated_at`.
Indexes: `(batch_id,status)`, `(external_id)`, `(created_at)`. Heavily pruned (4-day cleanup) — bulk counts cheap, but don't render rows.

**`seed_venue_cache`** — `(venue_name, lat, lng, day, created_at)`, not useful for UI.

### 2.2 Derived metrics (already computed elsewhere)
- `browserBudget(env)` → `{monthMs, limitMs: 10h, exceeded}` (seed/core/log.ts). Used on overview with a progress bar — reuse that pattern.
- `cronInfo(env, db)` → `{schedules, summary, nextRunMs, lastCronRunMs}` (queries.ts). `lastCronRunMs` is `MAX(created_at) WHERE run_type='cron'`.
- `daySeries(db, table, col, sinceMs)` (queries.ts) — Warsaw-day bucketing via `date(col/1000,'unixepoch','+2 hours')`; usable for 30d charts.
- Shared UI helpers (ui.ts): `esc`, `fmtDate`, `fmtDur`, `fmtPct`, `fmtPctNum`, `cards`, `bars`, `pill` (ok/err/warn/muted), `empty`. `pill()` already produces Tabler badges (`bg-success-lt text-success`, etc.).

### 2.3 Volumes (as observed)
~41 batches, ~10 950 runs in the 30d window; ~1 run/provider/day across ~8–9 providers, plus legacy `total` rows.

---

## 3. Proposed page composition (top → bottom)

All blocks below are SSR HTML in the body string passed to `renderPage(c, 'Seed', '/admin/seed', body)`. Charts use ApexCharts via CDN; chart data is embedded as JSON in inline `<script>` at the end of `body` (see §5.4). Every data block lists its query.

### 3.0 Page header
Replace `<h2>Seed</h2>` with Tabler `.page-header`:

```html
<div class="page-header mb-3">
  <div class="row g-2 align-items-center">
    <div class="col">
      <div class="page-pretitle">Dashboard</div>
      <h2 class="page-title">Seed</h2>
    </div>
    <div class="col-auto ms-auto">
      <a class="btn btn-outline-secondary btn-sm" href="/admin/seed">Odśwież</a>
    </div>
  </div>
</div>
```

> Note: the current page advertises "no buttons, cron only", but a `POST /admin/api/seed/run` (manual trigger) already exists in api/seed.ts. Optionally surface a **"Odpal seed (manual)"** button there as `btn btn-primary` — out of scope for this spec beyond a stub link.

### 3.1 System status strip (compact, de-emphasized)
Two slim alerts, one line each — info about *how* the system runs, not data:

```html
<div class="alert alert-light d-flex align-items-center gap-3 flex-wrap mb-3">
  <span><strong>Cron:</strong> schedules · summary</span>
  <span class="text-secondary">Następny: …</span>
  <span class="text-secondary">Ostatni: …</span>
  <span class="text-warning ms-auto">Brak ostatniego crona → sprawdź wrangler</span>
</div>
<div class="alert alert-important alert-dismissible mb-3">
  <div class="d-flex">
    <div><strong>Jak to czytać?</strong> …keep existing copy…</div>
    <a class="btn-close" data-bs-dismiss="alert" aria-label="Zamknij"></a>
  </div>
</div>
```

Data: `cronInfo()`; the "help" alert is the existing info text moved into a dismissible alert. Drop the 4-line "Filtry · Batche" section header — filters move to §3.4.

### 3.2 Stat cards (6, with progress)
`<div class="row row-cards mb-3">`, cards `col-6 col-md-4 col-xl-2` (or `col-xl-3` for 4 + a wide budget card). First **three** get progress bars:

1. **Batche (30d)** — `COUNT(*)` + mini stacked bar of `done / failed / active` (three `.progress-bar` segments: `bg-success / bg-danger / bg-warning`). *Data:* one grouped query below.
2. **Zakończone** — `COUNT(*) WHERE status='done'` colored `text-success`; sub-label `X/Y (success%)`; `.progress` fill success.
3. **Przetworzono (ingested 30d)** — `SUM(ingested)` over runs **excluding `provider='total'`**, `text-primary`.
4. **Błędy (30d)** — `SUM(errors)` (same exclusion), `text-danger` when `>0`.
5. **Śr. czas / run** — `AVG(duration_ms)` for last 30d, `fmtDur`.
6. **Browser budget** — wide card with `.progress` (`fmtPctNum(monthMs, limitMs)` capped at 100), `bg-danger` when exceeded + "PRZEKROCZONY" badge; sub-label `fmtPct(monthMs, limitMs)` and `fmtDur(monthMs) / fmtDur(limitMs)`. *Data:* `browserBudget(env)`.

```html
<div class="col-6 col-md-4 col-xl-2">
  <div class="card card-sm">
    <div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Batche (30d)</div>
      <div class="h2 mb-1">41</div>
      <div class="progress progress-sm">
        <div class="progress-bar bg-success" style="width:80%"></div>
        <div class="progress-bar bg-danger" style="width:5%"></div>
        <div class="progress-bar bg-warning" style="width:15%"></div>
      </div>
      <div class="text-secondary fs-5 mt-1">30 done · 3 failed · 8 active</div>
    </div>
  </div>
</div>
```

*Data (single query for cards 1–2):*
```sql
SELECT COUNT(*) AS total,
       COALESCE(SUM(status='done'),0) AS done,
       COALESCE(SUM(status='failed'),0) AS failed
FROM seed_batches WHERE created_at>=?;
-- active = total - done - failed
```

### 3.3 Charts — "Trendy 30 dni" (ApexCharts, no build step)
`.row row-deck row-cards` grid. Card = `card` + `card-header` (`.card-title`) + `card-body` holding a `<div id="chart-…">` target.

**3.3.1 Ingested / day — area chart, wide (col-12 or col-lg-8).**
Two series: `candidates` (secondary grey) and `ingested` (primary). Optional third: `errors` on a right axis (danger) to spot failing days. `xaxis: type:'datetime'`, `stroke curve smooth`, `fill opacity 0.08`, `zoom {type:'x'}`.

```sql
SELECT date(created_at/1000,'unixepoch','+2 hours') AS d,
       COALESCE(SUM(candidates),0) AS candidates,
       COALESCE(SUM(ingested),0)   AS ingested,
       COALESCE(SUM(errors),0)     AS errors
FROM seed_runs
WHERE created_at>=? AND provider<>'total'
GROUP BY d ORDER BY d;
```

**3.3.2 Batche / dzień — stacked column (col-12 col-lg-4).**
Series `done` / `failed` / `active` per day.

```sql
SELECT date(created_at/1000,'unixepoch','+2 hours') AS d,
       COUNT(*) AS n,
       COALESCE(SUM(status='done'),0)    AS done,
       COALESCE(SUM(status='failed'),0)  AS failed
FROM seed_batches WHERE created_at>=?
GROUP BY d ORDER BY d;  -- active = n - done - failed
```

**3.3.3 Browser budget / day (current month) — column with `annotations` limit line (col-12 col-lg-4).**
```sql
SELECT date(created_at/1000,'unixepoch','+2 hours') AS d, SUM(browser_ms) AS ms
FROM seed_runs WHERE created_at>=<start-of-month>
GROUP BY d ORDER BY d;
```
`annotations: {yaxis:[{y:limitMs, strokeColor:'#d63939', label:{text:'limit 10h'}}]}`.

**3.3.4 Stuck batches — alert-style card (col-12).** Not a chart; a list of active batches whose `updated_at < now-2h`, each with age. Empty → green "brak zakleszczonych". This is the ops-critical check the current page buries in the batch list.

```sql
SELECT day, status, updated_at, reason FROM seed_batches
WHERE status NOT IN ('done','failed') AND updated_at < ?
ORDER BY updated_at ASC LIMIT 20;
```

### 3.4 Filters
One GET form (`action="/admin/seed"`, `method="get"`, `class="card mb-3"`, body `row g-2`), two labelled groups via `.card-header` + small `.text-secondary text-uppercase` group titles. All controls keep `onchange="this.form.submit()"` (existing pattern).

- **Okres:** `dfrom` / `dto` (`.form-control[type=date]`) — applies to **both** batches *and* runs (new: wire `seed_runs.day BETWEEN ? AND ?`).
- **Batche:** `bstatus` (`select.form-select`, options from `[created, fetching, fetch_done, ingesting, done, failed]` + puste = Wszystkie).
- **Rundy:** `provider` (from `SELECT DISTINCT provider FROM seed_runs WHERE created_at>=? ORDER BY provider` — **never hardcode**), `transport` (`fetch|browser`), `rtype` (`cron|manual`).
- **Tylko błędy:** `errsonly` checkbox (`input.form-check-input`, `checked` if set) → adds `AND errors>0` to the runs query and highlights rows.
- Actions: `Wyczyść filtry` (`.btn btn-outline-secondary`, href `/admin/seed`) + `Zastosuj` (`submit`, `.btn btn-primary`) for when the user wants to type before submitting.

### 3.5 Provider health — table with inline progress
`card` with `card-table`. Columns: Provider | Runs | Ingested | Candidates | Err | Err% (mini `.progress` with `bg-danger`) | Śr. czas (`fmtDur(AVG(duration_ms))`) | Browser ms | Transport (fetch/browser badge counts).

```html
<tr>
  <td class="font-monospace">going</td>
  <td>112</td><td>1 240</td><td>1 380</td>
  <td class="text-danger fw-bold">9</td>
  <td style="min-width:120px">
    <div class="progress progress-sm">
      <div class="progress-bar bg-danger" style="width:6.5%"></div>
    </div>
  </td>
  <td>8.4s</td><td>3h 12m</td>
</tr>
```

```sql
SELECT provider,
       COUNT(*) AS runs,
       COALESCE(SUM(candidates),0) AS candidates,
       COALESCE(SUM(ingested),0)   AS ingested,
       COALESCE(SUM(errors),0)     AS errors,
       COALESCE(AVG(duration_ms),0) AS avg_ms,
       COALESCE(SUM(browser_ms),0)  AS browser_ms
FROM seed_runs
WHERE created_at>=? AND provider<>'total'
GROUP BY provider
ORDER BY ingested DESC;
```

### 3.6 Batch timeline — Tabler list-group with expandable detail
Replace `<details>` with a **hoverable list-group**, each row a card-style item:

```html
<div class="card mb-3">
  <div class="card-header"><h3 class="card-title">Batche (kolejki)</h3></div>
  <div class="list-group list-group-flush list-group-hoverable">
    <div class="list-group-item">
      <div class="row align-items-center">
        <div class="col-auto"><span class="status-dot status-green"></span></div>
        <div class="col"><div class="fw-bold">2026-08-19</div>
          <div class="text-secondary">5/5 scopów · 6/6 providerów · aktualizacja …</div></div>
        <div class="col-auto">
          <span class="badge bg-success-lt text-success">done</span>
          <span class="badge bg-secondary-lt text-secondary">cron</span>
        </div>
        <div class="col-auto"><a class="btn btn-sm btn-link" data-bs-toggle="collapse" data-bs-target="#batch-…">Rozwiń</a></div>
      </div>
      <div class="collapse mt-2" id="batch-…">
        <!-- scopes table (§3.6a) + runs table (§3.6b) -->
      </div>
    </div>
  </div>
</div>
```

- Status dot colors: `status-green` (done), `status-red` (failed), `status-yellow` (active), `status-muted`.
- Right side: `pill()` badges (reuse existing `batchStatusPill`/`scopeStatusPill`).
- Reason: `<span class="text-danger">` in the secondary line, full text on `title` + truncated to ~80 chars (was 40).
- Expansion uses **Bootstrap collapse** (`tabler.min.js` already bundles it) — the idiomatic Tabler replacement for `<details>`, and keeps URLs clean (no hash state).

**3.6a Scopes table** (per batch, `SELECT * FROM seed_scopes WHERE batch_id IN (…)`): Provider | Scope | Status (`scopeStatusPill`) | Próby | Błąd (`text-danger font-monospace`, now full `error` with `text-break`, no 50-char truncation).
**3.6b Runs table** (per batch, `SELECT * FROM seed_runs WHERE batch_id IN (…)`): existing columns; footer line "Brak logów (batch sprzed linkowania runów)" only when both empty.

> Keep `details`? No. `list-group-hoverable` + collapse gives hover affordance, consistent styling, and reuses bundled Bootstrap JS. The `IN()` batching already in seed.ts stays.

### 3.7 Runs table — paginated, totals footer
`card` + `card-header` ("Rundy (seed_runs)" + `badge` count "10 950") + `card-body` for filters (§3.4) + `table-responsive` + `card-table` + `card-footer` with pagination.

- Columns: Czas | Dzień | Typ | Provider | Transport | Cand | Ingest | Skip | Err | Czas | Browser | Błąd (collapsible detail).
- **Err cell** = button when `errors>0`: `<a data-bs-toggle="collapse" data-bs-target="#err-<id>" class="text-danger fw-bold">N</a>`; collapse row under it renders full `error_detail` (`td[colspan=12] .font-monospace .text-break`). This is the error drill-down.
- **Totals footer** (`tfoot`, `.table-footer`-style row): sums of Ingest/Skip/Err for the *current page* (cheap, honest; global totals live in §3.2).
- **Pagination** (Tabler `.pagination`): Prev / 1…n / Next, with `?page=` param; **page size selector** `25/50/100` (`select.form-select`, auto-submit). Page links must **carry all current filters** (rebuild query string server-side from `c.req.query()`).
- Query is `LIMIT ? OFFSET ?` + `COUNT(*)` twin; `ORDER BY created_at DESC`. Add batch day column via `LEFT JOIN seed_batches b ON b.id=r.batch_id` for rows where `batch_id` is NULL (legacy).

### 3.8 (Optional) Seed_candidates audit drawer
Given 4-day pruning + the `(batch_id,status)` index, a per-batch expandable *candidate summary* (not rows) is cheap:
```sql
SELECT status, COUNT(*) AS n FROM seed_candidates WHERE batch_id=? GROUP BY status;
```
Render as badge counts under §3.6's runs table (done/duplicate/error/no_media…). Skip if it adds clutter; the runs table already carries the signal.

---

## 4. Interactions

1. **Filter submit** — every control `onchange="this.form.submit()"`; `Zastosuj` for keyboard entry; `Wyczyść filtry` resets all params. All state lives in the query string (SSR-friendly, shareable/bookmarkable).
2. **Batch expand** — Bootstrap collapse (`data-bs-toggle`/`data-bs-target`), chevron rotates via `.collapsed` class; no page reload, no state in URL.
3. **Error drill-down** — clicking the Err count expands a sub-row with full `error_detail`; `errsonly=1` filter collapses to just failing runs.
4. **Runs pagination** — page + page-size links rebuild the URL preserving filters; page-size change auto-submits and resets `page=1`.
5. **Charts** — ApexCharts: hover tooltips (Warsaw-day labels), x-zoom, no export toolbar (`toolbar.show:false`). Charts are decorative-but-observable; they do not drive filters (keeps SSR simple).
6. **Stuck-batch alert** — pure data read; no action buttons (seed is cron-driven by design).
7. **Refresh** — page-header "Odśwież" link; charts re-init on full reload (no SPA).

---

## 5. Implementation notes

### 5.1 Aggregation queries (all D1-safe, literal table/col names only)
- 30d window: `since = Date.now() - 30*86400000`.
- **Warsaw-day bucketing** everywhere: `date(col/1000,'unixepoch','+2 hours')` — matches `daySeries()` and `seed_runs.day` semantics (cron runs at Warsaw midnight+).
- **Roll-up correctness:** every `seed_runs` aggregate must add `AND provider<>'total'` (legacy summary rows double-count; queue rows have `batch_id`, legacy don't — excluding `provider='total'` covers both). Current `errSum` (seed.ts:68) is wrong for legacy days.
- Boolean sums (`SUM(status='done')`) are valid in SQLite → 0/1.
- Budget: reuse `browserBudget(env)` from queries.ts; per-day month series needs one extra query (startOfMonth pattern already in seed/core/log.ts).

### 5.2 Query budget
- ~7 queries page load: 2 stat aggregates + 3 chart series + provider health + stuck batches + batches list + scopes/runs `IN()` (kept) + runs page `COUNT`+`SELECT`. All indexed (created_at, batch_id, day). Fine for D1 at ~41 batches / ~10 950 runs.
- **Never** `SELECT * FROM seed_candidates` — use the `GROUP BY status` summary (§3.8) or nothing.

### 5.3 Reuse existing helpers
- `cards()` (ui.ts) → stat cards (extend it or hand-roll to add progress bars).
- `pill()`, `esc()`, `fmtDate()`, `fmtDur()`, `fmtPct()`, `fmtPctNum()` → badges/formatting.
- `browserBudget()`, `cronInfo()`, `daySeries()` → §3.1, §3.2, §3.3.
- `batchStatusPill` / `scopeStatusPill` (seed.ts) → keep, move into ui.ts for reuse.
- **Provider filter** from `SELECT DISTINCT provider FROM seed_runs WHERE created_at>=? ORDER BY provider` — delete the hardcoded `['helios','multikino',...]` array.

### 5.4 ApexCharts wiring (CDN, no build)
1. Add to `layout()` in ui.ts (once, like tabler.min.js), or inject per-page:
```html
<script src="https://cdn.jsdelivr.net/npm/apexcharts@4/dist/apexcharts.min.js"></script>
```
2. Embed chart data as JSON in an inline `<script>` at the end of `body` (body is injected inside the container, scripts still execute). **Sanitize** the serialized JSON for `</script>`:
```ts
const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
// '<script>const SEED_CHARTS = ' + safeJson({ ingest, batches, budget }) + ';</script>'
```
3. Init after DOM ready:
```js
new ApexCharts(document.querySelector('#chart-ingest'), {
  chart: { type: 'area', height: 300, toolbar: { show: false }, zoom: { type: 'x' } },
  series: [
    { name: 'candidates', data: SEED_CHARTS.ingest.map(p => [p.d, p.candidates]) },
    { name: 'ingested',   data: SEED_CHARTS.ingest.map(p => [p.d, p.ingested]) },
  ],
  xaxis: { type: 'datetime', labels: { format: 'dd.MM' } },
  yaxis: [{ title: { text: 'wydarzenia' } }, { opposite: true, title: { text: 'błędy' } }],
  colors: ['#8d99ab', '#206bc4'],
  stroke: { width: 2, curve: 'smooth' },
  fill: { opacity: 0.08, type: 'solid' },
  dataLabels: { enabled: false },
  grid: { strokeDashArray: 4 },
}).render();
```
   Tabler palette to reuse: primary `#206bc4`, success `#2fb344`, danger `#d63939`, warning `#f59f00`, secondary `#8d99ab`.
4. Batch/day + budget/day charts: same pattern (`chart.type: 'bar'`, `stacked: true` for batches; `annotations` for the budget limit line).

### 5.5 Effort & risks
- **Effort:** ~1 new page file (rewrite seed.ts body + helper functions) + small `layout()` change for the ApexCharts script tag. No migration needed.
- **Risk:** ApexCharts CDN outage → page still works, charts are empty divs (acceptable; wrapper cards render regardless). Keep SSR data intact — never rely on JS for the core tables.
- **Risk:** legacy `'total'` rows — handled by the `provider<>'total'` exclusion; document it in a comment at the aggregate.
- **Test:** add a smoke check that `/admin/seed` renders with an empty DB (all `?.n ?? 0` / `empty()` paths) and that filter params produce valid SQL (no injection — all binds, all values from fixed option sets).

---

### Deliverable checklist
- [x] §1 Reality check (dump→dashboard, double-count bug, no charts, anti-Tabler patterns)
- [x] §2 Data inventory (all 5 seed tables + derived helpers + volumes)
- [x] §3 Composition top→bottom with Tabler markup + data source per block
- [x] §4 Interactions
- [x] §5 Implementation notes (SQL, ApexCharts init, reuse, risks)
