# Admin · Posts (live) — Redesign Spec

Page under review: `GET /admin/posts` — `backend/src/admin/dashboard/pages/posts.ts`.
Scope: read-only design + implementation spec. **No source code is modified by this document.**

---

## 1. Reality check (what is wrong today)

Current page is a single plain table (`table table-vcenter card-table`) over the last 200 live posts. Problems:

| # | Problem | Where |
|---|---------|-------|
| 1 | **Read-only.** There are zero moderation actions, even though the page's whole purpose is content review. The `rejected` status pill implies moderation, but an admin cannot approve/reject from here. | `posts.ts` renders only `pill(...)` |
| 2 | **Silent 200-row cap.** `LIMIT 200` truncates without any indicator, count, or pagination. With TTL-bounded live posts this is survivable today, but the admin has no idea if the list is complete. | `posts.ts:15` |
| 3 | **No filters or search.** An admin cannot isolate `pending`, find a user's posts, or find a specific description. The sibling JSON API (`/admin/api/posts`) *does* support a `status` filter — the page ignores it. | `posts.ts:11`; `api/posts.ts:9-16` |
| 4 | **Status coloring is wrong.** Everything that is not `approved` renders as a red `err` pill. `pending` is a warning state, `rejected` is the only danger state. | `posts.ts:19` |
| 5 | **Description truncated at 50 chars** with no `title`/tooltip, no full-text, and no way to read the rest (unlike the events page, which opens a preview modal). | `posts.ts:17` |
| 6 | **Thumbnail is the last column, dead.** It is a static `<img>`, not clickable — the events page already has a reusable full-media modal (`ppMediaModal`) that this page could reuse. | `posts.ts:20`; `events.ts:75-81,300-306,353-354` |
| 7 | **No author avatar / device context.** `users.avatar_key` exists but is never joined. A "BAN" state (from `banned_devices`) is invisible. | `users.ts:36` shows the join pattern that is missing here |
| 8 | **`pending` is vestigial for live posts.** App posts are inserted as `approved` (`doSavePost` hardcodes `STATUS_APPROVED`), and migration `0006_dislike.sql` promoted every legacy `pending` row. So a "moderation queue" stat will be ~0 and a `pending` filter will be near-empty. The spec must not pretend a queue exists where the data doesn't. | `api/posts.ts:217-218`; `0006_dislike.sql:12` |
| 9 | **No metrics.** No total, no pending/approved/rejected split, no top-viewed, no engagement sums — the overview page already computes these patterns; posts page shows nothing. | compare `overview.ts:31-56` |
| 10 | **Shared counters not shown.** `shares_count`, `dislikes_count`, `rejection_reason`, `duration_ms`, `type`, `is_sponsored` are all in the DB and unused. | schema `posts` |
| 11 | **SQL duplicated** between page (`posts.ts:13-15`) and JSON API (`api/posts.ts:11-17`), diverging from the `queries.ts` pattern (`eventsSql`/`eventsCountSql`) used by events. Any filter/pagination work should be centralized there. | `queries.ts:77-94` |
| 12 | **Expired rows pollute totals.** Live posts have a 24 h TTL (`TTL_MS`); the API stops serving them but the admin table counts them. A "total live" must distinguish *active (24 h)* from *all time*. | `models.ts:151-152` |

Verdict: this is the weakest page in the dashboard. Events (`events.ts`), reports (`reports.ts`) and users (`users.ts`) all demonstrate the patterns this page should adopt. The redesign reuses those patterns wholesale.

---

## 2. Data inventory

### 2.1 Source tables (schema.sql + migrations)

**`posts`** (rows where `category = 'live'` — the app feed):

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | nanoid(24) |
| `user_id` | TEXT → `users.id` | author |
| `type` | TEXT | `photo` \| `video` (closed set `POST_TYPE_SET`) |
| `lat`, `lng` | REAL | geo pin |
| `description` | TEXT | user caption |
| `status` | TEXT | `pending` \| `approved` \| `rejected` (`POST_STATUSES`) |
| `media_key`, `thumb_key` | TEXT NULL | R2 objects, served at `/media/<key>` |
| `duration_ms` | INTEGER NULL | video length |
| `created_at` | INTEGER | ms epoch; server-authoritative for app posts |
| `likes_count`, `views_count`, `shares_count` | INTEGER | denormalized counters |
| `dislikes_count` | INTEGER | added in `0006` |
| `grid_cell_id`, `is_sponsored`, `link_url`, `external_id` | — | not shown on this page |
| `rejection_reason` | TEXT NULL | set by reject; cleared on approve |

