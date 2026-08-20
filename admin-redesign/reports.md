# Redesign: Admin „Raporty" (reports) — spec

Source reviewed: `backend/src/admin/dashboard/pages/reports.ts` (86 lines), `migrations/0022_reports.sql`, `migrations/0007_ban.sql`, `backend/src/api/reports.ts`, `backend/src/admin/ui.ts`, page conventions in `users.ts` / `events.ts` / `stats.ts`, `backend/src/admin/queries.ts`, `backend/src/admin/dashboard/api/posts.ts`.

---

## 1. Reality check — what the current page actually is

**Structure.** One SSR page (`GET /admin/reports`) + three POST routes (`/reports/:id/reject`, `/reports/:id/ban`, `/reports/:id/resolve`). SSR string concatenation, Tabler 1.4 via CDN, no build step. Uses helpers `esc`, `fmtDate`, `pill`, `empty` from `admin/ui.ts` and `renderPage` from `pages/shared.ts`.

**What renders.** One flat table (9 columns): Media thumb (24px avatar), Post id (12/24 chars), Zgłaszający, Autor, Device autora, Powód, Czas (UTC), Status, Akcje. No filters, no search, no pagination, `LIMIT 200`, ordered `(status='open') DESC, created_at DESC`. Empty state = `empty()` inside a colspan row.

### Criticisms (bugs, gaps, UX)

1. **Actions are destructive-adjacent but presented as unstyled full-page POSTs.** Three inline `<form>`s per row; clicking submits and hard-redirects to `/admin/reports`. No confirmation for ban, no feedback, double-submit possible (no in-flight guard), filter/search state lost on every reload. "Banuj urządzenie" and "Odrzuć post" are visually identical (`btn btn-sm btn-danger` ×2) — one click difference from resolve.
2. **Moderation outcome is erased.** All three actions write `status='resolved'`. The schema comment documents `'open' | 'resolved' | 'dismissed'`, but code never writes `dismissed` and there is no way to tell a dismissed vs rejected vs banned report apart afterwards. The audit trail the moderation workflow needs does not exist.
3. **`ban` leaves the offending post live.** The route only inserts the author's `device_id` into `banned_devices`; it never rejects/removes the post. The reported content stays approved and visible. (The `reject` route, by contrast, never bans.)
4. **`reject` hardcodes `rejection_reason='raport'`**, destroying the actual reason the user gave (spam / przemoc / …). The app's "Powód: …" UI (`ios/…/MyContentView.swift`) will show "raport" for every rejected post.
5. **No way to actually see the media.** The thumb is a plain `<span class="avatar">`, not clickable. For a moderation queue the primary artifact — the image/video being reported — is not viewable from the page. (`events.ts` already has a `ppMediaOpen` full-media modal pattern that this page should reuse.)
6. **Hard cap with no pagination.** Beyond 200 reports the *earliest open* ones silently disappear from the list; with open-first ordering the oldest (and most urgent to review) items fall off exactly when the queue is biggest.
7. **No metrics.** No open-queue count, no resolved/rejected totals, no per-reason or per-day breakdown. The overview dashboard even surfaces a generic "Raporty" nav item, but there is nothing quantitative on the page.
8. **No context per row.** Author already banned? Post already rejected? Same reporter's history? Same post reported by others? All invisible. A moderator must jump to other pages.
9. **Reason taxonomy is opaque.** The table prints the raw enum (`nienawistna_tresc`, `nieodpowiednie`) with no label mapping; rows are visually uniform regardless of severity.
10. **Broken-thumb noise.** Expired/deleted posts → `/media/{key}` 404s render as broken images (`onerror` fallback used in `events.ts` is absent here).
11. **Minor:** fixed "Akcje" column even when zero open rows; `fmtDate` shows UTC but the rest of the app reasons in Europe/Warsaw; no CSRF token on POST forms (site-wide gap, see §5); the iOS app currently only ever sends reason `"inne"` (`StoryFullScreenView.swift:186`) so the queue is expected to be low-volume — worth designing for the *review* workflow, not for bulk ops.

