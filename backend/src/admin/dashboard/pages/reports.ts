// Reports page: moderation queue — queue-health cards, filters, table with kebab
// actions, fetch-based moderation + toasts + ban confirm, pagination.
// Action semantics: reject → 'rejected' (+reason label), ban → 'banned' (+ban +
// reject the post), resolve → 'resolved'.

import { Hono } from 'hono';
import { cards, empty, esc, fmtDate, pill, relAgo, pagination, toastContainer, toastScript, icon } from '../../ui';
import { requireSession } from '../common';
import { STATUS_REJECTED } from '../../../core/models';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();
const PAGE_SIZE = 25;

const REASON_LABELS: Record<string, { label: string; badge: string }> = {
  spam: { label: 'Spam', badge: 'bg-warning-lt text-warning' },
  przemoc: { label: 'Przemoc', badge: 'bg-danger-lt text-danger' },
  nienawistna_tresc: { label: 'Nienawistna treść', badge: 'bg-danger-lt text-danger' },
  nieodpowiednie: { label: 'Nieodpowiednie', badge: 'bg-secondary-lt text-secondary' },
  inne: { label: 'Inne', badge: 'bg-secondary-lt text-secondary' },
};

function reasonBadge(reason: string): string {
  const r = REASON_LABELS[reason] ?? { label: reason, badge: 'bg-secondary-lt text-secondary' };
  return `<span class="badge ${r.badge}">${esc(r.label)}</span>`;
}

function statusPill(status: string): string {
  switch (status) {
    case 'open': return pill('open', 'warn');
    case 'resolved': return pill('resolved', 'ok');
    case 'rejected': return pill('rejected', 'err');
    case 'banned': return pill('banned', 'err');
    default: return pill(status, 'muted');
  }
}

