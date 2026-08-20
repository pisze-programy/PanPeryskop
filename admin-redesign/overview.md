# Redesign: Admin Overview (`GET /admin`)

Critical redesign spec for the PanPeryskop admin **Overview** page
(`backend/src/admin/dashboard/pages/overview.ts`), UI = Tabler 1.4 (CDN) + ApexCharts (CDN),
SSR as HTML-string functions. **This is a spec — no source was modified.**

Live numbers quoted below were pulled read-only from `panperyskop-db` on 2026-08-20.

---

## 1. Reality check — why the current page is weak

Be honest with yourself. This is what we shipped, and it is a **spreadsheet, not a dashboard**:

1. **No page header at all.** The page opens with a bare `<h2 class="mb-3">Overview</h2>`.
   Tabler's demo starts every page with `.page-header` → `.page-pretitle` + `.page-title`
   + `.page-title-actions` + `.btn-list`. We have zero hierarchy, zero actions, zero context
   (what day is it? when did data refresh?). It looks like a debug console, not an admin.

2. **The stat cards are dead numbers.** `cards()` (`ui.ts:75`) renders label + value.
   `Użytkownicy 9`, `Posty 7360`, `Like 0`, `Share 0`, `Media Requests 4`. No delta, no trend,
   no sparkline, no progress, no footer note, no link. "9 users" — is that up or down?
   What does a static `0` for Like/Share tell anyone about system health? Nothing. Two of the
   eight cards are permanently-zero noise (`Like`, `Share`) and one is a permanent near-zero
   (`Media Requests 4`) — they're occupying half the KPI row with information-free integers.

3. **Zero charts.** The only "visual" is the budget progress bar. The 14-day `daySeries()`
   data (views / media / logins / signups / likes / shares) is *already computed* on
   `/admin/stats` — the overview page refuses to reuse it and shows nothing but counts.
   The events window — the most operationally useful data on the page — is a raw 5-column
   table. A decision dashboard needs *shapes*, not grids.

4. **The "Cron" card is a wall of text.** Three `<p>` tags with `: `-separated label/value
   pairs. Should be a status-dot + timeline + countdown badge. No `alert`, no `status-dot`,
   no "next run in 4h 12m" — just a UTC timestamp the operator must mentally subtract.

5. **"Ostatni seed" is a dense label/value grid.** 8 `col-6 col-md-3` boxes of
   `text-secondary fs-6` + `fw-bold` pairs. No progress bars for scope/ingest completion,
   no visual status, no history, and the two things that actually matter (did it finish?
   how many ingested vs candidates?) are buried as bare numbers.

6. **No drill-downs.** Every card is inert. The only navigation is two leftover
   `btn btn-outline-secondary` buttons bolted at the bottom ("Statystyki", "Logi seed").
   Tabler is built around clickable cards, `list-group list-group-hoverable`, row links,
   and modal previews (which we already do well on `/admin/events`) — none of it reaches home.

7. **No interactivity whatsoever.** No JS on the page. No toasts, no auto-refresh, no
   expandable detail, no empty states (a `0` everywhere does the job of an empty state,
   badly). `tabler.min.js` is loaded but never used on this route.

8. **Data we ignore while showing noise.** We show `Media Requests 4` and `Share 0` but
   hide: `banned_devices` (0), open `reports`, failed-seed-batch ratio (16/41!), `pending`
   moderation queue (1), `admin_login_attempts` (22 — a security signal), event status
   doughnut (7169/1/91), source mix, tag coverage. The *interesting* numbers are all on
   other pages; the homepage shows the boring ones.

**Bottom line:** the current page is a printout of a few `SELECT COUNT(*)` queries stapled
under a heading. It cannot answer the only question an admin asks in the first 5 seconds:
*"Is everything working?"*. The redesign below makes that question answerable at a glance
and turns every number into a link.

---

## 2. Data inventory — everything that fits this page

All timestamps are ms since epoch unless noted. `daySeries` = `queries.ts:8`.