**Verdict.** Usable minimum, but it is a *stub of a moderation queue*, not a queue: no review affordance (media), no triage (filters/search), no outcome tracking, no feedback, no growth headroom (pagination).

---

## 2. Data inventory

### 2.1 `reports` table (`migrations/0022_reports.sql`)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `nanoid(24)` |
| `post_id` | TEXT NOT NULL → `posts(id)` | |
| `reporter_user_id` | TEXT NOT NULL → `users(id)` | |
| `reason` | TEXT NOT NULL | Allowed set (`api/reports.ts`): `spam`, `przemoc`, `nienawistna_tresc`, `nieodpowiednie`, `inne` |
| `status` | TEXT NOT NULL DEFAULT `'open'` | Comment: `'open' \| 'resolved' \| 'dismissed'`. **In practice only `'open'` and `'resolved'` are ever written.** |
| `created_at` | INTEGER NOT NULL | ms epoch |

Indexes: `idx_reports_status(status, created_at)`, `idx_reports_post(post_id)`. No `resolved_at` / action column. No FK enforcement in D1.

### 2.2 Join targets

- `posts`: `id`, `user_id` (author), `type`, `status` (`approved`/`rejected`/`pending`), `media_key`, `thumb_key`, `description`, `category`, `rejection_reason`, `created_at`, `expires_at`.
- `users` (reporter **and** author): `username`, `device_id`, `avatar_key`, `created_at`, `last_seen`, `auth_provider`. Display name convention everywhere: `COALESCE(NULLIF(username,''), device_id)`.
- `banned_devices` (`0007_ban.sql`): `device_id` PK, `reason`, `banned_at` — join on **author** device to flag already-banned rows.

### 2.3 Derived / metric data (all currently unused)

- Open queue: `SELECT COUNT(*) FROM reports WHERE status='open'`.
- By status: `GROUP BY status`.
- By reason: `GROUP BY reason` (label map needed, §5).
- Per-day series: `date(created_at/1000,'unixepoch','+2 hours')` — same pattern as `daySeries()` in `queries.ts` (stats.ts uses it).
- Post outcome context: post status pill + `rejection_reason`; author banned flag via `EXISTS(SELECT 1 FROM banned_devices …)`.
- Media URLs: `/media/{thumb_key}` (thumb), `/media/{media_key}` (full).

### 2.4 Known data-shape facts to design around

- Reports are **low-volume** (iOS only reports `"inne"` today), but rows are *read-mostly* history that grows forever → pagination + outcome filter matter more than bulk tools.
- A reported post can be deleted/expired → `thumb_key` may 404 → `onerror` fallback required.
- One open report per (post, reporter) enforced at insert (`api/reports.ts` dedupe) — a post can still have N open reports from N reporters; useful signal ("Zgłoszono przez N osób") that is currently invisible.
- `device_id` is the true identity (username is optional) → show both, as everywhere else in admin.

---

## 3. Proposed page composition (Tabler 1.4)

Ordered top-to-bottom. All snippets assume the existing `renderPage` wrapper and `admin/ui.ts` helpers; no new framework.

### 3.1 Page header

Use Tabler `.page-header` with an inline open-queue count badge (mirrors `events.ts` "Moderacja" pattern — the title can flip contextually).

```html
<div class="page-header d-print-none">
  <div class="container-xl">
    <div class="row align-items-center">
      <div class="col">
        <div class="page-pretitle">PanPeryskop Admin</div>
        <h2 class="page-title">Raporty treści
          <span class="badge bg-warning-lt text-warning ms-2">X otwartych</span>
        </h2>
        <div class="text-secondary">Moderacja zgłoszeń użytkowników — przegląd, odrzucanie postów, banowanie urządzeń.</div>
      </div>
    </div>
  </div>
</div>
```

### 3.2 Stat cards (queue health)

