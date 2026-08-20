# PanPeryskop Admin — USERS page redesign spec

Review target: `GET /admin/users` — `backend/src/admin/dashboard/pages/users.ts` (60 lines).
Design system: Tabler 1.4 (CDN), SSR via Hono, no build step, no custom CSS. Render helpers in `backend/src/admin/ui.ts` (`esc`, `fmtDate`, `pill`, `cards`, `empty`, `layout`).

---

## 1) Reality check — what's wrong with the current page

The page is a **bare data dump, not a management tool**. It already fetched everything needed for stat cards and ignores it; it silently loses data at 300 rows; and it exposes zero actions.

1. **Silent truncation, no pagination.** `LIMIT 300` with no count, no `page` param, no pager. The admin has no idea the list is cut off, and rows 300+ are unreachable. The events page (`pages/events.ts:216`) already solves this properly at 100/page — users should copy that pattern.
2. **No search.** `device_id` is an opaque 8+ char token and usernames are generated ("Peryskop no.1234"). Finding one specific user out of 300 by eyeball is impossible. The only control is an activity dropdown.
3. **Aggregate data is unused.** The query could compute total / active-24h / 7d / 30d / never / banned in the same cost as one `COUNT(*)` (overview already shows the raw total at `pages/overview.ts:32`). The page shows none of it, so "how healthy is the install base" is unanswerable here.
4. **"Nigdy (brak aktywności)" is wrong.** `last_seen` is only written by `authenticate()` (`api/auth.ts:240`) and is `NULL` for any user who never authenticated **after migration 0027**, even if they registered, posted and watched content before that. The `never` filter (and any `last_seen IS NULL` logic) mislabels pre-0027 ghosts as never-active. `auth_events` (`login`/`register`) and `views`/`posts` are available proxies that are not consulted.
5. **Semantics of the "Views" column are misleading.** The number comes from `SELECT COUNT(*) FROM views WHERE user_id=u.id` — that's **distinct posts watched**, not view count (the real per-post counter `posts.views_count` is a per-post aggregate, not per-user). Label it "Obejrzane posty" or clarify, or an admin will quote it as "views".
6. **No row actions.** Banning exists (`backend/src/api/admin.ts:129` `/admin/ban`, and the reports page bans devices at `pages/reports.ts:58`) but the users page is read-only. You cannot act on the row you're staring at.
7. **Provider as raw text.** `auth_provider` renders as a bare string; should be a Tabler badge (`device` → muted, `apple`/`google` → brand). Same visual noise as the status column.
8. **No avatar.** `users.avatar_key` exists (`migrations/0002_avatar.sql`, rendered elsewhere as `/media/{key}`) and usernames exist — a Tabler `avatar` (initials, or real image) is the natural identity cell. Currently a plain `<td>`.
9. **Bare numbers, no context.** Post/watched counts are bare ints with no scale reference. Mini progress bars (max = page max) or `count / max` would make outliers pop at 300 rows.
10. **No empty state beyond `empty()`.** Tabler's `.empty` block (icon + title + subtitle + action) is available and would let the "Wyczyść filtry" action live inside the empty state itself.
11. **No feedback loop.** Planned actions (ban/unban) need toasts. The events page already does in-place fetch + outline highlight (`pages/events.ts:404` `ppUpdate`) — reuse that pattern.
12. **Drift between SSR and JSON API.** `pages/users.ts` caps at 300, `api/users.ts` at `LIMIT 200` with no filter — same page, two different queries that will rot independently.
13. **`cards()` helper is generic and icon-less.** A users stat row wants the Tabler "icon avatar + big number + sublabel" pattern; extending `cards()` with an optional icon/sublabel would serve the whole dashboard.