| # | Dataset | Source (table / helper / query) | What it can show on Overview |
|---|---------|----------------------------------|------------------------------|
| 1 | User count + activity | `users` → `COUNT(*)`; active 7d → `WHERE last_seen>=now-7d` | KPI "Użytkownicy" + "aktywni 7d" progress (live: **9 users, 1 active in 7d**) |
| 2 | Post/media volume | `posts` → `COUNT(*)`, split `category='live'` vs `'events'`, `type` | KPI "Posty / Media"; live-UGC weekly delta (live: **7360 total**, 7338 photo / 22 video, 99 live / 7261 events) |
| 3 | Engagement | `views` (366), `likes` (0), `shares` (0), `dislikes` (0), denormalized `posts.views_count` | KPI + trend; **don't burn KPI slots on 0s** — fold into activity chart |
| 4 | Views / media / logins per day | `daySeries(db,'views'\|'posts'\|'auth_events','created_at',since,extra)` | 14-day multi-series area chart (live: views 08-19=14, 08-20=352; logins 9/17/17/12) |
| 5 | Signups / registers | `daySeries(..., " AND event='register'")` on `auth_events` | secondary line on activity chart (live: 1/1/2) |
| 6 | Event statuses (all) | `SELECT status, COUNT(*) n FROM posts WHERE category='events' GROUP BY status` | Doughnut **Approved 7169 / Pending 1 / Rejected 91** |
| 7 | Event statuses in the 4-day window | existing overview query (`posts` + `event_date BETWEEN today..+SEED_DAYS_AHEAD` group by date,status) | Stacked bar + the per-day table (live: today 1471+31, +1 → 1986 approved, +1 pending, +3 rejected) |
| 8 | Event source mix | `SELECT substr(external_id,1,instr(external_id,'-')-1) s, COUNT(*) n FROM posts WHERE category='events' GROUP BY s` | Horizontal bar: helios 2780, cinemacity 2573, multikino 1270, dzisapp 222, eventylive 181, kupbilecik 110, going 67, meetup 40, luma 18 |
| 9 | Tag coverage | `posts.tags` (JSON) + `tags_locked` + `admin_tags` (pattern in `pages/tags.ts`) | "Tagged vs untagged" progress + locked-ratio (live: filmy 6623, **536 untagged**) |
| 10 | Last seed batch | `seed_batches ORDER BY created_at DESC LIMIT 1` + agg of `seed_runs WHERE batch_id=?` (already in page) | "Ostatni seed" card: status badge, scope bar, ingest bar, errors, duration, browser ms |
| 11 | Batch history | `seed_batches` last N; sparkline `SELECT day, SUM(ingested), SUM(candidates), SUM(errors), COUNT(*) FROM seed_runs WHERE created_at>=? GROUP BY day` | 7-batch sparkline + batch list (live: **25 done / 16 failed**) |
| 12 | Seed scope pipeline | `seed_scopes` per batch (status, attempts, error) — pattern in `pages/seed.ts` | expandable detail under last-batch card |
| 13 | Browser budget | `browserBudget(env)` (`queries.ts`, `seed/core/log.ts:43`) → `{monthMs, limitMs, exceeded}` | budget progress bar (live: **1.86M ms / 36M ms ≈ 31%**, not exceeded) |
| 14 | Cron state | `cronInfo(env, db)` (`queries.ts:26`) → schedules, summary, nextRunMs, lastCronRunMs | status-dot + next-run countdown (live: `0 2 * * *`, last cron run ≈ 2026-08-20 02:00 UTC) |
| 15 | Client errors | `client_errors` count + daySeries; page pattern in `pages/errors.ts` | Health alert (live: **0**) + mini bar if any |
| 16 | Reports | `reports` count by `status='open'`; page pattern in `pages/reports.ts` | Health alert (live: **0**) — empty is the good state |
| 17 | Bans | `banned_devices` count | Health alert (live: **0**) |
| 18 | Media requests | `media_requests` count | drop from KPI → fold into a small list or remove (live: **4**) |
| 19 | Admin login attempts | `admin_login_attempts` (`success`, `attempted_at`) | Security alert: recent failed logins (live: **22 rows total**) |
| 20 | Auth provider mix | `users` → `GROUP BY auth_provider` | small legend/badge (live: apple 3 / device 6) |
| 21 | Cities / geo | `CITIES`, `cityBbox`, `nearestCity` (`cities.ts`) | labels for media requests; future per-city event bars |

---

## 3. Proposed page composition (top → bottom)

Everything inside `<div class="container-xl">` (already the layout wrapper). Grid discipline:
**every card is a child of `.row.row-cards`**, breakpoints `col-12 col-lg-6 col-xl-3` etc.

### 3.0 Page header