**`users`** (join on `posts.user_id`):
`id`, `device_id`, `username`, `auth_provider` (`device`|`apple`|`google`), `role`, `avatar_key` (`0002`), `last_seen` (`0027`).

**`banned_devices`** — `device_id`, `reason`, `banned_at` (authors can be banned; shown as a flag per row).

**Engagement detail tables** (event tables; not denormalized per row): `views`, `likes`, `dislikes`, `shares` (`user_id`, `post_id`, `created_at`).

**`reports`** — `post_id`, `reporter_user_id`, `reason`, `status` (`open`|`resolved`|`dismissed`), `created_at`. An `open` report against a post is a moderation signal.

### 2.2 Available per-row queries (all cheap, indexed)

- Core list: `SELECT p.id, p.type, p.description, p.status, p.created_at, p.likes_count, p.views_count, p.shares_count, p.dislikes_count, p.media_key, p.thumb_key, p.rejection_reason, u.username, u.device_id, u.avatar_key FROM posts p JOIN users u ON u.id = p.user_id WHERE p.category='live' …`
- Author banned flag: `EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id = u.device_id)`
- Open reports per post: `(SELECT COUNT(*) FROM reports r WHERE r.post_id = p.id AND r.status='open')`
- Engagement ratio: `likes_count / views_count` (see `models.ts:135-138`)
- Relative age: `created_at` vs `Date.now()`

### 2.3 Header-card aggregates (one extra query batch, mirror `overview.ts:31-46`)