One `row row-cards` row of Tabler `card card-sm` (reuse the existing `cards()` helper in `admin/ui.ts` or write explicit cards for iconed variants):

| Card | Value | Color | Source SQL |
|---|---|---|---|
| Otwarte | `COUNT(*) WHERE status='open'` | warning | `reports` |
| Rozwiązane | `COUNT(*) WHERE status='resolved'` | success | `reports` |
| Odrzucone posty | post count `status='rejected'` (or new `'rejected'` report status, §5) | danger | `posts` / `reports` |
| Zbanowane urządzenia | `COUNT(*) FROM banned_devices` | muted | `banned_devices` |

Optionally a **second** `cards()` row for the reason breakdown (one card per reason, `spam`/`przemoc`/`nienawistna_tresc`/`nieodpowiednie`/`inne`) — cheap, answers "what is the queue made of". Volume is low enough that 5 small cards fit.

### 3.3 Filter bar (GET form, like `users.ts`)

```html
<form method="get" action="/admin/reports" class="row g-2 mb-3">
  <!-- Status: Tabler segmented control -->
  <div class="col-12 col-md-3">
    <label class="form-label">Status</label>
    <div class="btn-group btn-group-segmented" role="group">
      <a class="btn btn-sm {active}" href="/admin/reports">Wszystkie</a>
      <a class="btn btn-sm {active}" href="/admin/reports?status=open">Otwarte</a>
      <a class="btn btn-sm {active}" href="/admin/reports?status=resolved">Rozwiązane</a>
      <a class="btn btn-sm {active}" href="/admin/reports?status=rejected">Odrzucone</a>
      <a class="btn btn-sm {active}" href="/admin/reports?status=banned">Zbanowane</a>
    </div>
  </div>
  <!-- Reason -->
  <div class="col-6 col-md-3">
    <label class="form-label">Powód</label>
    <select name="reason" class="form-select" onchange="this.form.submit()">…</select>
  </div>
  <!-- Text search -->
  <div class="col-6 col-md-4">
    <label class="form-label">Szukaj</label>
    <input name="q" class="form-control" placeholder="username, device_id, post id, powód…" value="{q}">
  </div>
  <div class="col-6 col-md-2 d-flex align-items-end gap-2">
    <button class="btn btn-primary" type="submit">Szukaj</button>
    <a class="btn btn-outline-secondary" href="/admin/reports">Wyczyść</a>
  </div>
</form>
```

State-preserving notes: segmented links must carry the other active params (reason, q, page); the select and search box submit the whole form; `Wyczyść` drops everything. Follow the exact URL-building + `qstr` approach from `events.ts:237-253`.

### 3.4 Report table

`.card` > `.table-responsive` > `table.table.table-vcenter.card-table`, no-wrap on key cells, `avatar avatar-sm rounded` for images (pattern exists in `posts.ts`).

Columns:

1. **Media** — clickable thumb opening the full-media modal (reuse `ppMediaOpen` from `events.ts:75-81` incl. `onerror` fallback → `bg-secondary-lt`). Full image = `/media/{media_key}`, fallback thumb = `/media/{thumb_key}`.
2. **Post** — `<span class="font-monospace">{post_id.slice(0,12)}</span>` + post status pill (approved/pending/rejected) + optional description snippet + **"Zgłoszony ×N"** badge when the same post has >1 report (drives priority).
3. **Autor** — Tabler avatar (`avatar avatar-xs rounded`) with `avatar_key` (fallback initials/`text-avatar`) + username + `<span class="text-muted font-monospace">{device_id}</span>`; if already banned → red `pill('BAN','err')` inline.
4. **Zgłaszający** — reporter username/device (same display logic).
5. **Powód** — reason badge, colored per reason (§5 label map): e.g. `przemoc`/`nienawistna_tresc` → `bg-danger-lt text-danger`, `spam` → `bg-warning-lt text-warning`, `nieodpowiednie`/`inne` → `bg-secondary-lt text-secondary`.
6. **Czas** — `fmtDate(created_at)` + relative time (`relAgo` — copy from `users.ts:11-20`, e.g. "3 h temu").
7. **Status** — pill: `open`→`bg-warning-lt text-warning`, `resolved`→`bg-success-lt text-success`, `rejected`→`bg-danger-lt text-danger`, `banned`→`bg-danger-lt text-danger` (see §5 for the status model change that makes 3-4 real).
8. **Akcje** — `.dropdown` (§3.5). Empty string for non-open rows (drop the column-header only when `status=open` filter is not active? No — keep the column, it renders nothing for closed rows).