pageRoutes.get('/reports', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const status = q.status ? String(q.status) : null;
  const reason = q.reason ? String(q.reason) : null;
  const search = q.q ? String(q.q) : null;
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);

  const [stats, banned, byReason, statuses] = await Promise.all([
    db.prepare('SELECT status, COUNT(*) n FROM reports GROUP BY status').all<{ status: string; n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM banned_devices').first<{ n: number }>(),
    db.prepare('SELECT reason, COUNT(*) n FROM reports GROUP BY reason ORDER BY n DESC').all<{ reason: string; n: number }>(),
    db.prepare('SELECT status, COUNT(*) n FROM reports GROUP BY status').all<{ status: string; n: number }>(),
  ]);
  const statusCnt: Record<string, number> = {};
  for (const s of statuses.results ?? []) statusCnt[s.status] = s.n;
  const openCount = statusCnt['open'] ?? 0;
  const resolvedCount = statusCnt['resolved'] ?? 0;

  const statRow = cards([
    { label: 'Otwarte', value: openCount, color: openCount ? 'warning' : '', href: '/admin/reports?status=open' },
    { label: 'Rozwiązane', value: resolvedCount, color: 'success', href: '/admin/reports?status=resolved' },
    { label: 'Odrzucone posty', value: statusCnt['rejected'] ?? 0, color: (statusCnt['rejected'] ?? 0) ? 'danger' : '', href: '/admin/reports?status=rejected' },
    { label: 'Zbanowane urządzenia', value: banned?.n ?? 0, color: (banned?.n ?? 0) ? 'danger' : '', href: '/admin/users' },
  ]);

  // ---- Filters ----
  const seg = (label: string, href: string, active: boolean) =>
    `<a class="btn btn-sm ${active ? 'active' : ''}" href="${esc(href)}">${label}</a>`;
  const segBar = `<div class="btn-group btn-group-segmented" role="group">
    ${seg('Wszystkie', `/admin/reports?${buildQs(q, { status: null })}`, !status)}
    ${seg('Otwarte', `/admin/reports?${buildQs(q, { status: 'open' })}`, status === 'open')}
    ${seg('Rozwiązane', `/admin/reports?${buildQs(q, { status: 'resolved' })}`, status === 'resolved')}
    ${seg('Odrzucone', `/admin/reports?${buildQs(q, { status: 'rejected' })}`, status === 'rejected')}
    ${seg('Zbanowane', `/admin/reports?${buildQs(q, { status: 'banned' })}`, status === 'banned')}
  </div>`;
  const reasonOpts = `<option value="">Wszystkie powody</option>` + (byReason.results ?? []).map((r) =>
    `<option value="${esc(r.reason)}" ${reason === r.reason ? 'selected' : ''}>${esc(REASON_LABELS[r.reason]?.label ?? r.reason)} (${r.n})</option>`).join('');

  const filterBar = `<div class="card mb-3"><div class="card-body">
    <div class="d-flex align-items-center gap-2 flex-wrap mb-3">
      <span class="text-secondary fw-bold">Status</span>${segBar}
    </div>
    <form method="get" action="/admin/reports" class="row g-2">
      <div class="col-6 col-md-3"><label class="form-label">Powód</label><select name="reason" class="form-select" onchange="this.form.submit()">${reasonOpts}</select></div>
      <div class="col-6 col-md-5"><label class="form-label">Szukaj</label>
        <div class="input-icon"><span class="input-icon-addon">${icon('search')}</span>
          <input name="q" class="form-control" value="${esc(search || '')}" placeholder="username, device_id, post id, powód…" /></div></div>
      <div class="col-12 col-md-4 d-flex align-items-end gap-2">
        <button class="btn btn-primary" type="submit">Szukaj</button>
        <a class="btn btn-outline-secondary" href="/admin/reports">Wyczyść</a>
      </div>
    </form>
  </div></div>`;

  // ---- List ----
  let where = '1=1';
  const binds: unknown[] = [];
  if (status) { where += ' AND r.status=?'; binds.push(status); }
  if (reason) { where += ' AND r.reason=?'; binds.push(reason); }
  if (search) {
    where += ` AND (COALESCE(NULLIF(u.username,''),u.device_id) LIKE ? OR COALESCE(NULLIF(a.username,''),a.device_id) LIKE ?
      OR a.device_id LIKE ? OR r.post_id LIKE ? OR r.reason LIKE ?)`;
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const [rows, cnt] = await Promise.all([
    db.prepare(`SELECT r.id, r.post_id, r.reason, r.status, r.created_at,
        COALESCE(NULLIF(u.username,''), u.device_id) AS reporter, u.device_id AS reporter_device,
        COALESCE(NULLIF(a.username,''), a.device_id) AS author, a.device_id AS author_device, a.avatar_key AS author_avatar,
        p.thumb_key, p.media_key, p.status AS post_status, p.rejection_reason, p.description,
        EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id=a.device_id) AS author_banned,
        (SELECT COUNT(*) FROM reports r2 WHERE r2.post_id=r.post_id AND r2.status='open') AS open_for_post
      FROM reports r
      JOIN users u ON u.id=r.reporter_user_id
      JOIN posts p ON p.id=r.post_id
      JOIN users a ON a.id=p.user_id
      WHERE ${where} ORDER BY (r.status='open') DESC, r.created_at DESC LIMIT ? OFFSET ?`).bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE).all<any>(),
    db.prepare(`SELECT COUNT(*) n FROM reports r WHERE ${where}`).bind(...binds).first<{ n: number }>(),
  ]);
  const total = cnt?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (k !== 'page') qs.set(k, v);
    qs.set('page', String(p));
    return `/admin/reports?${qs}`;
  };

  const rowsHtml = ((rows.results ?? []) as any[]).map((r) => {
    const thumb = r.thumb_key || r.media_key
      ? `<a href="javascript:void(0)" onclick="ppMediaOpen('/media/${esc(r.media_key || r.thumb_key)}');return false;" title="Podgląd">
          <span class="avatar avatar-sm rounded"><img src="/media/${esc(r.thumb_key || r.media_key)}" alt="" loading="lazy" onerror="this.closest('.avatar').classList.add('bg-secondary-lt')" /></span></a>`
      : '—';
    const authorAvatar = r.author_avatar
      ? `<img src="/media/${esc(r.author_avatar)}" class="avatar avatar-xs rounded" alt="" onerror="this.closest('.avatar').classList.add('bg-secondary-lt')" />`
      : '';
    const authorBan = r.author_banned ? ` ${pill('BAN', 'err')}` : '';
    const multi = r.open_for_post > 1 ? `<span class="badge bg-warning-lt text-warning ms-1">Zgłoszony ×${r.open_for_post}</span>` : '';
    const postStatus = r.post_status ? pill(r.post_status, r.post_status === 'approved' ? 'ok' : r.post_status === 'pending' ? 'warn' : 'err') : '';
    const rowCls = r.author_banned ? ' table-danger' : '';
    const actions = r.status === 'open'
      ? `<div class="dropdown text-end">
          <button class="btn btn-action dropdown-toggle" data-bs-toggle="dropdown" type="button" title="Akcje">${icon('more-horizontal')}</button>
          <div class="dropdown-menu dropdown-menu-end">
            <a class="dropdown-item" href="#" onclick="ppModerate('${esc(r.id)}','reject',this)">Odrzuć post</a>
            <a class="dropdown-item" href="#" onclick="ppModerate('${esc(r.id)}','ban',this)">Zbanuj autora</a>
            <div class="dropdown-divider"></div>
            <a class="dropdown-item" href="#" onclick="ppModerate('${esc(r.id)}','resolve',this)">Rozwiąż (bez zmian)</a>
          </div></div>`
      : '—';
    return `<tr class="${rowCls}">
      <td>${thumb}</td>
      <td><span class="font-monospace">${esc(String(r.post_id).slice(0, 12))}</span> ${postStatus}${multi}
        ${r.description ? `<div class="text-muted fs-6">${esc(String(r.description).slice(0, 60))}</div>` : ''}</td>
      <td><div class="d-flex align-items-center gap-2">
        <span class="avatar avatar-xs rounded ${r.author_avatar ? '' : 'bg-primary-lt'}">${authorAvatar || '—'}</span>
        <div><div class="fw-semibold">${esc(r.author)}${authorBan}</div>
        <div class="text-muted font-monospace fs-6">${esc(r.author_device)}</div></div></div></td>
      <td><div class="fw-semibold">${esc(r.reporter)}</div><div class="text-muted font-monospace fs-6">${esc(r.reporter_device)}</div></td>
      <td>${reasonBadge(r.reason)}</td>
      <td>${fmtDate(r.created_at)} <span class="text-muted fs-6">(${relAgo(r.created_at)})</span></td>
      <td>${statusPill(r.status)}</td>
      <td>${actions}</td></tr>`;
  }).join('');

  const emptyState = `<tr><td colspan="8">
    <div class="empty">
      <div class="empty-icon">${icon('flag')}</div>
      <p class="empty-title">Brak raportów</p>
      <p class="empty-subtitle text-secondary">${search || reason || status ? 'Nic nie pasuje do tego filtra. Zmień kryteria lub wyczyść filtry.' : 'Raporty pojawią się, gdy użytkownik zgłosi post w appce („Zgłoś”).'}</p>
      ${search || reason || status ? '<div class="empty-action"><a class="btn btn-outline-secondary" href="/admin/reports">Wyczyść filtry</a></div>' : ''}
    </div></td></tr>`;

  const header = `<div class="page-header d-print-none mb-3">
    <div class="container-xl">
      <div class="row align-items-center">
        <div class="col">
          <div class="page-pretitle">PanPeryskop Admin</div>
          <h2 class="page-title">Raporty treści
            <span class="badge bg-warning-lt text-warning ms-2" id="ppOpenBadge">${openCount} otwartych</span>
          </h2>
          <div class="text-secondary">Moderacja zgłoszeń użytkowników — przegląd, odrzucanie postów, banowanie urządzeń.</div>
        </div>
      </div>
    </div>
  </div>`;

  const body = `${header}${statRow}${filterBar}
  <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
    <span class="text-secondary">${total} zgłoszeń · strona ${page} / ${totalPages}</span>
    ${pagination(page, totalPages, pageHref)}
  </div>
  <div class="card mb-3">
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Media</th><th>Post</th><th>Autor</th><th>Zgłaszający</th><th>Powód</th><th>Czas</th><th>Status</th><th class="w-1">Akcje</th></tr></thead>
      <tbody>${rowsHtml || emptyState}</tbody></table></div>
  </div>
  <div class="modal fade" id="ppMediaModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-xl modal-blur">
      <div class="modal-content bg-transparent border-0 shadow-none">
        <img id="ppMediaImg" alt="" class="img-fluid mx-auto rounded" onclick="ppMediaClose()" />
      </div>
    </div>
  </div>
  <div class="modal fade" id="ppBanConfirmModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-blur">
      <div class="modal-content">
        <div class="modal-status bg-danger" id="ppBanErr" style="display:none"></div>
        <div class="modal-header"><h3 class="modal-title">Ban urządzenia autora</h3></div>
        <div class="modal-body">
          <p class="text-secondary">Zbanujesz urządzenie autora <strong class="font-monospace" id="ppBanDevice"></strong> i odrzucisz zgłoszony post. Operacja jest trwała.</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" onclick="ppBanClose()">Anuluj</button>
          <button type="button" class="btn btn-danger" onclick="ppBanConfirm()">Zbanuj</button>
        </div>
      </div>
    </div>
  </div>
  ${toastContainer()}
  <script>
  (function(){
    var media=document.getElementById('ppMediaModal'), banM=document.getElementById('ppBanConfirmModal');
    var show=function(el){var B=window.tabler||window.bootstrap; if(B&&B.Modal&&el) B.Modal.getOrCreateInstance(el).show();};
    var hide=function(el){var B=window.tabler||window.bootstrap; if(B&&B.Modal&&el){var m=B.Modal.getInstance(el); if(m) m.hide();}};
    window.ppMediaOpen=function(src){var img=document.getElementById('ppMediaImg'); if(img) img.src=src; show(media);};
    window.ppMediaClose=function(){hide(media);};
    window.ppBanTarget=null;
    window.ppModerate=function(id,action,el){
      if(action==='ban'){
        window.ppBanTarget={id:id,el:el};
        var dev=el.closest('tr').querySelector('.font-monospace');
        document.getElementById('ppBanDevice').textContent=dev?dev.textContent:'—';
        var err=document.getElementById('ppBanErr'); if(err) err.style.display='none';
        show(banM);
        return;
      }
      ppSend(id,action,el);
    };
    window.ppBanClose=function(){hide(banM);window.ppBanTarget=null;};
    window.ppBanConfirm=function(){
      var t=window.ppBanTarget; if(!t) return;
      hide(banM); window.ppBanTarget=null;
      ppSend(t.id,'ban',t.el);
    };
    function ppSend(id,action,el){
      fetch('/admin/reports/'+encodeURIComponent(id)+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})})
        .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
        .then(function(resp){
          var msg=action==='reject'?'Post odrzucony.':action==='ban'?'Urządzenie autora zbanowane.':'Raport rozwiązany.';
          window.ppToast(msg,'success');
          var tr=el?el.closest('tr'):null;
          if(tr) tr.remove();
          var badge=document.getElementById('ppOpenBadge');
          if(badge){
            var n=parseInt(badge.textContent,10);
            if(n>0) badge.textContent=(n-1)+' otwartych';
          }
        })
        .catch(function(){
          if(action==='ban'){var e=document.getElementById('ppBanErr'); if(e){e.textContent='Nie udało się zbanować.';e.style.display='block';}}
          else window.ppToast('Nie udało się wykonać akcji.','danger');
        });
    }
  })();
  </script>
  ${toastScript()}`;

  return renderPage(c, 'Raporty', '/admin/reports', body);
});