- `total` — `COUNT(*) WHERE category='live'`
- `active24h` — `COUNT(*) WHERE category='live' AND created_at >= now - 24 h` (what the app actually serves)
- `pending` / `approved` / `rejected` — `COUNT(*) … GROUP BY status` (pending will be ≈0, see reality check #8)
- `sum(views_count)`, `sum(likes_count)`, `sum(shares_count)` across `category='live'`
- Top viewed: `ORDER BY views_count DESC LIMIT 1`
- New in 24 h: same as `active24h`

### 2.4 Constraints

- Live posts are auto-approved on insert (`api/posts.ts:217-218`) → `pending` is a legacy/edge state; do not design the UI around a queue, design it around *audit + takedown*.
- No `avatar_key` URL helper in the admin — author avatars render as initials fallback (`span.avatar` + first letters of username) when `avatar_key` is null, mirroring Tabler.
- R2 media is served through `app.all('/media/*')` with `Cache-Control: public, max-age=3600` — fine for thumbnails and the preview modal.
- Pagination must be **offset-based** (matches `eventsSql`); live volume is bounded (24 h TTL) so offset is fine here.

---

## 3. Proposed page composition (Tabler 1.4)

Stack from top to bottom. All labels stay in Polish (admin-wide convention).

### 3.1 Page header

```html
<div class="page-header d-print-none">
  <div class="row align-items-center">
    <div class="col">
      <h1 class="page-title">Posty (live)</h1>
      <div class="page-subtitle text-secondary">Treści użytkowników z feeda na żywo (TTL 24 h)</div>
    </div>
    <div class="col-auto ms-auto d-print-none">
      <a href="/admin/posts" class="btn btn-outline-secondary" title="Odśwież">
        <svg class="icon"><use href="#icon-refresh"></use></svg>
      </a>
    </div>
  </div>
</div>
```

> Replace the bare `<h2 class="mb-3">` with this. The refresh link is a plain GET back to the same route — no JS needed.

### 3.2 Stat cards

Use the existing `cards()` helper (`ui.ts:75-83`) or hand-rolled `card card-sm` for colored icons. 5 cards on `row row-cards`:

| Label | Value | Color | SQL |
|---|---|---|---|
| Wszystkie posty | `total` | — | `COUNT(*) WHERE category='live'` |
| Aktywne (24 h) | `active24h` | success | `… AND created_at >= now-24h` |
| Zatwierdzone | `approved` | success | `GROUP BY status` |
| Odrzucone | `rejected` | danger | `GROUP BY status` |
| W kolejce | `pending` | warning | `GROUP BY status` (≈0 — legacy; keep for audit completeness) |

Optionally a 6th card: **Zasięg** = `sum(views_count)`. The 5-card layout stays consistent with overview.

### 3.3 Filter toolbar (single GET form — no JS)

```html
<form method="get" action="/admin/posts" class="row g-2 mb-3 align-items-end">
  <!-- segmented status filter (links, full width on mobile) -->
  <div class="col-12 col-md-4">
    <label class="form-label">Status</label>
    <nav class="nav nav-segmented w-100">
      <a class="nav-link ${status===''?'active':''}" href="/admin/posts">Wszystkie</a>
      <a class="nav-link ${status==='approved'?'active':''}" href="/admin/posts?status=approved">Zatwierdzone</a>
      <a class="nav-link ${status==='pending'?'active':''}"  href="/admin/posts?status=pending">W kolejce</a>
      <a class="nav-link ${status==='rejected'?'active':''}" href="/admin/posts?status=rejected">Odrzucone</a>
    </nav>
  </div>
  <!-- text search -->
  <div class="col-12 col-md-4">
    <label class="form-label">Szukaj</label>
    <div class="input-icon">
      <span class="input-icon-addon"><svg class="icon"><use href="#icon-search"></use></svg></span>
      <input type="search" name="q" class="form-control" value="${esc(q)}"
             placeholder="autor, opis, device" />
    </div>
  </div>
  <!-- type + reported + clear -->
  <div class="col-6 col-md-2">
    <label class="form-label">Typ</label>
    <select name="type" class="form-select" onchange="this.form.submit()">
      <option value="">Wszystkie</option>
      <option value="photo">Zdjęcie</option>
      <option value="video">Wideo</option>
    </select>
  </div>
  <div class="col-6 col-md-2">
    <label class="form-label">Raporty</label>
    <select name="reported" class="form-select" onchange="this.form.submit()">
      <option value="">Wszystkie</option>
      <option value="1">Z raportem</option>
    </select>
  </div>
  <div class="col-12 d-flex align-items-end">
    <a class="btn btn-outline-secondary" href="/admin/posts">Wyczyść</a>
  </div>
</form>
```

Notes:
- Segmented control = Tabler 1.4 `nav nav-segmented`; used as plain `<a>` links (GET), not `data-bs-toggle="tab"` — they just navigate.
- `onchange="this.form.submit()"` keeps parity with the events/users filter pattern (`events.ts:281-290`).
- Persist filters in `localStorage` exactly like `events.ts:425-436` (`evFilter:` → `ppFilter:`), since this page is reload-heavy (toast actions don't reload).

### 3.4 Result count + pagination (top & bottom)

Reuse the events pager (`events.ts:246-253`) but with the Tabler `.pagination` component, page size **50**:

```html
<div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
  <span class="text-secondary">${total} postów · strona ${page} / ${totalPages}</span>
  <ul class="pagination pagination-outline mb-0">
    <li class="page-item ${page<=1?'disabled':''}">
      <a class="page-link" href="${prevHref}">‹</a>
    </li>
    <li class="page-item active"><a class="page-link" href="#">${page}</a></li>
    <li class="page-item ${page>=totalPages?'disabled':''}">
      <a class="page-link" href="${nextHref}">›</a>
    </li>
  </ul>
</div>
```

Pager renders twice (above and below the table), like events. All pagination links carry the current filters.

### 3.5 Table (`.card` + `table table-vcenter card-table`)

```html
<div class="card">
  <div class="table-responsive">
    <table class="table table-vcenter card-table">
      <thead>
        <tr>
          <th>Media</th>
          <th>Autor</th>
          <th>Opis</th>
          <th>Czas</th>
          <th>Engagement</th>
          <th>Status</th>
          <th class="text-end">Akcje</th>
        </tr>
      </thead>
      <tbody>…</tbody>
    </table>
  </div>
</div>
```

**Column recipes:**

- **Media** — clickable thumb opening the full preview modal (reuse events `eventThumb`/`ppMediaModal`):
  ```html
  <a href="javascript:void(0)" onclick="ppMediaOpen('/media/${esc(fullKey)}');return false;">
    <span class="avatar avatar-sm rounded"><img src="/media/${esc(thumb||full)}" loading="lazy"
         onerror="this.closest('.avatar').classList.add('bg-secondary-lt')" /></span>
  </a>
  ```
  Fallback `—` when no key. First column (matches events, and Tabler tables).

- **Autor** — Tabler avatar with initials fallback + two lines:
  ```html
  <div class="d-flex align-items-center">
    <span class="avatar avatar-sm me-2 ${avatar? '' : 'bg-primary-lt'}">
      ${avatar? `<img src="/media/${esc(avatar)}" />` : esc(initials)}
    </span>
    <div>
      <div class="fw-semibold">${esc(username||device_id)}</div>
      <div class="text-muted fs-6 font-monospace">
        ${esc(device_id)}${banned ? ' · ' + pill('BAN','err') : ''}
      </div>
    </div>
  </div>
  ```

- **Opis** — full text with `title` tooltip, type badge, and report badge:
  ```html
  <div title="${esc(fullDescription)}">
    ${esc(truncate(description, 80))}
    <span class="badge bg-secondary-lt text-secondary ms-1">${type}</span>
    ${openReports ? `<span class="badge bg-warning-lt text-warning ms-1">raport ×${openReports}</span>` : ''}
  </div>
  ```
  Truncation server-side (80 chars) with the full text in `title` — better than the current silent 50-char slice. `rejection_reason` shows under the text in `text-danger fs-6` when present.

- **Czas** — relative (copy `relAgo` from `users.ts:11-20`; hoist to `ui.ts` so both pages share it) + `fmtDate` as `title`:
  ```html
  <span title="${fmtDate(created_at)}">${relAgo(created_at)}</span>
  ```

- **Engagement** — three icon badges (icons must be added to the `ICONS` sprite in `ui.ts`):
  ```html
  <div class="d-flex gap-1">
    <span class="badge bg-secondary-lt text-secondary"><svg class="icon"><use href="#icon-heart"/></svg> ${likes}</span>
    <span class="badge bg-secondary-lt text-secondary"><svg class="icon"><use href="#icon-eye"/></svg> ${views}</span>
    <span class="badge bg-secondary-lt text-secondary"><svg class="icon"><use href="#icon-share"/></svg> ${shares}</span>
  </div>
  ```
  Optional 4th badge for dislikes. Sorting by these is nice-to-have; the two sort links "Top" / "Najnowsze" on the column header are out of scope.

- **Status** — correct coloring:
  ```html
  ${approved → pill('approved','ok')} ${pending → pill('pending','warn')} ${rejected → pill('rejected','err')}
  ```

- **Akcje** — Tabler `.dropdown`, right-aligned:
  ```html
  <div class="dropdown text-end">
    <button class="btn btn-sm btn-icon btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
      <svg class="icon"><use href="#icon-dots"/></svg>
    </button>
    <div class="dropdown-menu dropdown-menu-end">
      <a class="dropdown-item" href="javascript:void(0)" onclick="ppMediaOpen('…')">Podgląd</a>
      ${status!=='approved' ? '<a class="dropdown-item text-success" href="javascript:void(0)" onclick="ppPostSet(\''+id+'\',\'approved\')">Zatwierdź</a>' : ''}
      ${status!=='rejected' ? '<a class="dropdown-item text-danger" href="javascript:void(0)" onclick="ppPostReject(\''+id+'\')">Odrzuć…</a>' : ''}
      <a class="dropdown-item text-danger" href="javascript:void(0)" onclick="ppPostBan(\''+id+'\',\''+jsStr(device_id)+'\')">Banuj urządzenie</a>
    </div>
  </div>
  ```

### 3.6 Empty state

Filter-aware, Tabler `.empty` with an icon, per-status copy, and a clear-filters action:

```html
<tr><td colspan="7">
  <div class="empty">
    <div class="empty-icon"><svg class="icon"><use href="#icon-photo"></use></svg></div>
    <p class="empty-title">${hasFilter ? 'Brak wyników dla filtrów' : 'Brak postów (live)'}</p>
    <p class="empty-subtitle text-secondary">${pending-filter ? 'Posty live są zatwierdzane automatycznie — kolejka jest zwykle pusta.' : 'Zmniejsz zakres filtrów lub sprawdź później.'}</p>
    ${hasFilter ? '<div class="empty-action"><a class="btn btn-primary" href="/admin/posts">Wyczyść filtry</a></div>' : ''}
  </div>
</td></tr>
```

### 3.7 Reject-reason modal + toast zone (bottom of body)

Mirror the `ppGeoModal` pattern from `events.ts:329-344`:

```html
<div class="modal fade" id="ppRejectModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header"><h3 class="modal-title">Odrzuć post</h3></div>
      <div class="modal-body">
        <div class="mb-3"><label class="form-label">Powód</label>
          <textarea id="ppRejectReason" class="form-control" rows="2" placeholder="np. spam, obraźliwe treści"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" onclick="ppRejectClose()">Anuluj</button>
        <button type="button" class="btn btn-danger" onclick="ppRejectSave()">Odrzuć</button>
      </div>
    </div>
  </div>
</div>

<div class="toast-container position-fixed bottom-0 end-0 p-3" id="ppToastZone"></div>
```

Toast factory (Tabler/Bootstrap 5, auto-hide):

```js
window.ppToast = function(msg, ok){
  var zone = document.getElementById('ppToastZone');
  var el = document.createElement('div');
  el.className = 'toast align-items-center ' + (ok ? 'text-bg-success' : 'text-bg-danger');
  el.setAttribute('role','alert'); el.setAttribute('aria-live','assertive'); el.setAttribute('aria-atomic','true');
  el.innerHTML = '<div class="d-flex"><div class="toast-body">'+msg+'</div>' +
                 '<button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button></div>';
  zone.appendChild(el);
  (window.tabler||window.bootstrap).Toast.getOrCreateInstance(el).show();
  setTimeout(function(){ el.remove(); }, 3000);
};
```

---

## 4. Interactions (moderation actions)

### 4.1 API surface — session-gated POST routes (new)

The existing `/posts/:id/approve|reject` in `src/api/admin.ts` are **bearer-token endpoints** (`ADMIN_SECRET`), not the cookie session the dashboard uses. Follow the reports/events pattern and add cookie-session routes in `posts.ts`:

| Route | Body | SQL | Success return |
|---|---|---|---|
| `POST /admin/posts/:id/status` | `status=approved\|pending\|rejected` | `UPDATE posts SET status=?, rejection_reason=NULL WHERE id=?` (approve/pending) / `UPDATE posts SET status=?, rejection_reason=? WHERE id=?` (reject) | `{ ok:true, status }` |
| `POST /admin/posts/:id/ban` | `{ device_id }` | `INSERT INTO banned_devices … ON CONFLICT(device_id) DO UPDATE …` (reuse `reports.ts:58-75` incl. author lookup) | `{ ok:true }` |

- Guard with `requireSession` exactly like `events.ts:442-443` / `reports.ts:46-47`.
- **Reject should carry a reason** (writes `rejection_reason`); **approve clears it** — this matches `src/api/admin.ts:101-127` semantics, keep them identical.
- Never re-approve without clearing the reason; `src/api/admin.ts:14` notes rejected external_ids are skipped by seed — irrelevant for `live` but keep the same code path.
- CSRF: existing pages use plain POST forms without tokens (accepted convention in this admin); keep consistent, or note as a follow-up.

### 4.2 Client behavior (no page reloads)

```
ppPostSet(id, status)   → fetch POST /admin/posts/:id/status (FormData, like ppUpdate)
ppPostReject(id)        → open #ppRejectModal, stash id
ppRejectSave()          → fetch POST …/status with {status:'rejected', reason:…}
ppPostBan(id, device)   → confirm() → fetch POST …/ban
```

All three use `fetch` + `Promise` (exact pattern `events.ts:404-424`), then:

1. **Success** → `ppToast('Zapisano.', true)` (reject/ban → `ppToast('Odrzucono.', false)` style / danger tone).
2. **Row update** — swap the status pill + dropdown state in place via `data-id` selectors (`.pp-status-cell[data-id=…]`), or **remove the row** when the current filter no longer matches the new status (e.g. you're on "W kolejce" and approved the post) and decrement the matching header card.
3. **Failure** → error toast (or `ppAlertOpen` modal like events) with a retry hint; never reload the page on failure.
4. Reject modal validates a non-empty reason (small red `.form-hint is-invalid` if blank).

### 4.3 Moderation keyboard/scan flow

Because `pending` is ≈0, the realistic daily flow is: **Raporty → Posty → reject/ban**. The `reported=1` filter surfaces open-report posts first (they should sort to the top: `ORDER BY (open_reports DESC), created_at DESC`). The dropdown is reachable with 2 clicks; consider `tabindex`/arrow-key nav via the native Bootstrap dropdown.

---

## 5. Implementation notes

1. **Centralize queries** in `backend/src/admin/queries.ts` (mirror `eventsSql`/`eventsCountSql`):
   - `postsSql(filter)` / `postsCountSql(filter)` with optional `status`, `type`, `q` (LIKE on `description`, `username`, `device_id`), `reported` (`EXISTS open report`), `limit`/`offset`.
   - `postStatusCounts(db)` for the 5 header numbers + `active24h`.
   - Delete the now-redundant SQL in `posts.ts` **and** `api/posts.ts` (the JSON API can call the same builders, preserving its `status` filter).
2. **Page size 50**, offset pagination; carry filters + `page` through all links; keep `LIMIT`+`OFFSET` in the builder only.
3. **Reuse existing helpers** — `cards()`, `pill()`, `empty()`, `esc()`, `fmtDate()` from `ui.ts`. Hoist `relAgo()` from `users.ts:11-20` into `ui.ts` and use it on both pages.
4. **Reuse the events preview modal** — the `ppMediaModal` + `ppMediaOpen` JS block (`events.ts:348-366`) is per-page inline; copy it into `posts.ts` (or extract to a shared snippet). Media preview should use `media_key` (full) with `thumb_key` as the loaded src, falling back to `media_key` when no thumb — exactly `eventThumb`'s logic.
5. **Icon sprite** — add `#icon-heart`, `#icon-eye`, `#icon-share`, `#icon-search`, `#icon-dots` (and `#icon-ban`/`#icon-check` for the dropdown) to `ICONS` in `ui.ts`. This page's icons come from the same sprite; no CDN font is loaded.
6. **Escaping** — all dynamic values through `esc()`; for values embedded in `onclick` strings use the `jsStr()` helper (`events.ts:25-34`), including the author `device_id` passed to `ppPostBan`.
7. **Auto-approve reality** — do not build an "empty moderation" work queue. Label the `pending` card and filter honestly ("W kolejce", copy explains auto-approval) so the admin isn't chasing a phantom backlog. The primary job of this page is *audit + takedown + ban*.
8. **Rejected reason flow** — show `rejection_reason` inline (red `fs-6`) and in the preview modal; approve clears it. This closes the loop with the reports page which currently writes `rejection_reason='raport'` (`reports.ts:52`).
9. **Filter persistence** — adopt the events `localStorage` pattern (`evFilter:` → `ppFilter:`) so filters survive the toast-driven in-page updates and the full reload on refresh.
10. **Sorting** (optional, phase 2): `ORDER BY` toggle for `views_count` / `created_at`; the TTL means both orders are cheap. Keep phase 1 default `created_at DESC`.
11. **Testing** — no admin test harness exists; verify manually against the seed/DEV D1: (a) each filter+search combo, (b) pagination with >50 rows, (c) approve/reject/ban round-trips with toast + in-place pill swap, (d) row removal when the current filter excludes the new status, (e) XSS probe in description/username (escaped output). Typecheck with the backend's existing `tsc`/`wrangler` scripts (`backend/package.json`).

---

### Appendix A — file touch-list

| File | Change |
|---|---|
| `backend/src/admin/dashboard/pages/posts.ts` | Rebuild page: header, cards, filters, table, pagination, dropdowns, modal, toast JS; add POST routes (`/posts/:id/status`, `/posts/:id/ban`) |
| `backend/src/admin/queries.ts` | Add `postsSql`, `postsCountSql`, `postStatusCounts` |
| `backend/src/admin/dashboard/api/posts.ts` | Refactor to call the shared builders |
| `backend/src/admin/ui.ts` | Hoist `relAgo`; add `heart`/`eye`/`share`/`search`/`dots`/`check`/`ban` icons to `ICONS` |
| (no change) `users.ts`, `reports.ts`, `events.ts` | Patterns reused, not modified |