### 3.5 Row actions — Tabler `.dropdown` (kebab)

Replace the three stacked forms with one dropdown per open row. Tabler markup:

```html
<div class="dropdown">
  <button class="btn btn-action dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">⋯</button>
  <div class="dropdown-menu dropdown-menu-end">
    <a class="dropdown-item" href="#" onclick="ppModerate('{id}','reject', this)">Odrzuć post</a>
    <a class="dropdown-item" href="#" onclick="ppModerate('{id}','ban', this)">Zbanuj autora</a>
    <div class="dropdown-divider"></div>
    <a class="dropdown-item" href="#" onclick="ppModerate('{id}','resolve', this)">Rozwiąż (bez zmian)</a>
  </div>
</div>
```

- `btn-action` + kebab = compact, doesn't blow up the row.
- **Ban gets a confirm step** (§4) since it is irreversible per-device.
- Closed rows render `—` (or nothing) in the actions cell; the dropdown only exists for `status='open'`.

### 3.6 Pagination

Tabler `.pagination` (see preview `/pagination.html`), same totals + prev/next logic as `events.ts` (`eventsCountSql` + `totalPages` pattern at `events.ts:222-253`), carrying all active filter params. `PAGE_SIZE = 25` (moderation rows are dense). Render pager **above and below** the table, exactly like `events.ts`.

```html
<nav><ul class="pagination">
  <li class="page-item {disabled}"><a class="page-link" href="{prev}">‹ Poprzednia</a></li>
  {page links, 1..N, .page-link active}
  <li class="page-item {disabled}"><a class="page-link" href="{next}">Następna ›</a></li>
</ul></nav>
<div class="text-secondary">N zgłoszeń · strona X / Y</div>
```

### 3.7 Empty state

Tabler `.empty` block (preview `/empty.html`) — not the bare `empty()` helper — with an icon, a title, an explanatory line, and a "Wyczyść filtry" action when filters are active:

```html
<div class="empty">
  <div class="empty-icon"><svg class="icon">…flag icon…</svg></div>
  <p class="empty-title">Brak raportów</p>
  <p class="empty-subtitle text-secondary">Nic nie pasuje do tego filtra. Zmień kryteria lub wyczyść filtry.</p>
  <div class="empty-action"><a class="btn btn-outline-secondary" href="/admin/reports">Wyczyść filtry</a></div>
</div>
```

(`reports.ts` currently passes the header text through `esc()` and never shows a CTA.)

### 3.8 Supporting components

- **Full-media modal** — copy the `ppMediaModal` + `ppMediaOpen` JS block from `events.ts:300-365` verbatim (it resolves `window.tabler` at call time; Tabler JS loads at the end of `layout()`).
- **Toast** — Tabler toast container + `#toast-simple` markup, wired to a small `ppToast(msg, kind)` helper (full details §4). One-time inline script in the page body, same pattern the rest of the admin already uses for page-local JS.

---

## 4. Interactions — moderation + toasts

### 4.1 Action semantics (fix the data model first, §5)

