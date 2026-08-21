// Users page: stat strip, search + activity filters, table with avatars/actions,
// ban/unban with confirm modal + toasts, Tabler pagination.

import { Hono } from 'hono';
import { cards, empty, esc, fmtDate, pill, relAgo, pagination, toastContainer, toastScript } from '../../ui';
import { requireSession } from '../common';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();
const PAGE_SIZE = 50;

const PROVIDER_BADGE: Record<string, string> = {
  device: 'bg-secondary-lt text-secondary',
  apple: 'bg-black text-white',
  google: 'bg-primary-lt text-primary',
};

// Deterministic avatar background from a hash of the id (Tabler has no auto colors).
function colorFor(s: string): string {
  const palette = ['bg-primary-lt', 'bg-success-lt', 'bg-warning-lt', 'bg-danger-lt', 'bg-azure-lt', 'bg-purple-lt', 'bg-pink-lt', 'bg-teal-lt'];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function initials(name: string | null | undefined): string {
  const n = (name || '').trim();
  if (!n) return '?';
  return n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function dotColor(ms: number | null | undefined): string {
  if (!ms) return 'status-muted';
  const diff = Date.now() - ms;
  if (diff < 7 * 86_400_000) return diff < 86_400_000 ? 'status-green' : 'status-yellow';
  return 'status-muted';
}

pageRoutes.get('/users', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const search = q.q ? String(q.q) : null;
  const active = String(q.active ?? '');
  const provider = q.provider ? String(q.provider) : null;
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);

  // ---- Aggregates (one statement, subqueries) ----
  const agg = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM users) AS total,
      (SELECT COUNT(*) FROM users WHERE last_seen >= ?1) AS active24h,
      (SELECT COUNT(*) FROM users WHERE last_seen >= ?2) AS active7d,
      (SELECT COUNT(*) FROM users WHERE last_seen >= ?3) AS active30d,
      (SELECT COUNT(*) FROM users u WHERE u.last_seen IS NULL
        AND NOT EXISTS (SELECT 1 FROM auth_events e WHERE e.user_id=u.id)
        AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.user_id=u.id)
        AND NOT EXISTS (SELECT 1 FROM views v WHERE v.user_id=u.id)) AS never_active,
      (SELECT COUNT(*) FROM banned_devices) AS banned`).bind(Date.now() - 86_400_000, Date.now() - 7 * 86_400_000, Date.now() - 30 * 86_400_000).first<{ total: number; active24h: number; active7d: number; active30d: number; never_active: number; banned: number }>();
  const provRow = await db.prepare('SELECT auth_provider, COUNT(*) n FROM users GROUP BY auth_provider').all<{ auth_provider: string; n: number }>();
  const providers = provRow.results ?? [];

  // ---- Filters ----
  const where: string[] = [];
  const binds: unknown[] = [];
  if (search) {
    where.push("(u.device_id LIKE ? OR COALESCE(u.username,'') LIKE ?)");
    binds.push(`%${search}%`, `%${search}%`);
  }
  if (active === '24h' || active === '7d' || active === '30d') {
    const h = active === '24h' ? 24 : active === '7d' ? 168 : 720;
    where.push('u.last_seen >= ?');
    binds.push(Date.now() - h * 3600 * 1000);
  } else if (active === 'never') {
    where.push(`u.last_seen IS NULL
      AND NOT EXISTS (SELECT 1 FROM auth_events e WHERE e.user_id=u.id)
      AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.user_id=u.id)
      AND NOT EXISTS (SELECT 1 FROM views v WHERE v.user_id=u.id)`);
  }
  if (provider) { where.push('u.auth_provider = ?'); binds.push(provider); }
  const whereSql = where.length ? ' AND ' + where.join(' AND ') : '';

  const [rows, cnt] = await Promise.all([
    db.prepare(`SELECT u.id, u.device_id, u.username, u.auth_provider, u.role, u.created_at, u.last_seen, u.avatar_key,
        (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id) AS post_count,
        (SELECT COUNT(*) FROM views v WHERE v.user_id=u.id) AS view_count,
        b.reason AS ban_reason, (b.device_id IS NOT NULL) AS banned
      FROM users u LEFT JOIN banned_devices b ON b.device_id=u.device_id
      WHERE 1=1${whereSql}
      ORDER BY (u.last_seen IS NULL), u.last_seen DESC, u.created_at DESC LIMIT ? OFFSET ?`).bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE).all(),
    db.prepare(`SELECT COUNT(*) n FROM users u WHERE 1=1${whereSql}`).bind(...binds).first<{ n: number }>(),
  ]);
  const total = cnt?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const results = (rows.results ?? []) as any[];
  const maxPosts = Math.max(1, ...results.map((u) => u.post_count));
  const maxViews = Math.max(1, ...results.map((u) => u.view_count));

  const statRow = cards([
    { label: 'Użytkownicy', value: agg?.total ?? 0, icon: 'users' },
    { label: 'Aktywni 24 h', value: agg?.active24h ?? 0, color: 'success', icon: 'check' },
    { label: 'Aktywni 7 dni', value: agg?.active7d ?? 0, icon: 'check' },
    { label: 'Aktywni 30 dni', value: agg?.active30d ?? 0, icon: 'check' },
    { label: 'Nigdy nieaktywni', value: agg?.never_active ?? 0, color: (agg?.never_active ?? 0) ? 'warning' : '', icon: 'x' },
    { label: 'Zbanowani', value: agg?.banned ?? 0, color: (agg?.banned ?? 0) ? 'danger' : '', icon: 'ban' },
  ]);

  const provOpts = `<option value="">Wszyscy</option>` + providers.map((p) =>
    `<option value="${esc(p.auth_provider)}" ${provider === p.auth_provider ? 'selected' : ''}>${esc(p.auth_provider)} (${p.n})</option>`).join('');

  const seg = (label: string, value: string) =>
    `<input type="radio" class="segmented-input" name="active" value="${value}" id="act-${value || 'all'}" ${active === value ? 'checked' : ''} onchange="this.form.submit()">
     <label class="segmented-item" for="act-${value || 'all'}">${label}</label>`;

  const filterBar = `<div class="card mb-3"><div class="card-body">
    <form method="get" action="/admin/users" class="row g-3 align-items-end">
      <div class="col-12 col-md-5">
        <label class="form-label">Szukaj</label>
        <div class="input-icon">
          <input type="search" name="q" value="${esc(search || '')}" class="form-control" placeholder="device_id lub username…" autocomplete="off" oninput="ppSearchDebounce(this)">
          <span class="input-icon-addon"><svg class="icon"><use href="#icon-search"/></svg></span>
        </div>
        <div class="form-hint">Szuka po device_id oraz nazwie użytkownika.</div>
      </div>
      <div class="col-12 col-md-5">
        <label class="form-label">Aktywność</label>
        <div class="segmented" role="group" aria-label="Filtr aktywności">
          ${seg('Wszyscy', '')}${seg('24 h', '24h')}${seg('7 dni', '7d')}${seg('30 dni', '30d')}${seg('Nigdy', 'never')}
        </div>
      </div>
      <div class="col-6 col-md-2"><label class="form-label">Provider</label><select name="provider" class="form-select" onchange="this.form.submit()">${provOpts}</select></div>
      <div class="col-12"><a class="btn btn-outline-secondary" href="/admin/users">Wyczyść</a></div>
    </form>
  </div></div>`;

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (search) qs.set('q', search);
    if (active) qs.set('active', active);
    if (provider) qs.set('provider', provider);
    qs.set('page', String(p));
    return `/admin/users?${qs}`;
  };

  const rowsHtml = results.map((u) => {
    const avatar = u.avatar_key
      ? `<span class="avatar avatar-sm"><img src="/media/${esc(u.avatar_key)}" alt="" onerror="this.closest('.avatar').classList.add('bg-secondary-lt')" /></span>`
      : `<span class="avatar avatar-sm ${colorFor(u.id)}">${esc(initials(u.username || u.device_id))}</span>`;
    const providerBadge = PROVIDER_BADGE[u.auth_provider]
      ? `<span class="badge ${PROVIDER_BADGE[u.auth_provider]}">${esc(u.auth_provider)}</span>` : esc(u.auth_provider);
    const banBtn = u.banned
      ? `<button class="btn btn-sm btn-outline-success pp-ban" data-id="${esc(u.id)}" data-device="${esc(u.device_id)}" data-action="unban">Odbanuj</button>`
      : `<button class="btn btn-sm btn-outline-danger pp-ban" data-id="${esc(u.id)}" data-device="${esc(u.device_id)}" data-action="ban">Banuj</button>`;
    return `<tr>
      <td>
        <div class="d-flex align-items-center gap-3">
          ${avatar}
          <div class="lh-1">
            <div class="fw-semibold">${esc(u.username || '—')}${u.role === 'admin' ? `<span class="badge bg-primary-lt text-primary ms-1">admin</span>` : ''}</div>
            <div class="text-secondary font-monospace fs-6">${esc(u.device_id)}</div>
          </div>
        </div>
      </td>
      <td>${providerBadge}</td>
      <td>${fmtDate(u.created_at)}</td>
      <td><span class="status ${dotColor(u.last_seen)}"><span class="status-dot"></span>${relAgo(u.last_seen)}</span></td>
      <td><div class="d-flex flex-column">
        <span class="fw-semibold">${u.post_count}</span>
        <div class="progress progress-sm w-100" style="max-width:6rem"><div class="progress-bar" style="width:${Math.round((u.post_count / maxPosts) * 100)}%"></div></div></div></td>
      <td><div class="d-flex flex-column">
        <span class="fw-semibold">${u.view_count}</span>
        <div class="progress progress-sm w-100" style="max-width:6rem"><div class="progress-bar" style="width:${Math.round((u.view_count / maxViews) * 100)}%"></div></div></div></td>
      <td>${u.banned ? `<span class="badge bg-danger-lt text-danger" title="${esc(u.ban_reason || '')}">BAN</span>` : `<span class="badge bg-success-lt text-success">ok</span>`}</td>
      <td class="text-end">${banBtn}</td></tr>`;
  }).join('');

  const emptyRow = `<tr><td colspan="8">
    <div class="empty">
      <div class="empty-icon"><svg class="icon icon-trophy"><use href="#icon-users"/></svg></div>
      <p class="empty-title">Brak wyników</p>
      <p class="empty-subtitle text-secondary">${search ? `Nie znaleziono użytkownika „${esc(search)}”.` : 'Żaden użytkownik nie pasuje do wybranego filtra.'}</p>
      <div class="empty-action"><a class="btn btn-primary" href="/admin/users">Wyczyść filtry</a></div>
    </div></td></tr>`;

  const header = `<div class="page-header d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
    <div>
      <div class="page-pretitle">Panel administracyjny</div>
      <h2 class="page-title mb-0">Użytkownicy</h2>
    </div>
    <div class="page-title-actions">
      <span class="badge bg-secondary-lt text-secondary">${agg?.total ?? 0} kont</span>
      <a href="/admin/reports" class="btn btn-sm btn-outline-secondary ms-2">Raporty</a>
    </div>
  </div>`;

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const pagerFooter = totalPages > 1
    ? `<div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
        <span class="text-secondary">Pokazano ${from}–${to} z ${total}</span>
        ${pagination(page, totalPages, pageHref)}
      </div>` : '';

  const body = `${header}${statRow}${filterBar}
  <div class="card">
    <div class="card-header"><h3 class="card-title">Użytkownicy</h3>
      <div class="ms-auto text-secondary">${total} wyników · strona ${page} / ${totalPages}</div></div>
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Użytkownik</th><th>Provider</th><th>Utworzony</th><th>Ostatnia aktywność</th><th>Posty</th><th>Obejrzane</th><th>Status</th><th class="w-1"></th></tr></thead>
      <tbody>${rowsHtml || emptyRow}</tbody></table></div>
    ${pagerFooter}
  </div>
  <div class="modal fade" id="ppBanModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-status bg-danger" id="ppBanStatus" style="display:none"></div>
        <div class="modal-header"><h3 class="modal-title" id="ppBanTitle">Ban urządzenia</h3></div>
        <div class="modal-body">
          <p class="text-secondary">Urządzenie <code class="font-monospace" id="ppBanDevice"></code></p>
          <div class="mb-3"><label class="form-label">Powód (opcjonalnie)</label>
            <textarea id="ppBanReason" class="form-control" rows="2" placeholder="np. naruszenie treści (raport)"></textarea></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" onclick="ppBanClose()">Anuluj</button>
          <button type="button" class="btn btn-danger" onclick="ppBanConfirm()">Banuj</button>
        </div>
      </div>
    </div>
  </div>
  ${toastContainer()}
  <script>
  (function(){
    var B=null;
    var banM=document.getElementById('ppBanModal');
    var show=function(el){var B2=window.tabler||window.bootstrap; if(B2&&B2.Modal&&el) B2.Modal.getOrCreateInstance(el).show();};
    var hide=function(el){var B2=window.tabler||window.bootstrap; if(B2&&B2.Modal&&el){var m=B2.Modal.getInstance(el); if(m) m.hide();}};
    window.ppBanTarget=null;
    window.ppBan=function(id,device,action){
      window.ppBanTarget={id:id,device:device,action:action};
      var t=document.getElementById('ppBanTitle'), st=document.getElementById('ppBanStatus'), d=document.getElementById('ppBanDevice');
      if(st) st.style.display='none';
      if(t) t.textContent=action==='unban'?'Odbanuj urządzenie':'Ban urządzenia';
      if(d) d.textContent=device;
      show(banM);
    };
    window.ppBanClose=function(){hide(banM);window.ppBanTarget=null;};
    window.ppBanConfirm=function(){
      var t=window.ppBanTarget; if(!t) return;
      var reason=document.getElementById('ppBanReason')?document.getElementById('ppBanReason').value.trim():'';
      fetch('/admin/users/'+encodeURIComponent(t.id)+'/'+t.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:reason})})
        .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
        .then(function(){
          window.ppBanClose();
          window.ppToast(t.action==='unban'?'Odbanowano.':'Zbanowano urządzenie '+t.device+'.',t.action==='unban'?'success':'success');
          location.reload();
        })
        .catch(function(){var st=document.getElementById('ppBanStatus'); if(st){st.textContent='Nie udało się wykonać operacji.';st.style.display='block';}});
    };
    document.querySelectorAll('.pp-ban').forEach(function(btn){
      btn.addEventListener('click',function(){window.ppBan(btn.getAttribute('data-id'),btn.getAttribute('data-device'),btn.getAttribute('data-action'));});
    });
  })();
  window.ppSearchDebounce=(function(){var t=null;return function(input){clearTimeout(t);t=setTimeout(function(){input.form.submit();},400);};})();
  </script>
  ${toastScript()}`;

  return renderPage(c, 'Użytkownicy', '/admin/users', body);
});

// Ban / unban — cookie-auth (session), in-place JSON like the events page.
pageRoutes.post('/users/:id/ban', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const db = c.env.DB;
  const id = c.req.param('id');
  const u = await db.prepare('SELECT device_id FROM users WHERE id=?').bind(id).first<{ device_id: string }>();
  if (!u) return c.json({ error: 'User not found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
  await db.prepare(
    'INSERT INTO banned_devices (device_id, reason, banned_at) VALUES (?,?,?) ON CONFLICT(device_id) DO UPDATE SET reason=excluded.reason'
  ).bind(u.device_id, reason, Date.now()).run();
  return c.json({ ok: true });
});

pageRoutes.post('/users/:id/unban', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const db = c.env.DB;
  const id = c.req.param('id');
  const u = await db.prepare('SELECT device_id FROM users WHERE id=?').bind(id).first<{ device_id: string }>();
  if (!u) return c.json({ error: 'User not found' }, 404);
  await db.prepare('DELETE FROM banned_devices WHERE device_id=?').bind(u.device_id).run();
  return c.json({ ok: true });
});

export function registerUsers(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