```html
<div class="page-header d-print-none">
  <div class="row align-items-center">
    <div class="col-auto">
      <span class="page-pretitle">Panel administracyjny</span>
      <h1 class="page-title">Overview</h1>
    </div>
    <div class="col-auto ms-auto d-print-none">
      <div class="btn-list">
        <span id="pp-clock" class="text-secondary align-middle"></span>
        <a href="/admin/events" class="btn btn-outline-secondary">Moderacja eventów</a>
        <a href="/admin/seed" class="btn btn-outline-secondary">Logi seed</a>
        <button class="btn btn-primary d-none d-sm-inline-block" onclick="ppRefresh()">Odśwież</button>
      </div>
    </div>
  </div>
</div>
```

Data: none (static) + `#pp-clock` filled by JS with Warsaw time (see §5).

### 3.1 Health alert strip (the "is it working?" answer)

One `.card` per failure class, only rendered when the condition is true; green OK card only
when the whole system is green. Use **alerts inside `row-cards`**, not a bare alert pile.

```html
<!-- example: failures found -->
<div class="alert alert-danger" role="alert">
  <div class="d-flex">
    <div>
      <svg class="icon alert-icon" ...><use href="#icon-alert-triangle"/></svg>
    </div>
    <div>
      <h4 class="alert-title">Wymaga uwagi</h4>
      <div class="text-secondary">
        <span class="status-dot bg-danger"></span> 16/41 batchy seeda zakończone jako <strong>failed</strong> ·
        <span class="status-dot bg-warning"></span> 1 event <strong>pending</strong> ·
        <span class="status-dot bg-warning"></span> 22 próby logowania do admina
      </div>
    </div>
  </div>
</div>
```

Data (all live-grounded):
- Seed: `SELECT status, COUNT(*) FROM seed_batches GROUP BY status` → **16 failed** → danger.
- Moderation: pending count (statuses doughnut query) → **1** → warning (link to `/admin/events?status=pending`).
- Security: `SELECT COUNT(*) FROM admin_login_attempts WHERE success=0 AND attempted_at>=now-7d`
  → show count; danger if any.
- Errors: `client_errors` last 7d → green "0 błędów klienta".
- Budget: `budget.exceeded` → danger.
- Cron: `cronInfo().lastCronRunMs` older than ~30h → warning "cron się nie uruchomił".

### 3.2 KPI row — 4 high-signal stat cards (replaces the 8 dead cards)

Pattern = Tabler "revenue" card from `/widgets.html` (`subheader` + `h1` + delta badge +
`#chart-* .chart-sm` sparkline) with an optional progress footer. Grid:
`row row-cards row-deck` → 4 × `col-12 col-md-6 col-xl-3`.

**Card A — Użytkownicy** (link → `/admin/users`)

```html
<a class="card card-sm" href="/admin/users">
  <div class="card-body">
    <div class="subheader">Użytkownicy</div>
    <div class="h1 mb-3">9</div>
    <div class="d-flex mb-2">
      <div class="me-auto">Aktywni 7 dni</div>
      <div><span class="text-red">1</span> / 9</div>
    </div>
    <div class="progress progress-sm">
      <div class="progress-bar bg-red" style="width: 11%"></div>
    </div>
  </div>
</a>
```

Data: users total + `last_seen >= now-7d`. Progress color = green if active share > 50%,
red otherwise (live: 1/9 → red — honest signal, not decoration).

**Card B — Views** (link → `/admin/stats`) with sparkline

```html
<div class="card card-sm">
  <div class="card-body">
    <div class="d-flex align-items-center">
      <div class="subheader">Views · 14 dni</div>
      <div class="ms-auto lh-1">
        <span class="text-red">−2%</span>  <!-- vs prev. 7d -->
      </div>
    </div>
    <div class="d-flex align-items-baseline">
      <div class="h1 mb-3 me-2">366</div>
    </div>
  </div>
  <div id="pp-spark-views" class="chart-sm"></div>
</div>
```

Data: `daySeries(db,'views','created_at', now-14d)`; delta = last 7d sum vs previous 7d.
Sparkline: ApexCharts `area`, `sparkline:{enabled:true}`, `colors:[var(--tblr-primary)]`,
`stroke:{width:2}`. **Pad missing days to 0 in JS** (live views exist only on 08-19/20 —
a raw series would render as 2 points, see §5).

