// Posts page (live): audit + takedown — stat cards, filters, table with dropdown
// moderation actions (approve/reject/ban), reject-reason modal, toasts.

import { Hono } from 'hono';
import { cards, empty, esc, fmtDate, pill, relAgo, pagination, toastContainer, toastScript, icon } from '../../ui';
import { postsSql, postsCountSql, postStatusCounts, PostsFilter } from '../../queries';
import { requireSession } from '../common';
import { STATUS_APPROVED, STATUS_REJECTED } from '../../../core/models';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();
const PAGE_SIZE = 50;

function jsStr(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\u0027')
    .replace(/"/g, '\\u0022')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\n/g, '\\n');
}

function initials(name: string): string {
  const n = (name || '').trim();
  if (!n) return '?';
  return n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function statusPill(s: string): string {
  return s === 'approved' ? pill('approved', 'ok') : s === 'pending' ? pill('pending', 'warn') : pill('rejected', 'err');
}

function mediaCell(media_key: string | null, thumb_key: string | null): string {
  const thumb = thumb_key || media_key;
  const full = media_key || thumb_key;
  if (!thumb) return '—';
  return `<a href="javascript:void(0)" onclick="ppMediaOpen('/media/${esc(full)}');return false;" title="Podgląd">
    <span class="avatar avatar-sm rounded"><img src="/media/${esc(thumb)}" alt="" loading="lazy" onerror="this.closest('.avatar').classList.add('bg-secondary-lt')" /></span></a>`;
}

pageRoutes.get('/posts', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const status = q.status ? String(q.status) : null;
  const type = q.type ? String(q.type) : null;
  const search = q.q ? String(q.q) : null;
  const reported = q.reported === '1';
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);

  const filter: PostsFilter = { status, type, q: search, reported, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  const [counts, { sql, binds }, cnt] = await Promise.all([
    postStatusCounts(db),
    Promise.resolve(postsSql(filter)),
    postsCountSql(filter),
  ]);
  const { results } = await db.prepare(sql).bind(...binds).all<any>();
  const cntRow = await db.prepare(cnt.sql).bind(...cnt.binds).first<{ n: number }>();
  const total = cntRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statRow = cards([
    { label: 'Wszystkie posty', value: counts.total, href: '/admin/posts' },
    { label: 'Aktywne (24 h)', value: counts.active24h, color: 'success' },
    { label: 'Zatwierdzone', value: counts.approved, color: 'success', href: '/admin/posts?status=approved' },
    { label: 'Odrzucone', value: counts.rejected, color: counts.rejected ? 'danger' : '', href: '/admin/posts?status=rejected' },
    { label: 'W kolejce', value: counts.pending, color: counts.pending ? 'warning' : '', href: '/admin/posts?status=pending' },
  ]);

  const seg = (label: string, val: string | null, href: string) =>
    `<a class="nav-link ${status === val ? 'active' : ''}" href="${esc(href)}">${label}</a>`;
  const navSeg = `<nav class="nav nav-segmented w-100">
    ${seg('Wszystkie', null, '/admin/posts')}
    ${seg('Zatwierdzone', 'approved', '/admin/posts?status=approved')}
    ${seg('W kolejce', 'pending', '/admin/posts?status=pending')}
    ${seg('Odrzucone', 'rejected', '/admin/posts?status=rejected')}
  </nav>`;

  const filterBar = `<form method="get" action="/admin/posts" class="card mb-3"><div class="card-body">
    <div class="row g-2 align-items-end">
      <div class="col-12 col-md-4"><label class="form-label">Status</label>${navSeg}</div>
      <div class="col-12 col-md-4">
        <label class="form-label">Szukaj</label>
        <div class="input-icon">
          <span class="input-icon-addon">${icon('search')}</span>
          <input type="search" name="q" class="form-control" value="${esc(search || '')}" placeholder="autor, opis, device" />
        </div>
      </div>
      <div class="col-6 col-md-2">
        <label class="form-label">Typ</label>
        <select name="type" class="form-select" onchange="this.form.submit()">
          <option value="">Wszystkie</option>
          <option value="photo" ${type === 'photo' ? 'selected' : ''}>Zdjęcie</option>
          <option value="video" ${type === 'video' ? 'selected' : ''}>Wideo</option>
        </select>
      </div>
      <div class="col-6 col-md-2">
        <label class="form-label">Raporty</label>
        <select name="reported" class="form-select" onchange="this.form.submit()">
          <option value="">Wszystkie</option>
          <option value="1" ${reported ? 'selected' : ''}>Z raportem</option>
        </select>
      </div>
      <div class="col-12 d-flex align-items-end">
        <button class="btn btn-primary me-2" type="submit">Szukaj</button>
        <a class="btn btn-outline-secondary" href="/admin/posts">Wyczyść</a>
      </div>
    </div>
  </div></form>`;

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (type) qs.set('type', type);
    if (search) qs.set('q', search);
    if (reported) qs.set('reported', '1');
    qs.set('page', String(p));
    return `/admin/posts?${qs}`;
  };
  const pager = `<div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
    <span class="text-secondary">${total} postów · strona ${page} / ${totalPages}</span>
    ${pagination(page, totalPages, pageHref)}
  </div>`;

  const rowsHtml = results.map((p) => {
    const desc = String(p.description || '');
    const shortDesc = desc.length > 80 ? desc.slice(0, 80) + '…' : desc;
    const avatar = p.avatar_key
      ? `<span class="avatar avatar-sm me-2"><img src="/media/${esc(p.avatar_key)}" alt="" onerror="this.closest('.avatar').classList.add('bg-primary-lt')" /></span>`
      : `<span class="avatar avatar-sm me-2 bg-primary-lt">${esc(initials(p.author))}</span>`;
    const bannedTag = p.banned ? ` · ${pill('BAN', 'err')}` : '';
    const typeBadge = p.type ? `<span class="badge bg-secondary-lt text-secondary ms-1">${esc(p.type)}</span>` : '';
    const reportBadge = p.open_reports ? `<span class="badge bg-warning-lt text-warning ms-1">raport ×${p.open_reports}</span>` : '';
    const rejectReason = p.status === 'rejected' && p.rejection_reason ? `<div class="text-danger fs-6">${esc(String(p.rejection_reason))}</div>` : '';
    const mediaUrl = p.media_key || p.thumb_key || '';
    return `<tr data-id="${esc(p.id)}">
      <td>${mediaCell(p.media_key, p.thumb_key)}</td>
      <td>
        <div class="d-flex align-items-center">
          ${avatar}
          <div>
            <div class="fw-semibold">${esc(p.author)}</div>
            <div class="text-muted fs-6 font-monospace">${esc(p.device_id || '')}${bannedTag}</div>
          </div>
        </div>
      </td>
      <td title="${esc(desc)}">
        ${esc(shortDesc)}${typeBadge}${reportBadge}${rejectReason}
      </td>
      <td><span title="${fmtDate(p.created_at)}">${relAgo(p.created_at)}</span></td>
      <td><div class="d-flex gap-1">
        <span class="badge bg-secondary-lt text-secondary">${icon('heart', 'icon icon-xs')} ${p.likes_count ?? 0}</span>
        <span class="badge bg-secondary-lt text-secondary">${icon('eye', 'icon icon-xs')} ${p.views_count ?? 0}</span>
        <span class="badge bg-secondary-lt text-secondary">${icon('share', 'icon icon-xs')} ${p.shares_count ?? 0}</span>
      </div></td>
      <td><span class="pp-status-cell" data-id="${esc(p.id)}">${statusPill(p.status)}</span></td>
      <td class="text-end">
        <div class="dropdown">
          <button class="btn btn-sm btn-icon btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" type="button" title="Akcje">${icon('more-horizontal')}</button>
          <div class="dropdown-menu dropdown-menu-end">
            <a class="dropdown-item" href="javascript:void(0)" onclick="ppMediaOpen('/media/${esc(mediaUrl)}')">Podgląd</a>
            ${p.status !== 'approved' ? `<a class="dropdown-item text-success" href="javascript:void(0)" onclick="ppPostSet('${esc(p.id)}','approved')">Zatwierdź</a>` : ''}
            ${p.status !== 'rejected' ? `<a class="dropdown-item text-danger" href="javascript:void(0)" onclick="ppPostReject('${esc(p.id)}')">Odrzuć…</a>` : ''}
            <div class="dropdown-divider"></div>
            <a class="dropdown-item text-danger" href="javascript:void(0)" onclick="ppPostBan('${esc(p.id)}','${jsStr(p.device_id || '')}')">Banuj urządzenie</a>
          </div>
        </div>
      </td></tr>`;
  }).join('');

  const emptyRow = `<tr><td colspan="7">
    <div class="empty">
      <div class="empty-icon">${icon('photo')}</div>
      <p class="empty-title">${status || type || search || reported ? 'Brak wyników dla filtrów' : 'Brak postów (live)'}</p>
      <p class="empty-subtitle text-secondary">${status === 'pending' ? 'Posty live są zatwierdzane automatycznie — kolejka jest zwykle pusta.' : 'Zmniejsz zakres filtrów lub sprawdź później.'}</p>
      ${status || type || search || reported ? '<div class="empty-action"><a class="btn btn-primary" href="/admin/posts">Wyczyść filtry</a></div>' : ''}
    </div></td></tr>`;

  const header = `<div class="page-header d-print-none mb-3">
    <div class="row align-items-center">
      <div class="col">
        <h1 class="page-title">Posty (live)</h1>
        <div class="page-subtitle text-secondary">Treści użytkowników z feeda na żywo (TTL 24 h)</div>
      </div>
      <div class="col-auto ms-auto d-print-none">
        <a href="/admin/posts" class="btn btn-outline-secondary" title="Odśwież">${icon('refresh')}</a>
      </div>
    </div>
  </div>`;

  const body = `${header}${statRow}${filterBar}${pager}
  <div class="card mb-3">
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Media</th><th>Autor</th><th>Opis</th><th>Czas</th><th>Engagement</th><th>Status</th><th class="text-end">Akcje</th></tr></thead>
      <tbody>${rowsHtml || emptyRow}</tbody></table></div>
  </div>
  ${pager}
  <div class="modal fade" id="ppMediaModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-xl modal-blur">
      <div class="modal-content bg-transparent border-0 shadow-none">
        <img id="ppMediaImg" alt="" class="img-fluid mx-auto rounded" onclick="ppMediaClose()" />
      </div>
    </div>
  </div>
  <div class="modal fade" id="ppRejectModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-blur">
      <div class="modal-content">
        <div class="modal-header"><h3 class="modal-title">Odrzuć post</h3></div>
        <div class="modal-body">
          <div class="mb-3"><label class="form-label">Powód</label>
            <textarea id="ppRejectReason" class="form-control" rows="2" placeholder="np. spam, obraźliwe treści"></textarea>
            <div class="form-hint text-danger" id="ppRejectHint" style="display:none">Podaj powód.</div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" onclick="ppRejectClose()">Anuluj</button>
          <button type="button" class="btn btn-danger" onclick="ppRejectSave()">Odrzuć</button>
        </div>
      </div>
    </div>
  </div>
  ${toastContainer()}
  <script>
  (function(){
    var media=document.getElementById('ppMediaModal'), rejectM=document.getElementById('ppRejectModal');
    var show=function(el){var B=window.tabler||window.bootstrap; if(B&&B.Modal&&el) B.Modal.getOrCreateInstance(el).show();};
    var hide=function(el){var B=window.tabler||window.bootstrap; if(B&&B.Modal&&el){var m=B.Modal.getInstance(el); if(m) m.hide();}};
    window.ppMediaOpen=function(src){var img=document.getElementById('ppMediaImg'); if(img) img.src=src; show(media);};
    window.ppMediaClose=function(){hide(media);};
    window.ppRejectId=null;
    window.ppPostReject=function(id){window.ppRejectId=id; var r=document.getElementById('ppRejectReason'); if(r) r.value=''; var h=document.getElementById('ppRejectHint'); if(h) h.style.display='none'; show(rejectM);};
    window.ppRejectClose=function(){hide(rejectM); window.ppRejectId=null;};
    window.ppRejectSave=function(){
      var id=window.ppRejectId; if(!id) return;
      var reason=document.getElementById('ppRejectReason')?document.getElementById('ppRejectReason').value.trim():'';
      if(!reason){var h=document.getElementById('ppRejectHint'); if(h) h.style.display='block'; return;}
      ppPostSet(id,'rejected',reason);
      window.ppRejectClose();
    };
    window.ppPostSet=function(id,status,reason){
      var fd=new FormData();
      fd.append('status',status);
      if(reason) fd.append('reason',reason);
      fetch('/admin/posts/'+encodeURIComponent(id)+'/status',{method:'POST',body:fd})
        .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
        .then(function(resp){
          window.ppToast(resp.status==='rejected'?'Post odrzucony.':(resp.status==='approved'?'Post zatwierdzony.':'Zapisano.'),'success');
          // If the current filter no longer matches the new status, drop the row.
          var cur=new URLSearchParams(location.search).get('status');
          if(cur && cur!==resp.status){ var tr=document.querySelector('tr[data-id="'+id+'"]'); if(tr) tr.remove(); return; }
          var cell=document.querySelector('.pp-status-cell[data-id="'+id+'"]');
          if(cell){
            var s=resp.status;
            cell.innerHTML=s==='approved'?'<span class="badge bg-success-lt text-success">approved</span>':s==='pending'?'<span class="badge bg-warning-lt text-warning">pending</span>':'<span class="badge bg-danger-lt text-danger">rejected</span>';
          }
        })
        .catch(function(){window.ppToast('Nie udało się zapisać zmiany.','danger');});
    };
    window.ppPostBan=function(id,device){
      if(!window.confirm('Zbanować urządzenie '+device+'?')) return;
      fetch('/admin/posts/'+encodeURIComponent(id)+'/ban',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})})
        .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
        .then(function(){window.ppToast('Urządzenie autora zbanowane.','success');})
        .catch(function(){window.ppToast('Nie udało się zbanować.','danger');});
    };
  })();
  </script>
  ${toastScript()}`;

  return renderPage(c, 'Posty', '/admin/posts', body);
});

