# Redesign spec — admin `Błędy` (client errors)

**Scope:** `GET /admin/errors` — `backend/src/admin/dashboard/pages/errors.ts`
**Target UI:** Tabler 1.4 (CDN, no build step — current SSR approach stays)
**Status:** spec only — no application source changed.

---

## 1) Reality check (current page, line by line)

`pages/errors.ts` is 28 lines and does the minimum. Concrete problems:

1. **No scale, hard-coded 7 days, capped at 200 rows.** `errors.ts:12-13` queries `WHERE created_at>=? ... LIMIT 200`. The 200 is a silent cap, not pagination — when the DLQ fills, older rows just disappear with no "more available" signal.
2. **No filters, no search, no type facet.** A monitoring page is only useful once you can say "show me only `upload_failed` in the last 3 days for this device". Today there is exactly one view: everything in 7 days.
3. **Meta is mangled.** `errors.ts:17` truncates `meta` to 50 chars and stuffs the raw JSON into a `title` attribute. `meta` is a 4000-char JSON blob (`post_id`, `type`, `age_s`, `retries`) — the single most useful debugging field, and it's invisible. Raw JSON in `title` also has escaping/UX limits.
4. **Message truncated with no way to see the rest.** `slice(0, 80)` with no expander. Real Swift error strings (`error.localizedDescription`) are longer.
5. **No metrics.** The overview page already counts "Błędy dziś" (`overview.ts:38`); the errors page itself shows zero aggregation. Type breakdown, 24h/7d counts, per-device totals — all absent.
6. **Puny empty state.** `errors.ts:22` → `empty()` renders a bare "Brak danych." `<div>`. The `admin-redesign` brief explicitly asks for a rich empty state (icon + title + action). This is the *primary* state today (0 rows), so it deserves the most polish.
7. **Redundant JSON API.** `dashboard/api/errors.ts` duplicates the page query (`days` param, `LIMIT 200`) and nobody consumes it. Either drop it or keep it as the future source for a chart/refetch — it must not silently drift from the page.
8. **Broken assumption about the icon set.** The `alert-triangle` icon exists in `ui.ts:116` — fine. But any new icons (search, calendar, chevrons, alert-circle, device) must be added to the `ICONS` sprite in `ui.ts:109-120`, since the sprite is a hand-maintained subset.
9. **No index on `created_at`.** Migration `0009_client_errors.sql` creates the table but no index — every page load is a full-table scan + sort. Fine at 0 rows, bad at DLQ scale. (Details in §5.)
10. **Inconsistent header.** Uses bare `<h2>`; other pages use the same pattern, but for a redesign the `.page-header` block (title + subtitle + context alert) is the right Tabler idiom.

**What is right and must be kept:** session gate via `renderPage` (`shared.ts`), `esc()` everywhere (XSS-safe), `pill()` for type coloring, `fmtDate` UTC timestamps, the explanatory "crashy raportuje Apple" context line (moves into an alert, see §3).

---

## 2) Data inventory

### 2.1 Table `client_errors` (`backend/migrations/0009_client_errors.sql`)

| column | type | notes |
|---|---|---|
| `id` | TEXT PK | nanoid(24), server-side |
| `device_id` | TEXT | nullable; client's keychain `device_id`, max 200 |
| `error_type` | TEXT NOT NULL | max 100; default `'unknown'`; **known values today: `upload_failed`, `stale_drop`** (`ios/.../PostUploader.swift:60,78,104`) — open set, client-controlled |
| `message` | TEXT | nullable, max 1000; Swift `error.localizedDescription` |
| `meta` | TEXT | nullable JSON, max 4000; shape from `PostUploader.report()`: `{ post_id, type, age_s, retries? }` |
| `created_at` | INTEGER NOT NULL | epoch ms |

No `user_id` column — device linkage only (see 2.3). **No index exists** on any column except PK.

### 2.2 Write path (context for the reader, not admin UI data)

- `POST /client/errors` (`backend/src/api/clientErrors.ts`) — unauthenticated fire-and-forget, sanitizes/truncates all fields, coerces `error_type` → `'unknown'`, stores `meta` as JSON string. Rows are appended by the iOS background-uploader DLQ.
- This is **not** crash reporting (Apple/TestFlight) and **not** seed/pipeline errors (those live in `seed_runs`/`seed_batches`, already on Overview + Seed pages). The page copy should keep saying that.