**Card C — Eventy w oknie** (link → `/admin/events?from=<today>&to=<+3>`) with mini stacked bar

```html
<div class="card card-sm">
  <div class="card-body">
    <div class="subheader">Eventy · okno 4 dni</div>
    <div class="h1 mb-2">7173</div>
    <div class="d-flex mb-1 text-secondary">
      <span class="me-3"><span class="status-dot bg-green me-1"></span>7169 approved</span>
      <span class="me-3"><span class="status-dot bg-yellow me-1"></span>1 pending</span>
      <span class="status-dot bg-red me-1"></span>3 rejected
    </div>
  </div>
</div>
```

Data: the existing window query (`posts` + `event_date BETWEEN today..+3`). "All" KPI = sum,
plus the green/yellow/red legend. The stacked-bar visual lives in §3.4; the card links there.

**Card D — Ostatni seed** (link → `/admin/seed`)

```html
<a class="card card-sm" href="/admin/seed">
  <div class="card-body">
    <div class="d-flex align-items-center mb-2">
      <div class="subheader">Ostatni seed · 2026-08-23</div>
      <div class="ms-auto"><span class="badge bg-green-lt">done</span></div>
    </div>
    <div class="d-flex align-items-baseline">
      <div class="h1 mb-2 me-2">96/96</div>
      <span class="text-secondary">scopy</span>
    </div>
    <div class="d-flex mb-1 text-secondary">
      <span class="me-3">Ingest <strong>1579</strong></span>
      <span class="me-3">Cand <strong>1842</strong></span>
      <span class="me-3">Błędy <strong class="text-green">0</strong></span>
    </div>
  </div>
</a>
```

Data: last `seed_batches` row + `SUM(...)` agg over `seed_runs WHERE batch_id=?` (already in
the current page). Ingest bar (ingested/candidates) as the sub-progress.

> **Dropped from KPI:** `Posty`, `Like 0`, `Share 0`, `Media Requests 4`. Total posts moves to
> a small "Media" line under the activity chart header (§3.3). Engagement zeros go into the
> activity chart; when likes/shares cross 0 they appear there naturally.

### 3.3 Activity chart — 14 days (2-col row with the doughnut)

Row: `row row-cards`. Left `col-12 col-lg-8`, right `col-12 col-lg-4`.

**Left card — "Aktywność · 14 dni"**

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Aktywność · 14 dni</h3>
    <div class="card-subtitle text-secondary">Views · Media · Logowania</div>
    <div class="card-actions">
      <span class="badge bg-secondary-lt">Media łącznie: 7360</span>
    </div>
  </div>
  <div class="card-body">
    <div id="pp-chart-activity"></div>
  </div>
</div>
```

ApexCharts multi-series **area chart**, `chart:{type:'area', height:280}`:
- series: Views (`daySeries views`, color `var(--tblr-primary)`), Media dodane (`daySeries posts`,
  `var(--tblr-success)`), Logowania (`daySeries auth_events event='login'`, `var(--tblr-warning)`).
- `fill:{opacity:.06}`, `stroke:{width:2, curve:'smooth'}`, `grid:{strokeDashArray:4}`,
  `dataLabels:{enabled:false}`, `legend:{position:'bottom'}`,
  `xaxis.categories` = 14 zero-padded Warsaw dates (keys are `YYYY-MM-DD` strings).

Data: three `daySeries()` calls (`queries.ts:8`), already wired on `/admin/stats` — reuse, don't duplicate.

**Right card — "Eventy · statusy"**

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Statusy eventów</h3>
    <div class="card-actions"><a class="btn btn-link" href="/admin/events?status=pending">Moderacja</a></div>
  </div>
  <div class="card-body">
    <div id="pp-chart-status"></div>
  </div>
</div>
```

ApexCharts **donut**, `chart:{type:'donut', height:280}`:
- series `[7169, 1, 91]`, labels `['Approved','Pending','Rejected']`,
  colors `['var(--tblr-success)','var(--tblr-warning)','var(--tblr-danger)']`,
  `legend:{position:'bottom'}`, `plotOptions.pie.donut.labels.total.show:true`.
- Click handler → `/admin/events?status=<slice>` (see §4).

Data: `SELECT status, COUNT(*) n FROM posts WHERE category='events' GROUP BY status`.

### 3.4 Events window — stacked bar + compact table

