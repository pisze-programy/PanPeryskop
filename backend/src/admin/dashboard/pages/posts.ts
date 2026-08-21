// Posts page (live): audit + takedown — stat cards, filters, table with dropdown
// moderation actions (approve/reject/ban), reject-reason modal, toasts.
// Client logic in /admin/static/js/pages/posts.js.

import { Hono } from 'hono';
import { cards, empty, esc, fmtDate, icon, initialsAvatar, mediaModal, pageHeader, pagination, pill, relAgo, staticFilePath, thumbAvatar } from '../../ui';
import { postsSql, postsCountSql, postStatusCounts, PostsFilter } from '../../queries';
import { requireSession } from '../common';
import { STATUS_REJECTED } from '../../../core/models';
import { jsStr } from '../../utils/esc';
import { truncate } from '../../utils/fmt';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();
const PAGE_SIZE = 50;

function statusPill(s: string): string {
  return s === 'approved' ? pill('approved', 'ok') : s === 'pending' ? pill('pending', 'warn') : pill('rejected', 'err');
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

  const header = pageHeader({
    title: 'Posty (live)',
    subtitle: '<div class="page-subtitle text-secondary">Treści użytkowników z feeda na żywo (TTL 24 h)</div>',
    actions: `<a href="/admin/posts" class="btn btn-outline-secondary" title="Odśwież">${icon('refresh')}</a>`,
  });

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

  const rowsHtml = (results as any[]).map((p) => {
    const desc = String(p.description || '');
    const mediaUrl = p.media_key || p.thumb_key || '';
    const bannedTag = p.banned ? ` · ${pill('BAN', 'err')}` : '';
    const typeBadge = p.type ? `<span class="badge bg-secondary-lt text-secondary ms-1">${esc(p.type)}</span>` : '';
    const reportBadge = p.open_reports ? `<span class="badge bg-warning-lt text-warning ms-1">raport ×${p.open_reports}</span>` : '';
    const rejectReason = p.status === 'rejected' && p.rejection_reason ? `<div class="text-danger fs-6">${esc(String(p.rejection_reason))}</div>` : '';
    return `<tr data-id="${esc(p.id)}">
      <td>${p.thumb_key || p.media_key ? `<a href="javascript:void(0)" onclick="ppMediaOpen('/media/${esc(mediaUrl)}');return false;" title="Podgląd">${thumbAvatar(`/media/${esc(mediaUrl)}`)}</a>` : '—'}</td>
      <td>
        <div class="d-flex align-items-center">
          ${initialsAvatar(p.author, p.user_id, 'avatar-sm me-2')}
          <div>
            <div class="fw-semibold">${esc(p.author)}</div>
            <div class="text-muted fs-6 font-monospace">${esc(p.device_id || '')}${bannedTag}</div>
          </div>
        </div>
      </td>
      <td title="${esc(desc)}">
        ${esc(truncate(desc, 80))}${typeBadge}${reportBadge}${rejectReason}
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

  const emptyRow = `<tr><td colspan="7">${empty({
    icon: icon('photo'),
    title: status || type || search || reported ? 'Brak wyników dla filtrów' : 'Brak postów (live)',
    subtitle: status === 'pending' ? 'Posty live są zatwierdzane automatycznie — kolejka jest zwykle pusta.' : 'Zmniejsz zakres filtrów lub sprawdź później.',
    action: status || type || search || reported ? '<a class="btn btn-primary" href="/admin/posts">Wyczyść filtry</a>' : '',
  })}</td></tr>`;

  const body = `${header}${statRow}${filterBar}${pager}
  <div class="card mb-3">
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Media</th><th>Autor</th><th>Opis</th><th>Czas</th><th>Engagement</th><th>Status</th><th class="text-end">Akcje</th></tr></thead>
      <tbody>${rowsHtml || emptyRow}</tbody></table></div>
  </div>
  ${pager}
  ${mediaModal()}
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
  <script src="${staticFilePath('posts')}"></script>`;

  return renderPage(c, 'Posty', '/admin/posts', body, { scripts: [staticFilePath('posts')] });
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