### 2.3 Joinable/related data (free enrichment, all already in D1)

| source | value added |
|---|---|
| `users.device_id` (UNIQUE, migration `0001`) | resolve a `device_id` → `username`, `role`, `created_at`, `last_seen`. Lets the admin see *who* a failing device is. |
| `banned_devices(device_id, reason, banned_at)` (migration `0007`) | flag + reason when the failing device is banned. |
| `users.last_seen` (migration `0027`) | "device still active?" context on drill-down. |

### 2.4 Existing queries to align with

- Overview "Błędy dziś": `COUNT(*) WHERE created_at>=now-1d` (`overview.ts:38`).
- `dashboard/api/errors.ts` — days-window mirror; redundant today.

### 2.5 Derived metrics available via GROUP BY (all cheap at current scale)

- Errors in 24h / 7d / 30d (counts).
- Errors grouped by `error_type` (counts → badge list).
- Errors per day (7- or 14-day series → CSS bar chart).
- Errors per `device_id` (top N, joined with users/banned).

---

## 3) Proposed page composition

Layout: `.page-header` → context `.alert` → stats row → filter form → chart card → list card (table + pagination) → rich empty state. All SSR, single GET, exactly like `events.ts`/`users.ts` — no client-side fetching.

### 3.1 Page header + context alert

```html
<div class="page-header d-print-none mb-3">
  <div class="row align-items-center">
    <div class="col">
      <h2 class="page-title">Błędy klienta</h2>
      <div class="text-secondary">Nieudane background-uploady → DLQ. Crashy raportuje Apple (TestFlight → Crash Reports).</div>
    </div>
    <div class="col-auto ms-auto">
      <a class="btn btn-outline-secondary" href="/admin/errors">Odśwież</a>
    </div>
  </div>
</div>
```