Full-width card, `col-12`. Keep the existing per-day table (it's genuinely useful) but
prepend a **stacked column chart** so the shape is readable in one second.

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Eventy — okno (4 dni)</h3>
    <div class="card-actions">
      <a class="btn btn-sm btn-outline-secondary" href="/admin/events?from=2026-08-20&to=2026-08-23">Zobacz wszystkie</a>
    </div>
  </div>
  <div class="card-body">
    <div id="pp-chart-window"></div>
  </div>
  <div class="table-responsive">
    <table class="table table-vcenter card-table">
      <thead><tr><th>Dzień</th><th>Wszystkie</th><th class="text-green">Approved</th>
      <th class="text-yellow">Pending</th><th class="text-red">Rejected</th></tr></thead>
      <tbody>...same rows as today, plus per-day links...</tbody>
      <tfoot class="table-light"><tr>...sums...</tr></tfoot>
    </table>
  </div>
</div>
```

Stacked bar: `chart:{type:'bar', stacked:true}`,
series Approved/Pending/Rejected over the `SEED_DAYS_AHEAD+1` days
(`categories: ['Dziś','Jutro','Pojutrze', '<weekday>', ...]`, reuse `dayLabel()` from
`overview.ts:15`), same three colors as the doughnut.

Data: the **existing** window query (`overview.ts:43-45`) — unchanged SQL, re-rendered.

### 3.5 Seed health row — last batch + 7-batch sparkline

Row: `row row-cards`. Left `col-12 col-xl-8` **"Ostatni seed"**, right `col-12 col-xl-4`
**"Batche · 7 dni"** sparkline.

**Left — Ostatni seed** (upgrade of the current 8-box grid into a `list-group list-group-hoverable`)

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Ostatni seed</h3>
    <div class="card-actions"><a class="btn btn-sm btn-outline-secondary" href="/admin/seed">Logi seed</a></div>
  </div>
  <div class="card-body">
    <div class="list-group list-group-hoverable">
      <div class="list-group-item">
        <div class="row align-items-center">
          <div class="col"><strong>2026-08-23</strong> <span class="badge bg-green-lt">done</span>
          <span class="badge bg-secondary-lt">manual</span></div>
          <div class="col-auto text-secondary">zakończono <strong>3 min temu</strong></div>
        </div>
      </div>
      <div class="list-group-item">
        <div class="row align-items-center">
          <div class="col">Scopy (96/96)</div>
          <div class="col-6"><div class="progress progress-sm"><div class="progress-bar bg-green" style="width:100%"></div></div></div>
          <div class="col-auto"><span class="text-secondary">100%</span></div>
        </div>
      </div>
      <div class="list-group-item">
        <div class="row align-items-center">
          <div class="col">Ingest (1579/1842)</div>
          <div class="col-6"><div class="progress progress-sm"><div class="progress-bar bg-primary" style="width:86%"></div></div></div>
          <div class="col-auto"><span class="text-secondary">86%</span></div>
        </div>
      </div>
      <div class="list-group-item">
        <div class="row">
          <div class="col-3 text-secondary">Błędy</div><div class="col-3 text-green fw-bold">0</div>
          <div class="col-3 text-secondary">Czas</div><div class="col-3">2.4s</div>
          <div class="col-3 text-secondary">Browser</div><div class="col-3">0.9s</div>
          <div class="col-3 text-secondary">Aktualizacja</div><div class="col-3">…</div>
        </div>
      </div>
      <!-- only when batch.reason -->
      <div class="list-group-item">
        <div class="alert alert-danger mb-0 py-2">Powód: <span class="text-red">…</span></div>
      </div>
    </div>
  </div>
  <div class="card-footer">
    <div class="d-flex align-items-center">
      <span class="text-secondary me-2">Budget Browser Run</span>
      <div class="progress flex-grow-1 progress-sm me-2">
        <div class="progress-bar bg-primary" style="width: 5%"></div>
      </div>
      <span class="text-secondary">1.9h / 10h</span>
    </div>
  </div>
</div>
```

- Budget **moves into the seed card footer** (it belongs with seed, not as a stray bar).
  Width = `fmtPctNum(monthMs, limitMs)`; `bg-danger` when `budget.exceeded` (live: **31%**,
  `bg-primary`).
- "relative time" via a shared `relAgo()` — move it out of `pages/users.ts:11` into `ui.ts`.
- Batch → `/admin/seed` (anchor link if we add `id="batch-<id>"` to the seed page `<details>`).

Data: last batch + `SUM` agg (as today) + `browserBudget(env)`.

**Right — "Batche · 7 dni"** sparkline

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Seed · ingest dziennie</h3>
    <div class="card-actions"><span class="badge bg-green-lt">25 done</span><span class="badge bg-red-lt">16 failed</span></div>
  </div>
  <div class="card-body">
    <div id="pp-chart-seed" class="chart-sm"></div>
  </div>
  <div class="list-group list-group-flush list-group-hoverable">
    <!-- one row per batch: day · status badge · scopes bar -->
    <a class="list-group-item" href="/admin/seed">
      <div class="row align-items-center">
        <div class="col"><strong>08-23</strong></div>
        <div class="col-auto"><span class="badge bg-green-lt">done</span></div>
        <div class="col-4"><div class="progress progress-sm"><div class="progress-bar bg-green" style="width:100%"></div></div></div>
      </div>
    </a>
    ...
  </div>
</div>
```

Data:
- Sparkline: `SELECT day, SUM(ingested) ing, SUM(errors) errs FROM seed_runs WHERE created_at>=now-8d GROUP BY day` → `area` sparkline of `ing` (color green; red fill/point on any `errs>0` day — live: all 0).
- Badges: `SELECT status, COUNT(*) FROM seed_batches GROUP BY status`.
- Rows: last 7 batches (`seed_batches ORDER BY created_at DESC LIMIT 7`), day + `batchStatusPill()` + scopes progress `scopes_done/scopes_total`.

### 3.6 Cron card — status-dot + countdown (replaces the text wall)

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Cron (planowanie)</h3>
    <div class="card-actions">
      <span class="badge bg-green-lt"><span class="status-dot status-dot-animated bg-green me-1"></span>aktywny</span>
    </div>
  </div>
  <div class="card-body">
    <div class="timeline">
      <div class="timeline-item">
        <div class="timeline-icon"><svg .../></div>
        <div class="timeline-content">
          <div class="text-secondary">Ostatni cron</div>
          <div class="fw-bold">2026-08-20 02:00 UTC</div>
        </div>
      </div>
      <div class="timeline-item">
        <div class="timeline-icon"><svg .../></div>
        <div class="timeline-content">
          <div class="text-secondary">Następny run</div>
          <div class="fw-bold"><span id="pp-cron-countdown">za 4h 12m</span></div>
          <div class="text-secondary">Harmonogram: <code>0 2 * * *</code> — codziennie 02:00 UTC (04:00 lato / 03:00 zima)</div>
        </div>
      </div>
    </div>
  </div>
</div>
```

Data: `cronInfo(env, db)`. `#pp-cron-countdown` = live countdown from `nextRunMs`
(Warsaw-aware, recomputed every 30s — see §5). Red badge if `lastCronRunMs` older than ~30h.

### 3.7 Optional small row — "na radarze" (data that would otherwise be invisible)

Only if you want to surface §2 items 15-19 without alerts. A `col-12` card,
`list-group list-group-hoverable` with status-dots:

- `client_errors` 7d → green dot "0 błędów klienta" (link `/admin/errors`)
- `reports open` → green dot "0 otwartych raportów" (link `/admin/reports`)
- `banned_devices` → "0 zbanowanych urządzeń" (link `/admin/users`)
- `media_requests` → "4 zapytania o media" (link `/admin/media-requests`)
- `admin_login_attempts` failed 7d → amber dot (only when > 0)

---

## 4. Interactions

1. **Every KPI card is a link.** Users→`/admin/users`, Views→`/admin/stats`,
   Events→`/admin/events?from=<today>&to=<+3d>`, Seed→`/admin/seed`. Wrap the `.card` in `<a>`
   (Tabler's demo does this — `.card` inside `<a>` with `.card-sm` and `text-reset text-decoration-none`).

2. **Doughnut → filtered list.** `data-action` on `pp-chart-status` slices:
   `chart: { events: { click: (e, ctx) => location.href = '/admin/events?status=' + ['approved','pending','rejected'][ctx.dataPointIndex] } }`.

3. **Source bar → filtered list.** Same pattern on the §2-8 bar if added:
   `/admin/events?source=helios` (the `EventFilter.source` branch in `queries.ts:61` already exists).

4. **Window table day links.** Make each day cell `<a href="/admin/events?from=DATE&to=DATE">`
   (existing filters handle it — zero new backend code).

5. **Seed card drill-down.** "Logi seed" → `/admin/seed`; add `id="batch-<id>"` anchors to the
   `<details>` elements in `pages/seed.ts:94` so Overview can deep-link `#batch-<id>`.

6. **Odśwież button + auto-refresh.** `ppRefresh()` (see below) re-fetches
   `/admin/api/overview` (exists, `api/overview.ts`) and re-renders cards + charts via
   `ApexCharts.exec(id, 'updateSeries', ...)`. Optional: checkbox "auto-odśwież co 60 s".

7. **Toasts for async feedback.** Tabler bundles Bootstrap — use
   `window.tabler.Toast` (or fallback `window.bootstrap.Toast`) with `.toast` markup in a
   `.toast-container` fixed at `top-right`, fired on refresh-complete ("Dane odświeżone") and
   on any seed-failure alert render. Reuse the `window.tabler.Modal` late-binding trick already
   used in `events.ts:351-352` — resolve at call time, not init time.

8. **Click-to-copy / hover tips.** `title` attributes on truncated values (already the pattern);
   add `data-bs-toggle="tooltip"` if desired — Tabler initializes tooltips.

---

## 5. Implementation notes

### New / extracted helpers (queries.ts)

Reuse `daySeries`, `cronInfo`, `browserBudget`, `eventsSql/CountSql`, `CITIES` as-is. Add:

```ts
// Event status doughnut + pending count (also used by the health strip).
export async function eventStatusBreakdown(db: D1Database): Promise<{ approved: number; pending: number; rejected: number }> {
  const { results } = await db.prepare(
    "SELECT status, COUNT(*) n FROM posts WHERE category='events' GROUP BY status"
  ).all<{ status: string; n: number }>();
  const r = { approved: 0, pending: 0, rejected: 0 };
  for (const x of results ?? []) { if (x.status in r) (r as any)[x.status] = x.n; }
  return r;
}

// Source mix — mirrors the `substr(external_id,...)` derivation in queries.ts:61.
export async function eventSourceBreakdown(db: D1Database): Promise<{ source: string; n: number }[]> {
  const { results } = await db.prepare(
    "SELECT substr(external_id,1,instr(external_id,'-')-1) source, COUNT(*) n FROM posts WHERE category='events' GROUP BY source ORDER BY n DESC"
  ).all<{ source: string; n: number }>();
  return results ?? [];
}

// Seed ingestion sparkline (last N days), for the batch-history card.
export async function seedDaySeries(db: D1Database, sinceMs: number): Promise<{ day: string; ingested: number; errors: number }[]> {
  const { results } = await db.prepare(
    `SELECT day, SUM(ingested) ingested, SUM(errors) errors
     FROM seed_runs WHERE created_at>=? GROUP BY day ORDER BY day`
  ).bind(sinceMs).all<{ day: string; ingested: number; errors: number }>();
  return results ?? [];
}

// Batch status distribution, for the health strip + sparkline card badges.
export async function batchStatusCounts(db: D1Database): Promise<{ status: string; n: number }[]> { ... }

// Failed admin login attempts in the window (security alert).
export async function failedAdminLogins(db: D1Database, sinceMs: number): Promise<number> { ... }

// Generic week-over-week delta for KPI badges:
export function sumSeries(s: { n: number }[]): number; // helper — split daySeries by 7d halves in JS.
```

### New UI helpers (ui.ts)

- `statCard({ href, subheader, value, delta, deltaCls, progressPct, progressCls, sparkId })`
  → renders §3.2 cards; keep `cards()` for the other pages or retire it.
- Move `relAgo(ms)` from `pages/users.ts:11` → `ui.ts` (used by seed card footer).
- `window.PP_DATA` bootstrap: emit one `<script>window.PP_DATA = ${JSON.stringify({...})}</script>`
  at the end of `body`. **All chart payloads are numbers + `YYYY-MM-DD`/`HH:MM` strings — safe.**
  For any future string embedding, escape `<` as `\u003C` (the `jsStr()` pattern in `events.ts:25`).

### Charts JS glue

Add **ApexCharts to the layout once** (not per page) so every future chart page gets it:

```html
<!-- layout(), after the CSS link, before </head> -->
<script src="https://cdn.jsdelivr.net/npm/apexcharts@4/dist/apexcharts.min.js"></script>
```

`tabler.min.js` still loads at the end of `body` (`ui.ts:67`) — init charts on
`DOMContentLoaded`, and resolve `window.ApexCharts` inside the handler (same late-binding
reasoning as `events.ts:351`). Minimal chart factory:

```js
function ppChart(elId, cfg) {
  window.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById(elId);
    if (el && window.ApexCharts) new window.ApexCharts(el, cfg).render();
  });
}
ppChart('pp-chart-activity', { chart: { type: 'area', height: 280, toolbar: { show: false }, fontFamily: 'inherit' },
  series: [ { name: 'Views', data: PP_DATA.activity.views },
            { name: 'Media', data: PP_DATA.activity.media },
            { name: 'Logowania', data: PP_DATA.activity.logins } ],
  colors: ['var(--tblr-primary)', 'var(--tblr-success)', 'var(--tblr-warning)'],
  stroke: { width: 2, curve: 'smooth' }, fill: { opacity: 0.06 },
  dataLabels: { enabled: false }, grid: { strokeDashArray: 4 },
  xaxis: { categories: PP_DATA.activity.days }, legend: { position: 'bottom' } });
```

Colors: use **CSS variables** (`var(--tblr-primary)`, `-success`, `-warning`, `-danger`) so
charts follow the theme — Tabler's own demo does exactly this.

### Critical gotchas (call these out to whoever implements)

1. **`daySeries` only returns days with rows.** The 14-day activity chart must **zero-pad**
   to a continuous date array in JS (`Map<d,n>` over a generated day list), or the views
   series (live: 2 data points in 14 days) renders as a 2-dot line.
2. **Chart data bootstrapping happens server-side** in `window.PP_DATA` — the page is SSR,
   so don't fetch charts from `/admin/api/*` on load (the API is for refresh/updates only).
3. **`fmtDate()` in `ui.ts` prints UTC.** For "ostatni cron" / "ostatni seed" use a Warsaw
   formatter (`todayWarsaw`/`warsawDateOf` exist in `seed/core/dates.ts`); the countdown uses
   `nextCronRunMs` (UTC ms) but displays Warsaw-local "za Xh Ym".
4. **Budget is a `monthMs` sum over `seed_runs.created_at`** (`seed/core/log.ts:43`) — already
   live; just stop re-computing it inline and pass it through `cronInfo`-style helpers.
5. **ApexCharts must load before `DOMContentLoaded` fires**, or the late-binding handler must
   retry on `window.ApexCharts` (load via `defer`/`async` or in `<head>`). The events page
   pattern of "resolve at call time" is your friend here.
6. **Don't put raw `description`/`tags` into chart data**; only numbers and dates (per #2).
7. Keep the `row-cards` grid strictly column-scoped — Tabler breaks if cards are stacked
   without `.row.row-cards` wrappers.

### Suggested implementation order

1. `ui.ts`: ApexCharts `<script>` in `layout()`; `statCard()` + `relAgo()`.
2. `queries.ts`: the six helpers above.
3. `overview.ts`: `page-header` + health strip + KPI row (no charts yet — verify SSR).
4. Add `pp-chart-activity` / `pp-chart-status` / `pp-chart-window` / `pp-chart-seed` +
   `window.PP_DATA`.
5. Refresh button + `/admin/api/overview` re-render + toast.
6. Anchor IDs on `seed.ts` batches + day/source links on `events.ts` filters.

---

## TL;DR

- **Delete:** 8 dead stat cards (`cards()`), the `<p>`-wall cron card, the label/value grid
  seed card, the two stray bottom buttons.
- **Build:** `page-header` + actions · health alert strip · 4 real KPI cards with
  delta/progress/sparkline · 14-day ApexCharts activity area · status doughnut ·
  events-window stacked bar + table · seed card with scope/ingest progress + budget footer ·
  7-batch sparkline list · cron timeline with live countdown.
- **Wire:** every card → existing filter page; doughnut/bar clicks → `/admin/events?...`;
  refresh via the existing `/admin/api/overview`; toasts + modals via `window.tabler.*`
  late-bound like `events.ts`.
- Data comes from tables already queried elsewhere — the only new SQL is 5 small GROUP BYs.