| Action | Route | Effect | New report status |
|---|---|---|---|
| Odrzuć post | `POST /admin/reports/:id/reject` | `posts.status='rejected'`, `rejection_reason = <label of report.reason>` | `'rejected'` |
| Zbanuj autora | `POST /admin/reports/:id/ban` | insert/upsert `banned_devices(device_id=author)` **and reject the post** (fixes gap #3) | `'banned'` |
| Rozwiąż | `POST /admin/reports/:id/resolve` | no content change | `'resolved'` |

### 4.2 Submit flow (fetch, no reload) — kills gaps #1, #6

Replace full-page POST+redirect with a tiny `fetch`-based submit per row. Keeps filters/search/pagination intact, avoids double-submit, enables toasts.

```js
window.ppModerate = function (id, action, el) {
  el.classList.add('disabled');                       // in-flight guard
  fetch('/admin/reports/' + encodeURIComponent(id) + '/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),                         // CSRF token slot, §5
  }).then(function (r) { if (!r.ok) return Promise.reject(r.status); return r.json(); })
    .then(function (resp) {
      ppToast(actionLabel(resp.action), 'success');
      // remove the row from the DOM, decrement the open-queue card + header badge
      var tr = el.closest('tr'); if (tr) tr.remove();
    })
    .catch(function () { ppToast('Nie udało się wykonać akcji.', 'danger'); el.classList.remove('disabled'); });
};
```

### 4.3 Ban confirm

Ban is irreversible (per-device). Open a Tabler `.modal` (copy the small `ppAlertModal`-style confirm or a dedicated confirm modal from `events.ts`) that shows the target device id and requires explicit "Zbanuj" before the fetch fires. No confirm for resolve; lightweight confirm (or none) for reject since it is reversible via `/admin/posts` / the events moderator.

### 4.4 Toast helper (reusable)

Tabler 1.4 has `toast` markup + JS (`/toasts.html`). Add one-time inline JS in the reports page body (mirrors how `events.ts` self-contains its JS). Optional: promote it into `ui.ts` later.

```html
<div class="toast-container position-fixed bottom-0 end-0 p-3" id="ppToastWrap" style="z-index:1055"></div>
<script>
  window.ppToast = function (msg, kind) {
    var wrap = document.getElementById('ppToastWrap');
    var el = document.createElement('div');
    el.className = 'toast align-items-center text-bg-' + (kind === 'danger' ? 'danger' : 'success') + ' border-0';
    el.innerHTML = '<div class="d-flex"><div class="toast-body">' + msg + '</div>' +
      '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
    wrap.appendChild(el);
    var B = window.tabler || window.bootstrap;
    var t = B && B.Toast ? B.Toast.getOrCreateInstance(el) : null;
    if (t) t.show();
    setTimeout(function () { if (t) t.hide(); }, 3500);
  };
</script>
```

Message copy (Polish, past-tense outcome, matches app tone): „Post odrzucony.", „Urządzenie autora zbanowane.", „Raport rozwiązany."

### 4.5 Filter interaction details

- All filter state lives in the URL (GET) — shareable, back-button safe.
- Status segmented links preserve `reason`/`q`/`page`; changing a filter resets `page` to 1.
- Text search `q` matches: reporter `username`/`device_id`, author `username`/`device_id`, `post_id`, `reason` label — a single `LIKE '%…%'` over `COALESCE` fields is fine at this volume.
- Autosubmit selects (`onchange="this.form.submit()"`) per `users.ts`/`events.ts` convention.

### 4.6 Open-row optics

- Sort stays open-first (`ORDER BY (status='open') DESC, created_at DESC`) → the queue is always on top.
- Rows whose author is already banned get `class="table-danger"` (Tabler `table-danger`) so a moderator sees the post is still live under a banned account.
- The header badge + „Otwarte" card tick down live on every successful action (§4.2 DOM removal).

---

## 5. Implementation notes

### 5.1 Schema / data-model fix (prerequisite for the whole design)

The current `status` column cannot represent outcomes (only `'open'`/`'resolved'` are written; the schema comment's `'dismissed'` is never used). Recommended migration (`0022_reports.sql` is already shipped — add a new one):

- Extend status values to `'open' | 'resolved' | 'rejected' | 'banned'` (backwards-compatible: existing rows stay `'open'`/`'resolved'`; old resolved rows remain valid, just unclassified).
- Add `resolved_at INTEGER` and `resolved_by TEXT` (admin username, nullable) for the audit trail.
- Add `idx_reports_created_at` on `(created_at)` for the plain chronology sort used once filters apply.

SQL is enough; no ORM. `api/reports.ts` insert is untouched.

### 5.2 Query plan (single page handler, mirror `events.ts`)

```
SELECT r.id, r.post_id, r.reason, r.status, r.created_at,
       COALESCE(NULLIF(u.username,''), u.device_id) AS reporter, u.device_id AS reporter_device,
       COALESCE(NULLIF(a.username,''), a.device_id) AS author, a.device_id AS author_device, a.avatar_key AS author_avatar,
       p.thumb_key, p.media_key, p.status AS post_status, p.rejection_reason, p.description,
       EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id = a.device_id) AS author_banned,
       (SELECT COUNT(*) FROM reports r2 WHERE r2.post_id = r.post_id AND r2.status='open') AS open_for_post
FROM reports r
JOIN users u ON u.id = r.reporter_user_id
JOIN posts p ON p.id = r.post_id
JOIN users a ON a.id = p.user_id
WHERE 1=1 {+ status / reason / q / …}
ORDER BY (r.status='open') DESC, r.created_at DESC
LIMIT ? OFFSET ?
```

Plus a `SELECT COUNT(*)` twin for pagination (the `eventsCountSql` pattern). Use a `LEFT JOIN` if you want to tolerate missing posts instead of dropping the report — but `INNER` matches current behavior; document the choice.

### 5.3 Reason label map (single source of truth)

```ts
const REASON_LABELS: Record<string, { label: string; badge: string }> = {
  spam:               { label: 'Spam',              badge: 'bg-warning-lt text-warning' },
  przemoc:            { label: 'Przemoc',           badge: 'bg-danger-lt text-danger' },
  nienawistna_tresc:  { label: 'Nienawistna treść', badge: 'bg-danger-lt text-danger' },
  nieodpowiednie:     { label: 'Nieodpowiednie',    badge: 'bg-secondary-lt text-secondary' },
  inne:               { label: 'Inne',              badge: 'bg-secondary-lt text-secondary' },
};
```

Also the `reject` action must store the **label**, not `'raport'` (fixes gap #4).

### 5.4 Reuse, don't reinvent

- `admin/ui.ts`: `esc`, `fmtDate`, `pill`, `empty`, `cards`, `bars` — extend with `relAgo` (copy from `users.ts:11-20`) and optionally a `kebabDropdown` helper.
- `events.ts`: full-media modal JS (`ppMediaOpen` …) and the pager/`qstr` build — copy the patterns; the inline scripts are page-local by design.
- `users.ts`: filter form + `onchange` submit + „Wyczyść" pattern.
- CSS: zero custom styles; everything is stock Tabler 1.4.

### 5.5 Gaps to flag but NOT fix silently (site-wide)

- **No CSRF token** on any admin POST form today. The §4.2 fetch flow has a JSON body — reserve a field for a token and wire it when a token mechanism lands (out of scope here; the redesign at minimum shouldn't make it harder).
- **Session cookie** is `HttpOnly; SameSite=Strict` — a same-origin `fetch` POST is safe today; still keep the token slot.
- **`ban` should also reject the post** — do this in the rewrite, it is part of "moderation that works", and note the behavior change in the admin UI copy ("Odrzuć post + zbanuj autora").

### 5.6 Effort / risk

- Touches one page file + one new migration + small `ui.ts` additions. No changes to `api/reports.ts`, auth, or the app.
- Backwards compatible: old `'resolved'` rows still render; the new statuses only start appearing once the new handlers run.
- Test manually via the existing D1 dev workflow (`wrangler`); seed a couple of reports with different reasons/statuses to check the segmented control, empty state, and pager at page 2.

---

*This is a spec for a redesign of `backend/src/admin/dashboard/pages/reports.ts` only. No application source has been modified.*