// Helpers to build state-preserving links for the segmented bar.
function buildQs(params: Record<string, string>, overrides: Record<string, string | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (k !== 'page') qs.set(k, v);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === '') qs.delete(k);
    else qs.set(k, v);
  }
  return qs.toString();
}

// Odrzuć post — writes the real reason label, marks the report 'rejected'.
pageRoutes.post('/reports/:id/reject', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const db = c.env.DB;
  const id = c.req.param('id');
  const report = await db.prepare('SELECT post_id, reason FROM reports WHERE id=?').bind(id).first<{ post_id: string; reason: string }>();
  if (!report) return c.json({ error: 'Report not found' }, 404);
  const label = REASON_LABELS[report.reason]?.label ?? report.reason;
  await db.prepare('UPDATE posts SET status=?, rejection_reason=? WHERE id=?').bind(STATUS_REJECTED, label, report.post_id).run();
  await db.prepare("UPDATE reports SET status='rejected', resolved_at=?, resolved_by=? WHERE id=?")
    .bind(Date.now(), 'admin', id).run();
  return c.json({ ok: true });
});

// Ban autora — bans the device AND rejects the offending post (moderation that works).
pageRoutes.post('/reports/:id/ban', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const db = c.env.DB;
  const id = c.req.param('id');
  const report = await db.prepare('SELECT post_id, reason FROM reports WHERE id=?').bind(id).first<{ post_id: string; reason: string }>();
  if (!report) return c.json({ error: 'Report not found' }, 404);
  const author = await db.prepare('SELECT u.device_id FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=?').bind(report.post_id).first<{ device_id: string }>();
  if (author) {
    await db.prepare('INSERT INTO banned_devices (device_id, reason, banned_at) VALUES (?,?,?) ON CONFLICT(device_id) DO UPDATE SET reason=excluded.reason')
      .bind(author.device_id, `raport: ${REASON_LABELS[report.reason]?.label ?? report.reason}`, Date.now()).run();
  }
  const label = REASON_LABELS[report.reason]?.label ?? report.reason;
  await db.prepare('UPDATE posts SET status=?, rejection_reason=? WHERE id=?').bind(STATUS_REJECTED, label, report.post_id).run();
  await db.prepare("UPDATE reports SET status='banned', resolved_at=?, resolved_by=? WHERE id=?")
    .bind(Date.now(), 'admin', id).run();
  return c.json({ ok: true });
});

pageRoutes.post('/reports/:id/resolve', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  await c.env.DB.prepare("UPDATE reports SET status='resolved', resolved_at=?, resolved_by=? WHERE id=?")
    .bind(Date.now(), 'admin', c.req.param('id')).run();
  return c.json({ ok: true });
});

export function registerReports(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