Context detail worth surfacing (only when it's true): an `.alert alert-danger` (or `alert-warning` for stale-only) when **any** errors exist in the current window:

```html
<div class="alert alert-danger d-flex align-items-center" role="alert">
  <svg class="icon me-2"><use href="#icon-alert-triangle"/></svg>
  <div>27 błędów w ostatnich 7 dniach — <strong>25× upload_failed</strong> na urządzeniu <code class="font-monospace">…</code>.</div>
</div>
```

Rendered **only** when count > 0. On the all-clear path the empty state (§3.6) carries the message instead. Keeps the "0 rows today" page clean.

### 3.2 Stat cards (Tabler `.stat` block — richer than existing `cards()`)

Use Tabler's `.stat` component (not the simple `cards()` helper) for the top row:

```html
<div class="row row-deck row-cards mb-3">
  <div class="col-sm-6 col-xl-3">
    <div class="card card-sm">
      <div class="card-body">
        <div class="row align-items-center">
          <div class="col-auto">
            <span class="avatar bg-danger-lt text-danger"><svg class="icon"><use href="#icon-alert-triangle"/></svg></span>
          </div>
          <div class="col">
            <div class="text-secondary text-uppercase fw-bold fs-6">Błędy · 24 h</div>
            <div class="h2 mb-0">12</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- Błędy · 7 dni (same block), Błędy · 30 dni, Unikalne urządzenia -->
</div>
```

Cards: **24 h**, **7 dni**, **30 dni** (all `COUNT`), **unikalne urządzenia** in the window. The 24h card goes `text-danger` when > 0 (matches Overview's `Błędy dziś` convention, `overview.ts:54`). Counts always reflect the **days-window filter**, not the type/search filter — they are the header metrics; the table is the focused view.

### 3.3 Type breakdown card (badge counts)

Left-hand column under the stats (`.col-lg-4`), alongside the chart:

```html
<div class="card">
  <div class="card-header"><h3 class="card-title">Błędy wg typu</h3></div>
  <div class="list-group list-group-flush">
    <a class="list-group-item d-flex align-items-center justify-content-between" href="/admin/errors?days=7&type=upload_failed">
      <span><span class="badge bg-danger-lt text-danger">upload_failed</span></span>
      <span class="text-secondary">25 <svg class="icon"><use href="#icon-chevron-right"/></svg></span>
    </a>
    <a class="list-group-item ..." href="/admin/errors?days=7&type=stale_drop"> ... </a>
    <a class="list-group-item ..." href="/admin/errors?days=7&type=unknown"> ... </a>
    <a class="list-group-item d-flex align-items-center" href="/admin/errors?days=7">
      <span class="text-secondary">Wszystkie typy</span><span class="ms-auto text-secondary">27</span>
    </a>
  </div>
</div>
```

Row = click-through preset for the type filter (§4.2). Badge color mapping (from `pill()`): `upload_failed` → err (red), `stale_drop` → warn (amber), `unknown`/other → muted. Show **top 6 types by count**, then "Wszystkie". Zero errors → card shows the rich empty state (or is hidden entirely).

### 3.4 Chart card — errors per day

Right-hand column (`.col-lg-8`):

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Błędy dziennie</h3>
    <div class="card-actions text-secondary">7 dni · Warszawa</div>
  </div>
  <div class="card-body"> … bars … </div>
</div>
```

Reuse the existing CSS `bars()` helper from `ui.ts:86-96` (no new JS dependency; keeps the no-build-step rule). 7- or 14-day series `GROUP BY date(created_at/1000,'unixepoch','+2 hours')` (same Warsaw-day math as `daySeries()`, `queries.ts:8-23`). Bars colored `bg-danger` when the day count > 0. Empty series → `empty()`.

### 3.5 Filter form + list card + canonical pagination

**Filter form** (GET, `onchange="this.form.submit()"` like `events.ts:280-294` and `users.ts:48-51`):

```html
<form method="get" action="/admin/errors" class="row g-2 mb-3">
  <div class="col-6 col-md-2">
    <label class="form-label">Okres</label>
    <select name="days" class="form-select" onchange="this.form.submit()">
      <option value="7">7 dni</option><option value="14">14 dni</option><option value="30">30 dni</option>
    </select>
  </div>
  <div class="col-6 col-md-2">
    <label class="form-label">Typ</label>
    <select name="type" class="form-select" onchange="this.form.submit()">
      <option value="">Wszystkie typy</option>
      <option>upload_failed</option><option>stale_drop</option><option>unknown</option>
    </select>
  </div>
  <div class="col-6 col-md-4">
    <label class="form-label">Szukaj</label>
    <div class="input-icon">
      <span class="input-icon-addon"><svg class="icon"><use href="#icon-search"/></svg></span>
      <input name="q" class="form-control" placeholder="message, meta, device_id…" value="…" />
    </div>
  </div>
  <div class="col-6 col-md-2 d-flex align-items-end">
    <a class="btn btn-outline-secondary" href="/admin/errors">Wyczyść</a>
  </div>
</form>
```

**List card + Tabler `.pagination`** (canonical component — the brief names `/pagination.html`; note the codebase currently uses prev/next `btn-group` on events, so this is a deliberate upgrade):

```html
<div class="card">
  <div class="table-responsive">
    <table class="table table-vcenter card-table">
      <thead>
        <tr>
          <th>Czas</th><th>Device</th><th>Typ</th><th>Message</th><th>Meta</th><th class="w-1"></th>
        </tr>
      </thead>
      <tbody> … rows … </tbody>
    </table>
  </div>
  <div class="card-footer d-flex align-items-center">
    <p class="m-0 text-secondary">Strona 2 z 4 · 316 błędów</p>
    <ul class="pagination m-0 ms-auto">
      <li class="page-item disabled"><a class="page-link" href="#">‹</a></li>
      <li class="page-item"><a class="page-link" href="#">1</a></li>
      <li class="page-item active"><a class="page-link" href="#">2</a></li>
      <li class="page-item"><a class="page-link" href="#">3</a></li>
      <li class="page-item"><a class="page-link" href="#">4</a></li>
      <li class="page-item"><a class="page-link" href="#">›</a></li>
    </ul>
  </div>
</div>
```

Numbered pagination only when total pages ≤ ~7; otherwise Prev/Next + "page X / Y" (the events.ts pattern) to avoid URL noise. Preserve all active filters in every `href`.

**Row anatomy** (columns above):
- **Czas** — `fmtDate(created_at)` (UTC, matches rest of app).
- **Device** — short `device_id` (`slice(0,12)` like `reports.ts:35`) in `.font-monospace`. When the device resolves to a user, render `username` under it in `.text-secondary`; when the device is in `banned_devices`, append `pill('BAN','err')` with the reason in the `title`. Links to `/admin/errors?q=<device_id>` (see §4.3).
- **Typ** — `pill(error_type)` per §3.3 color map; `'unknown'` additionally styled `text-muted` so it reads as "broken payload" not "real error".
- **Message** — full message up to ~160 chars with `.text-truncate` + `title`; **plus** an expand/collapse toggle when > 160 chars (or always, for consistency).
- **Meta** — pretty-printed JSON, collapsed by default, revealed by the row toggle (§4.4). Use `<pre class="m-0"><code class="font-monospace text-break">` — **never** raw truncated text in a `title` attribute.
- **Action col** — `btn-icon btn-sm btn-outline-secondary` chevron (`#icon-chevron-down`/`#icon-chevron-up`) toggling the detail row (Tabler `.collapse`).

**Row count:** 25/page (events uses 100 — errors are dense and warrant a smaller page size; 25 keeps the table scannable).

### 3.6 Rich empty state (primary state today — 0 rows)

Replace the bare `empty()` with the full Tabler `.empty` block, shown when the filtered table is empty:

```html
<div class="empty">
  <div class="empty-icon"><svg class="icon icon-2xl"><use href="#icon-alert-triangle"/></svg></div>
  <p class="empty-title">Brak błędów klienta</p>
  <p class="empty-subtitle text-secondary">Nieudane background-uploady trafiają tu z iOS (DLQ).
     Crashy raportuje Apple — App Store Connect → TestFlight → Crash Reports.</p>
  <div class="empty-action">
    <a class="btn btn-outline-secondary" href="/admin/errors">Wyczyść filtry</a>
  </div>
</div>
```

Variants: (a) **no errors at all** → subtitle above + no action button (or a "odśwież" button); (b) **filters yield nothing** → `empty-subtitle` "Brak wyników dla wybranych filtrów" + **"Wyczyść filtry"** action button. The distinction is what turns a dead 0-row page into a *stateful* one.

### 3.7 Row detail (collapsed meta) — Tabler collapse

```html
<tr>
  <td>…</td>
  <td>…</td>
  <td>…</td>
  <td class="text-truncate" style="max-width:20rem" title="…">upload failed: connection lost</td>
  <td><button class="btn btn-sm btn-icon btn-outline-secondary" type="button"
              data-bs-toggle="collapse" data-bs-target="#e_<id>">▸</button></td>
</tr>
<tr class="collapse" id="e_<id>">
  <td colspan="6" class="bg-surface-secondary">
    <pre class="m-0 font-monospace text-break">{
  "post_id": "…",
  "type": "video",
  "age_s": 3600,
  "retries": 3
}</pre>
  </td>
</tr>
```

`tabler.min.js` bundles Bootstrap → `data-bs-toggle="collapse"` works with zero custom JS. `id` uses the row `id` (nanoid — URL-safe) to avoid collisions. Full message + pretty meta live in the detail row; the collapsed cell shows truncated text with `title` as a hover hint only.

---

## 4) Interactions

1. **Period select** (`days` 7/14/30) — resets `page=1`, keeps `type`+`q`. Matches the events page's filter-persistence behavior (`localStorage` pattern from `events.ts:425-435` can be ported wholesale if desired).
2. **Type filter** (`type`) — `onchange=submit`. Facet list in §3.3 sets it as a preset link. Type values come from `SELECT DISTINCT error_type ORDER BY COUNT(*) DESC` (open set, client-controlled — do **not** hardcode the list in the `<select>`; render the top ~10 + current selection).
3. **Search (`q`)** — matches against `message`, `meta`, `device_id` via `LIKE '%…%'`. Case-insensitive. Used as **device drill-down**: clicking a device row sets `q` to that exact `device_id` (quoted via `LIKE` escaping — see §5) so the admin sees every error from that device across the window. Debounce is unnecessary — a GET form submit is the codebase convention.
4. **Pagination** — offset-based (`OFFSET (page-1)*25`), `page` param, filters preserved in all links. Numbers when pages ≤ ~7, else Prev/Next + counter (avoids 500-page URL spam). Top/bottom placement matches events.ts (§3.5 + mirror below the table).
5. **Row expand** — chevron toggles the `.collapse` detail row (§3.7). State lost on navigation — acceptable (keep it dumb).
6. **Empty states** — two variants (§3.6): genuinely empty vs. filter-no-match. The "Wyczyść filtry" action only appears when a filter is active.
7. **Refresh** — page-header "Odśwież" is a plain link to `/admin/errors` (current filters kept? No — plain link = clears; simpler and honest).

---

## 5) Implementation notes

### 5.1 Required migration (indexes)

`client_errors` has **no index on `created_at`** — the current query is a full scan + sort. Add (new migration, e.g. `0030_client_errors_indexes.sql`):

```sql
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_client_errors_type ON client_errors(error_type, created_at);
```

Serving: window filter (`created_at>=? ORDER BY created_at DESC LIMIT 25 OFFSET ?`), type-filtered pagination, and `GROUP BY error_type`/per-day series. D1 is single-file SQLite — these make the page stay snappy as the DLQ grows. **Keep the detail-row `id` reference** so a follow-up "delete one row" moderation action is possible (not in scope today).

### 5.2 Page rewrite shape (`pages/errors.ts`)

Keep the file's conventions: Hono handler, `db.prepare(...).all()`, `renderPage(c, 'Błędy', '/admin/errors', body)`, `esc()` on everything, `fmtDate`/`pill`/`bars`/`empty` from `ui.ts`. New parts:

- **Query params:** `days` (7/14/30, default 7, clamp to {7,14,30}), `type` (string, pass-through to `=` bind — safe), `q` (string, `LIKE` — **escape `%`, `_`, `\`** before binding), `page` (`Math.max(1, int)` like `events.ts:216`). Rebuild a `URLSearchParams` for pagination links exactly like `events.ts:237-253`.
- **Count query** mirroring the list filters (reuse the `eventsCountSql` pattern, `queries.ts:90-94`) → `total`/`totalPages`.
- **Enrichment query** (one pass): `LEFT JOIN users ON users.device_id=client_errors.device_id` for `username`, `LEFT JOIN banned_devices` for BAN flag. Avoid N+1.
- **Facet query:** `SELECT error_type, COUNT(*) n FROM client_errors WHERE created_at>=? GROUP BY error_type ORDER BY n DESC LIMIT 10`.
- **Series query:** Warsaw-day `GROUP BY` (reuse the exact `date(col/1000,'unixepoch','+2 hours')` idiom from `queries.ts:17` so the chart aligns with the app's story clock).
- **Filters feed the stat cards:** cards use the *window* only (`days`); the table uses window + type + q. Document this split in the code comment so future edits don't "helpfully" couple them.
- **New icons** to add to `ui.ts` ICONS sprite: `icon-search`, `icon-chevron-down`, `icon-chevron-up` (chevrons also needed for the collapse), `icon-refresh` (already exists, `ui.ts:114` — reuse for the header button). `alert-triangle` exists.

### 5.3 JSON API (`dashboard/api/errors.ts`)

Two options — recommend **delete** (nothing consumes it; the page is self-contained and the brief adds no JS refresh). If kept: make it share the same query builder so the `LIMIT 200`/days drift can't recur, and add pagination params. Current state (silent duplicate of the page) is the worst option.

### 5.4 Consistency

- Filter form: clone `users.ts:48-51` (select + auto-submit + "Wyczyść" link) and `events.ts:280-294` (multi-field GET form).
- Stat cards: prefer Tabler `.stat`/`.card-sm` markup (brief: stat cards) over the existing `cards()` helper for the 3-count + device row; keep `cards()` for other pages unless this spec gets adopted and `cards()` is upgraded in place.
- Pagination: `.pagination`/`.page-link` is the Tabler canonical and the brief's ask; the events page's btn-group Prev/Next remains valid for low-cardinality lists. Note this inconsistency explicitly if both styles coexist.
- Timestamps: UTC `fmtDate` — same as all other pages.
- Polish copy throughout (existing pages are pl-PL; don't mix in English strings).

### 5.5 Explicit non-goals

- No crash-report ingestion (Apple owns that channel) — keep the copy saying so.
- No client-side fetching / Chart.js / apexcharts — the no-build, CDN-only constraint and existing `bars()` make CSS bars the right call.
- No delete/ack actions on rows (single-owner DLQ, DB is source of truth; add later behind an explicit action column).
- No auto-refresh / polling — a manual "Odśwież" is enough for a 0-row-events monitor page.

### 5.6 Effort estimate

1 migration (indexes) + rewrite of `pages/errors.ts` (~120–150 lines) + 2 new icons + optional `api/errors.ts` cleanup. No new deps, no layout/`ui.ts` structural changes beyond the icon sprite. Test path: `wrangler dev` → `/admin/errors` with a few seeded `client_errors` rows (insert via `wrangler d1 execute`) to exercise filters/pagination/empty variants.