// Session-gated moderation (cookie auth, like events). Approve clears the reason.
pageRoutes.post('/posts/:id/status', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const db = c.env.DB;
  const id = c.req.param('id');
  const form = (await c.req.parseBody({ all: true }).catch(() => ({}))) as Record<string, unknown>;
  const rawStatus = Array.isArray(form.status) ? String(form.status[0]) : String(form.status ?? '');
  const status = rawStatus === 'approved' || rawStatus === 'pending' || rawStatus === 'rejected' ? rawStatus : null;
  if (!status) return c.json({ error: 'Invalid status' }, 400);
  const reasonRaw = Array.isArray(form.reason) ? String(form.reason[0]) : String(form.reason ?? '');
  const reason = reasonRaw.trim() || null;
  if (status === 'rejected') {
    await db.prepare('UPDATE posts SET status = ?, rejection_reason = ? WHERE id = ?').bind(status, reason, id).run();
  } else {
    await db.prepare('UPDATE posts SET status = ?, rejection_reason = NULL WHERE id = ?').bind(status, id).run();
  }
  return c.json({ ok: true, status });
});

pageRoutes.post('/posts/:id/ban', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const db = c.env.DB;
  const id = c.req.param('id');
  const author = await db.prepare('SELECT u.device_id FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=?').bind(id).first<{ device_id: string }>();
  if (!author) return c.json({ error: 'Post not found' }, 404);
  await db.prepare(
    'INSERT INTO banned_devices (device_id, reason, banned_at) VALUES (?,?,?) ON CONFLICT(device_id) DO UPDATE SET reason=excluded.reason'
  ).bind(author.device_id, 'naruszenie treści (post live)', Date.now()).run();
  return c.json({ ok: true });
});

export function registerPosts(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