**Verdict:** keep the table (it's the right primitive), but the page needs: stat strip, text search, segmented activity filter, avatar+badge identity cells, per-row ban/unban with toasts, real pagination, and an empty state. ~60 lines of server-side HTML + one tiny inline `<script>`.

---

## 2) Data inventory

All timestamps are epoch ms (`INTEGER`). Tables/columns available and their use here:

### `users` (the list source)
| column | type | shown as |
|---|---|---|
| `id` | TEXT PK | row key for actions, avatar href |
| `device_id` | TEXT UNIQUE | mono cell under username |
| `username` | TEXT | identity line (fallback `—`) |
| `auth_provider` | TEXT (`device`/`apple`/`google`) | provider badge |
| `role` | TEXT (`user`/`admin`) | optional admin badge |
| `created_at` | INTEGER | "Utworzony" date (`fmtDate`) |
| `last_seen` | INTEGER NULL | relative "Ostatnia aktywność" (`relAgo`), drives active filters + status dot |
| `avatar_key` | TEXT NULL | real avatar → `/media/{avatar_key}`, else initials |
| `apple_id`, `google_id` | TEXT | OAuth linkage (debug tooltip) |

### `auth_events` (login/register/logout telemetry)
`id, user_id, device_id, event ('login'|'logout'|'register'), provider, success, created_at`.
Use: per-user **last login** and **login count** in the row's detail line; **providers breakdown** stat; cross-check for `last_seen IS NULL` users (fixes Reality check #4).
⚠️ No index on `user_id` — for per-user lookups add `idx_auth_events_user` (see §5).

### `banned_devices` (ban source of truth)
`device_id PK, reason, banned_at`. Use: banned count stat, per-row ban badge (with `reason` in tooltip), unban action.

### `posts` (post counts)
`user_id`, `status`, `category ('live'|'events')`, `created_at`. Use: `COUNT(*)` per user; optionally split `live` vs `events` for the detail line. Note: current query counts **all** posts incl. rejected seed events — decide and label ("Posty (wszystkie)" vs only `approved`).

### `views` (watched-posts)
`(user_id, post_id)` PK = distinct posts watched per user. Use: "Obejrzane" count (NOT "views" — see Reality check #5).

### Derived aggregates (all one cheap query batch)
- total users, active 24h/7d/30d (by `last_seen`), never (`last_seen IS NULL`, cross-checked vs `auth_events`), banned count
- providers breakdown (`GROUP BY auth_provider`)
- top posters / top viewers (ORDER BY count DESC) — optional "Top" side card

---

## 3) Proposed page composition (top → bottom)

All strings are Polish UI labels. Data sources referenced as **S1..S6** (SQL in §5). Everything renders SSR into `renderPage(c, 'Użytkownicy', '/admin/users', body)`.

### 3.1 `page-header` — title + actions
```html
<div class="page-header d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
  <div>
    <div class="page-pretitle">Panel administracyjny</div>
    <h2 class="page-title mb-0">Użytkownicy</h2>
  </div>
  <div class="page-title-actions">
    <span class="badge bg-secondary-lt text-secondary">${total} kont</span>
    <a href="/admin/reports" class="btn btn-sm btn-outline-secondary ms-2">Raporty</a>
  </div>
</div>
```
Data: **S1** `total`. The badge gives an at-a-glance "is the list truncated?" anchor.

### 3.2 Stat strip — 6 cards (S1)
Extend the existing `cards()` helper (`ui.ts:75`) to accept `icon?: string` + `sub?: string` and emit the Tabler "icon-avatar stat" pattern:
```html
<div class="row row-cards mb-3">
  <div class="col-6 col-md-4 col-xl-2">
    <div class="card card-sm"><div class="card-body">
      <div class="row align-items-center">
        <div class="col-auto">
          <span class="bg-primary-lt avatar"><svg class="icon"><use href="#icon-users"/></svg></span>
        </div>
        <div class="col">
          <div class="text-secondary text-uppercase fw-bold fs-6">Użytkownicy</div>
          <div class="h2 mb-0">145</div>
        </div>
      </div>
    </div></div>
  </div>
</div>
```
Six cards: **Użytkownicy** (total), **Aktywni 24 h** (green), **Aktywni 7 dni**, **Aktywni 30 dni**, **Nigdy nieaktywni** (warning), **Zbanowani** (danger, `#icon-ban`). Icons come from the sprite in `ui.ts` — add `#icon-ban` and `#icon-search` symbols.

### 3.3 Filter bar (card) — search + segmented activity (S4)
A single `<form method="get" action="/admin/users">` row with three controls, GET params `q`, `active`, `provider`, `page`:
```html
<div class="card mb-3"><div class="card-body">
  <form method="get" action="/admin/users" class="row g-3 align-items-end">
    <!-- search -->
    <div class="col-12 col-md-5">
      <label class="form-label">Szukaj</label>
      <div class="input-icon">
        <input type="search" name="q" value="${esc(q)}" class="form-control"
               placeholder="device_id lub username…" autocomplete="off" />
        <span class="input-icon-addon"><svg class="icon"><use href="#icon-search"/></svg></span>
      </div>
      <div class="form-hint">Szuka po device_id oraz nazwie użytkownika.</div>
    </div>
    <!-- segmented activity -->
    <div class="col-12 col-md-5">
      <label class="form-label">Aktywność</label>
      <div class="segmented" role="group" aria-label="Filtr aktywności">
        <input type="radio" class="segmented-input" name="active" value=""  id="act-all"  ${active===''?'checked':''} onchange="this.form.submit()">
        <label class="segmented-item" for="act-all">Wszyscy</label>
        <input type="radio" class="segmented-input" name="active" value="24h" id="act-24h" ${active==='24h'?'checked':''} onchange="this.form.submit()">
        <label class="segmented-item" for="act-24h">24 h</label>
        <input type="radio" class="segmented-input" name="active" value="7d"  id="act-7d"  ${active==='7d'?'checked':''} onchange="this.form.submit()">
        <label class="segmented-item" for="act-7d">7 dni</label>
        <input type="radio" class="segmented-input" name="active" value="30d" id="act-30d" ${active==='30d'?'checked':''} onchange="this.form.submit()">
        <label class="segmented-item" for="act-30d">30 dni</label>
        <input type="radio" class="segmented-input" name="active" value="never" id="act-never" ${active==='never'?'checked':''} onchange="this.form.submit()">
        <label class="segmented-item" for="act-never">Nigdy</label>
      </div>
    </div>
    <!-- clear -->
    <div class="col-12 col-md-2 d-grid">
      <a class="btn btn-outline-secondary" href="/admin/users">Wyczyść</a>
    </div>
  </form>
</div></div>
```
(Optional 4th control: `provider` select `device/apple/google/wszystkie`.) **`never`** should use the corrected SQL from **S4** (last_seen IS NULL AND no auth_events AND no posts AND no views).

### 3.4 Users table (card) — identity, provider, activity, engagement, actions (S4)
```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Użytkownicy</h3>
    <div class="ms-auto text-secondary">${total} wyników · strona ${page} / ${totalPages}</div>
  </div>
  <div class="table-responsive">
  <table class="table table-vcenter card-table">
    <thead><tr>
      <th>Użytkownik</th><th>Provider</th><th>Utworzony</th>
      <th>Ostatnia aktywność</th><th>Posty</th><th>Obejrzane</th>
      <th>Status</th><th class="w-1"></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</div>
```

**Identity cell** — initials avatar (or real image when `avatar_key`), username + device mono. Color hash-picked from a small `bg-*-lt` palette (Tabler has no auto-color avatars):
```html
<td>
  <div class="d-flex align-items-center gap-3">
    <span class="avatar ${u.avatar_key ? '' : colorFor(u.id)}">${initials(u.username)}</span>
    <div class="lh-1">
      <div class="fw-semibold">${esc(u.username || '—')}
        ${u.role==='admin' ? `<span class="badge bg-primary-lt text-primary ms-1">admin</span>` : ''}</div>
      <div class="text-secondary font-monospace fs-6">${esc(u.device_id)}
        ${u.avatar_key ? `<img src="/media/${esc(u.avatar_key)}" alt="" class="avatar avatar-xs ms-1" hidden>` : ''}</div>
    </div>
  </div>
</td>
```
(If a real `avatar_key` exists, render `<span class="avatar avatar-sm"><img src="/media/${esc(u.avatar_key)}" onerror="this.closest('.avatar').classList.add('bg-secondary-lt')"></span>` — same pattern as events thumb at `pages/events.ts:75`.)

**Provider badge:**
```html
<td>${providerBadge(u.auth_provider)}</td>
```
```ts
const PROVIDER_BADGE = { device: ['bg-secondary-lt','text-secondary'], apple: ['bg-black','text-white'], google: ['bg-primary-lt','text-primary'] };
```

**Created / last active** — `fmtDate(u.created_at)`; last active = `relAgo(u.last_seen)` (reuse from current page) with a Tabler **status dot** instead of the muted dash:
```html
<td>
  <span class="status ${dotColor(u.last_seen)}"><span class="status-dot"></span>${relAgo(u.last_seen)}</span>
</td>
```
`dotColor`: `< 60s` → `status-green` (online now), `< 24h` → `status-green`, `< 7d` → `status-yellow`, else/never → `status-muted`.

**Engagement columns** — count + mini progress (max = page max, reuse the bar math from `bars()` in `ui.ts:86`):
```html
<td><div class="d-flex flex-column">
  <span class="fw-semibold">${u.post_count}</span>
  <div class="progress progress-sm w-100" style="max-width:6rem">
    <div class="progress-bar" style="width:${pct(u.post_count, maxPosts)}%"></div>
  </div></div></td>
```
Same for "Obejrzane" (label fixed per Reality check #5).

**Status cell** — Tabler status badge with ban reason tooltip:
```html
<td>${u.banned
  ? `<span class="badge bg-danger-lt text-danger" title="${esc(u.ban_reason || '')}">BAN</span>`
  : `<span class="badge bg-success-lt text-success">ok</span>`}</td>
```

**Actions cell** — ban/unban toggle button (see §4):
```html
<td class="text-end">
  ${u.banned
    ? `<button class="btn btn-sm btn-outline-success pp-ban" data-id="${esc(u.id)}" data-device="${esc(u.device_id)}" data-action="unban">Odbanuj</button>`
    : `<button class="btn btn-sm btn-outline-danger pp-ban" data-id="${esc(u.id)}" data-device="${esc(u.device_id)}" data-action="ban">Banuj</button>`}
</td>
```

### 3.5 Pagination (S4) — Tabler numbered pager
Below the table, plus a copy above for long lists (events page duplicates its pager top/bottom — `pages/events.ts:248,295`). Numbered Tabler markup:
```html
<div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
  <span class="text-secondary">Pokazano ${from}–${to} z ${total}</span>
  <nav>
    <ul class="pagination pagination-sm mb-0">
      <li class="page-item ${page<=1?'disabled':''}">
        <a class="page-link" href="${prevHref}" tabindex="-1">‹</a></li>
      ${pages.map(p => `<li class="page-item ${p===page?'active':''}">
        <a class="page-link" href="${href(p)}">${p}</a></li>`).join('')}
      <li class="page-item ${page>=totalPages?'disabled':''}">
        <a class="page-link" href="${nextHref}">›</a></li>
    </ul>
  </nav>
</div>
```
All links carry `q`, `active`, `provider` (build with `URLSearchParams` exactly like `pages/events.ts:237`). Hrefs must be `esc()`-ed.

### 3.6 Empty state (S4 zero rows)
```html
<div class="empty">
  <div class="empty-icon"><svg class="icon icon-trophy"><use href="#icon-users"/></svg></div>
  <p class="empty-title">Brak wyników</p>
  <p class="empty-subtitle text-secondary">${q ? `Nie znaleziono użytkownika „${esc(q)}”.` : 'Żaden użytkownik nie pasuje do wybranego filtra.'}</p>
  <div class="empty-action"><a class="btn btn-primary" href="/admin/users">Wyczyść filtry</a></div>
</div>
```

### 3.7 Toast container (for ban/unban, §4)
```html
<div class="toast-container position-fixed bottom-0 end-0 p-3" id="ppToastBox" style="z-index:1050"></div>
```
One `<script>` (pattern of `pages/events.ts:346`) that (a) wires search debounce, (b) handles `pp-ban` clicks, (c) pushes toasts. Keep it inline, resolve `B.Modal`/`B.Toast` lazily like `ppUpdate` does.

---

## 4) Interactions

| # | Trigger | Behavior | Data path |
|---|---|---|---|
| 1 | Type in search | Debounced (400 ms) form submit → GET with `q`, reset `page=1`. Debounce so filtering at 300 rows feels live. | S4 |
| 2 | Click segmented "Aktywność" | `onchange="this.form.submit()"` (GET), preserves `q`/`provider`, resets `page`. | S4 |
| 3 | Change provider select (optional) | Same as #2. | S4 |
| 4 | Click page / ‹ › | GET with all current params + `page`. `active` page gets `.active`. | S4 |
| 5 | Click "Banuj" | `ppBan(id, device)` → confirm modal (reason optional, prefilled "raport") → `fetch POST /admin/users/{id}/ban` (JSON) → on 200: swap the actions cell to "Odbanuj" + Status cell to BAN badge (in-place, no reload) → toast `Zbanowano urządzenie <device>`. On error → toast danger. | S5 |
| 6 | Click "Odbanuj" | Confirm → `fetch POST /admin/users/{id}/unban` → swap back → toast. | S5 |
| 7 | Ban/unban success | Optionally refresh the stat strip: `fetch /admin/users?__stats=1` or just accept 1-count drift until next load (recommended: accept drift, simpler). | — |
| 8 | Empty state "Wyczyść filtry" | Link to `/admin/users`. | — |

Ban/unban **must** be cookie-auth (session from `requireSession`) — NOT the bearer `/admin/ban` endpoint (`api/admin.ts:129`), which is for the VPS/seed side. Follow the `POST` + JSON + in-place-swap pattern already proven in `pages/events.ts:441`/`475`.

Modal for ban reason (Tabler, mirrors `ppGeoModal` at `pages/events.ts:329`): title "Ban urządzenia", text `device_id` mono, textarea "Powód (opcjonalnie)", buttons "Anuluj" / "Banuj".

---

## 5) Implementation notes

### 5.1 New SQL — aggregates (S1, one `Promise.all` batch)
```sql
-- total + activity windows + never + banned (corrected never)
SELECT
  (SELECT COUNT(*) FROM users) AS total,
  (SELECT COUNT(*) FROM users WHERE last_seen >= ?1) AS active_24h,          -- bind now-24h
  (SELECT COUNT(*) FROM users WHERE last_seen >= ?2) AS active_7d,           -- bind now-7d
  (SELECT COUNT(*) FROM users WHERE last_seen >= ?3) AS active_30d,          -- bind now-30d
  (SELECT COUNT(*) FROM users u
     WHERE u.last_seen IS NULL
       AND NOT EXISTS (SELECT 1 FROM auth_events e WHERE e.user_id=u.id)
       AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.user_id=u.id)
       AND NOT EXISTS (SELECT 1 FROM views v WHERE v.user_id=u.id)) AS never_active,
  (SELECT COUNT(*) FROM banned_devices) AS banned;

-- providers breakdown
SELECT auth_provider, COUNT(*) AS n FROM users GROUP BY auth_provider;
```
Each subquery returns a single row → keep it one statement (D1 round-trips are the bottleneck).

### 5.2 New SQL — list with search + filter + pagination + sort (S4)
Build `where`/`binds` like `eventsWhere` (`queries.ts:56`). **Never interpolate** the sort column — whitelist map.
```sql
SELECT u.id, u.device_id, u.username, u.auth_provider, u.role, u.created_at, u.last_seen,
       (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id) AS post_count,
       (SELECT COUNT(*) FROM views v WHERE v.user_id=u.id) AS view_count,
       (SELECT MAX(created_at) FROM auth_events e
         WHERE e.user_id=u.id AND e.event='login') AS last_login,
       (SELECT COUNT(*) FROM auth_events e
         WHERE e.user_id=u.id AND e.event='login') AS login_count,
       b.reason AS ban_reason,
       (b.device_id IS NOT NULL) AS banned
FROM users u
LEFT JOIN banned_devices b ON b.device_id = u.device_id
WHERE 1=1
  -- search (SQLite LIKE, ASCII-case-insensitive):
  ${q ? `AND (u.device_id LIKE '%'||? || '%' OR COALESCE(u.username,'') LIKE '%'||?||'%')` : ''}
  -- activity filter:
  ${active==='24h'||active==='7d'||active==='30d' ? 'AND u.last_seen >= ?' : ''}
  ${active==='never' ? `AND u.last_seen IS NULL
       AND NOT EXISTS (SELECT 1 FROM auth_events e WHERE e.user_id=u.id)
       AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.user_id=u.id)
       AND NOT EXISTS (SELECT 1 FROM views v WHERE v.user_id=u.id)` : ''}
  -- optional provider filter: ${provider ? 'AND u.auth_provider = ?' : ''}
ORDER BY ${sortMap[sort] || '(u.last_seen IS NULL), u.last_seen DESC, u.created_at DESC'}
LIMIT ? OFFSET ?
```
```ts
const sortMap: Record<string,string> = {
  created: 'u.created_at DESC', last_seen: '(u.last_seen IS NULL), u.last_seen DESC',
  posts:   'post_count DESC',  views: 'view_count DESC',
  name:    'u.username ASC',   provider: 'u.auth_provider ASC',
};
```
Count query (same where, no ORDER/LIMIT): `SELECT COUNT(*) AS n FROM users u LEFT JOIN banned_devices b ON b.device_id=u.device_id WHERE 1=1 …`. Page size **50** (events uses 100; users rows are dense).

**Rationale for the corrected `never`:** fixes Reality check #4 — a pre-0027 user with `last_seen IS NULL` but `auth_events`/`posts`/`views` rows is *not* "never active".

### 5.3 Pagination builder (server-side, reusable)
Mirror `pages/events.ts:246-253`, generalized:
```ts
function pager(params: URLSearchParams, page: number, totalPages: number, total: number, from: number, to: number): string {
  const href = (p: number) => { const qs = new URLSearchParams(params); qs.set('page', String(p)); return `/admin/users?${qs}`; };
  let items = '';
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 9 && p > 2 && p < totalPages - 1 && Math.abs(p - page) > 1) {
      if (p === 3 || p === totalPages - 2) items += '<li class="page-item disabled"><span class="page-link">…</span></li>';
      continue;
    }
    items += `<li class="page-item ${p === page ? 'active' : ''}"><a class="page-link" href="${esc(href(p))}">${p}</a></li>`;
  }
  return `<div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
    <span class="text-secondary">Pokazano ${from}–${to} z ${total}</span>
    <nav><ul class="pagination pagination-sm mb-0">
      <li class="page-item ${page <= 1 ? 'disabled' : ''}"><a class="page-link" href="${page > 1 ? esc(href(page - 1)) : '#'}">‹</a></li>
      ${items}
      <li class="page-item ${page >= totalPages ? 'disabled' : ''}"><a class="page-link" href="${page < totalPages ? esc(href(page + 1)) : '#'}">›</a></li>
    </ul></nav></div>`;
}
```

### 5.4 New endpoints — ban/unban (S5)
Add to `pages/users.ts` (cookie-auth like `pages/events.ts:441`):
```ts
pageRoutes.post('/users/:id/ban', async (c) => {
  const session = await requireSession(c); if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const u = await c.env.DB.prepare('SELECT device_id FROM users WHERE id=?').bind(c.req.param('id')).first<{ device_id: string }>();
  if (!u) return c.json({ error: 'User not found' }, 404);
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
  await c.env.DB.prepare(
    'INSERT INTO banned_devices (device_id, reason, banned_at) VALUES (?,?,?) ON CONFLICT(device_id) DO UPDATE SET reason=excluded.reason'
  ).bind(u.device_id, reason, Date.now()).run();
  return c.json({ ok: true });
});
// + POST /users/:id/unban → DELETE FROM banned_devices WHERE device_id=?
```
(Keep the row-level `POST /admin/users/:id/ban`; do NOT reuse bearer `/admin/ban`.)

### 5.5 Migration — two free indexes
```sql
-- 0030_users_admin.sql
CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events(user_id, created_at); -- per-user login lookups (S4)
CREATE INDEX IF NOT EXISTS idx_users_last_seen  ON users(last_seen);                 -- activity filters (S4)
```
D1 tables are tiny now; the index on `auth_events(user_id)` is the one that actually pays off once per-row `MAX(created_at)` subqueries run over real data.

### 5.6 Rendering notes
- Reuse `esc`, `fmtDate`, `pill`, `relAgo` (move `relAgo` from `pages/users.ts:11` — it's a general helper, belongs in `ui.ts`).
- Extend `cards()` (`ui.ts:75`) with optional `icon` + `sub` + `color` instead of hand-writing the six stat cards.
- Add `#icon-search` and `#icon-ban` symbols to the sprite (`ui.ts:109`) — Tabler CDN sprite is not referenced, only the hand-picked subset is.
- Keep all JS inline in the page body (pattern `pages/events.ts:346`): toast + modal + ban fetch in one IIFE, lazily resolving `window.tabler` (it loads at end of `layout()`).
- Update `api/users.ts` to reuse the same search/filter/pagination params (or delete it — it duplicates the SSR page and already drifts at `LIMIT 200`).
- Sortable `<th>`s: optional; if added, render `<a href="?sort=posts">` links (carry `q`/`active`/`page`) rather than JS.

### 5.7 Scope guardrails
- Do **not** add front-end pagination/DataTables — SSR + GET params matches every other page in the admin.
- Do **not** allow banning admins (`role='admin'`) without an explicit extra confirm.
- Do **not** show `session_token` anywhere (already unused — keep it that way).
