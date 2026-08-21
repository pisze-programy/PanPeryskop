// Errors page: client error monitor — stat cards, type facets, per-day bars,
// filterable table with expandable meta + pagination, rich empty state.

import { Hono } from 'hono';
import { bars, empty, esc, fmtDate, pill, pagination, icon } from '../../ui';
import { requireSession } from '../common';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();
const PAGE_SIZE = 25;
const DAYS_OPTIONS = [7, 14, 30];

function typePill(t: string): string {
  return t === 'upload_failed' ? pill(t, 'err') : t === 'stale_drop' ? pill(t, 'warn') : `<span class="badge bg-secondary-lt text-muted">${esc(t)}</span>`;
}

pageRoutes.get('/errors', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const daysRaw = parseInt(String(q.days || '7'), 10);
  const days = DAYS_OPTIONS.includes(daysRaw) ? daysRaw : 7;
  const type = q.type ? String(q.type) : null;
  const search = q.q ? String(q.q) : null;
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);
  const since = Date.now() - days * 86_400_000;

  // ---- Stat cards (window-only; not affected by type/search) ----
  const [c24, c7d, c30d, unique] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(Date.now() - 86_400_000).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(Date.now() - 7 * 86_400_000).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(Date.now() - 30 * 86_400_000).first<{ n: number }>(),
    db.prepare('SELECT COUNT(DISTINCT device_id) n FROM client_errors WHERE created_at>=?').bind(since).first<{ n: number }>(),
  ]);

  const statCard = (label: string, value: number, color = '') => `<div class="col-sm-6 col-xl-3">
    <div class="card card-sm"><div class="card-body">
      <div class="row align-items-center">
        <div class="col-auto"><span class="avatar bg-danger-lt text-danger">${icon('alert-triangle')}</span></div>
        <div class="col">
          <div class="text-secondary text-uppercase fw-bold fs-6">${label}</div>
          <div class="h2 mb-0 ${color}">${value}</div>
        </div>
      </div>
    </div></div></div>`;
  const statRow = `<div class="row row-deck row-cards mb-3">
    ${statCard('Błędy · 24 h', c24?.n ?? 0, (c24?.n ?? 0) > 0 ? 'text-danger' : '')}
    ${statCard('Błędy · 7 dni', c7d?.n ?? 0, (c7d?.n ?? 0) > 0 ? 'text-danger' : '')}
    ${statCard('Błędy · 30 dni', c30d?.n ?? 0)}
    ${statCard('Unikalne urządzenia', unique?.n ?? 0)}
  </div>`;

  // ---- Facets + series ----
  const [facets, series] = await Promise.all([
    db.prepare('SELECT error_type, COUNT(*) n FROM client_errors WHERE created_at>=? GROUP BY error_type ORDER BY n DESC LIMIT 10').bind(since).all<{ error_type: string; n: number }>(),
    db.prepare(`SELECT date(created_at/1000,'unixepoch','+2 hours') d, COUNT(*) n
                FROM client_errors WHERE created_at>=? GROUP BY d ORDER BY d`).bind(since).all<{ d: string; n: number }>(),
  ]);
  const facetRows = (facets.results ?? []).map((f) => {
    const href = `/admin/errors?days=${days}&type=${encodeURIComponent(f.error_type)}`;
    return `<a class="list-group-item d-flex align-items-center justify-content-between" href="${esc(href)}">
      <span>${typePill(f.error_type)}</span>
      <span class="text-secondary">${f.n} ${icon('chevron-right')}</span>
    </a>`;
  }).join('');
  const typeCard = `<div class="card">
    <div class="card-header"><h3 class="card-title">Błędy wg typu</h3></div>
    <div class="list-group list-group-flush">
      ${facetRows || `<div class="list-group-item text-secondary">Brak danych.</div>`}
      <a class="list-group-item d-flex align-items-center" href="/admin/errors?days=${days}">
        <span class="text-secondary">Wszystkie typy</span><span class="ms-auto text-secondary">${(c7d?.n ?? 0) > 0 ? c7d?.n : '—'}</span>
      </a>
    </div>
  </div>`;
  const seriesCard = `<div class="card">
    <div class="card-header"><h3 class="card-title">Błędy dziennie</h3>
      <div class="card-actions text-secondary">${days} dni · Warszawa</div></div>
    <div class="card-body">${bars((series.results ?? []).map((s) => ({ label: s.d.slice(5), value: s.n })))}</div>
  </div>`;

  // ---- List query ----
  let where = 'e.created_at>=?';
  const binds: unknown[] = [since];
  if (type) { where += ' AND e.error_type=?'; binds.push(type); }
  if (search) { where += ' AND (e.message LIKE ? OR e.meta LIKE ? OR e.device_id LIKE ?)'; binds.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const [rows, cnt] = await Promise.all([
    db.prepare(`SELECT e.id, e.created_at, e.device_id, e.error_type, e.message, e.meta,
        COALESCE(NULLIF(u.username,''), u.device_id) AS username,
        (b.device_id IS NOT NULL) AS banned, b.reason AS ban_reason
      FROM client_errors e
      LEFT JOIN users u ON u.device_id = e.device_id
      LEFT JOIN banned_devices b ON b.device_id = e.device_id
      WHERE ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`).bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE).all<any>(),
    db.prepare(`SELECT COUNT(*) n FROM client_errors e WHERE ${where}`).bind(...binds).first<{ n: number }>(),
  ]);
  const total = cnt?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rowsHtml = ((rows.results ?? []) as any[]).map((e) => {
    let meta = '';
    try { meta = e.meta ? JSON.stringify(JSON.parse(e.meta), null, 2) : ''; } catch { meta = e.meta || ''; }
    const userLine = e.username ? `<div class="text-secondary fs-6">${esc(e.username)}${e.banned ? ` ${pill('BAN', 'err')}` : ''}</div>` : '';
    return `<tr>
      <td>${fmtDate(e.created_at)}</td>
      <td><span class="font-monospace fs-6">${esc(String(e.device_id || '').slice(0, 12))}</span>${userLine}</td>
      <td>${typePill(e.error_type)}</td>
      <td class="text-truncate" style="max-width:20rem" title="${esc(e.message || '')}">${esc(String(e.message || '').slice(0, 160))}</td>
      <td><button class="btn btn-sm btn-icon btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#e_${esc(e.id)}" title="Meta">${icon('chevron-down')}</button></td>
    </tr>
    <tr class="collapse" id="e_${esc(e.id)}">
      <td colspan="5" class="bg-surface-secondary">${meta ? `<pre class="m-0 font-monospace text-break">${esc(meta)}</pre>` : '<span class="text-secondary">—</span>'}</td>
    </tr>`;
  }).join('');

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    qs.set('days', String(days));
    if (type) qs.set('type', type);
    if (search) qs.set('q', search);
    qs.set('page', String(p));
    return `/admin/errors?${qs}`;
  };

  const alertHtml = (c7d?.n ?? 0) > 0
    ? `<div class="alert alert-danger d-flex align-items-center mb-3" role="alert">
        ${icon('alert-triangle', 'icon me-2')}
        <div><strong>${c7d?.n}</strong> błędów w ostatnich 7 dniach.</div></div>`
    : '';

  const filterBar = `<form method="get" action="/admin/errors" class="row g-2 mb-3">
    <div class="col-6 col-md-2">
      <label class="form-label">Okres</label>
      <select name="days" class="form-select" onchange="this.form.submit()">${DAYS_OPTIONS.map((d) => `<option value="${d}" ${days === d ? 'selected' : ''}>${d} dni</option>`).join('')}</select>
    </div>
    <div class="col-6 col-md-2">
      <label class="form-label">Typ</label>
      <select name="type" class="form-select" onchange="this.form.submit()">
        <option value="">Wszystkie typy</option>
        ${(facets.results ?? []).map((f) => `<option value="${esc(f.error_type)}" ${type === f.error_type ? 'selected' : ''}>${esc(f.error_type)}</option>`).join('')}
      </select>
    </div>
    <div class="col-6 col-md-4">
      <label class="form-label">Szukaj</label>
      <div class="input-icon">
        <span class="input-icon-addon">${icon('search')}</span>
        <input name="q" class="form-control" value="${esc(search || '')}" placeholder="message, meta, device_id…" />
      </div>
    </div>
    <div class="col-6 col-md-2 d-flex align-items-end">
      <a class="btn btn-outline-secondary" href="/admin/errors">Wyczyść</a>
    </div>
  </form>`;

  const emptyState = `<tr><td colspan="5">
    <div class="empty">
      <div class="empty-icon">${icon('alert-triangle', 'icon icon-2xl')}</div>
      <p class="empty-title">Brak błędów klienta</p>
      <p class="empty-subtitle text-secondary">${search || type ? 'Brak wyników dla wybranych filtrów.' : 'Nieudane background-uploady trafiają tu z iOS (DLQ). Crashy raportuje Apple — App Store Connect → TestFlight → Crash Reports.'}</p>
      ${search || type ? '<div class="empty-action"><a class="btn btn-outline-secondary" href="/admin/errors">Wyczyść filtry</a></div>' : ''}
    </div></td></tr>`;

  const header = `<div class="page-header d-print-none mb-3">
    <div class="row align-items-center">
      <div class="col">
        <h2 class="page-title">Błędy klienta</h2>
        <div class="text-secondary">Nieudane background-uploady → DLQ. Crashy raportuje Apple (TestFlight → Crash Reports).</div>
      </div>
      <div class="col-auto ms-auto">
        <a class="btn btn-outline-secondary" href="/admin/errors">Odśwież</a>
      </div>
    </div>
  </div>`;

  const body = `${header}${alertHtml}${statRow}
  <div class="row row-cards mb-3">
    <div class="col-12 col-lg-4">${typeCard}</div>
    <div class="col-12 col-lg-8">${seriesCard}</div>
  </div>
  ${filterBar}
  <div class="card mb-3">
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Czas</th><th>Device</th><th>Typ</th><th>Message</th><th class="w-1"></th></tr></thead>
      <tbody>${rowsHtml || emptyState}</tbody></table></div>
    <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
      <p class="m-0 text-secondary">Strona ${page} z ${totalPages} · ${total} błędów</p>
      ${pagination(page, totalPages, pageHref)}
    </div>
  </div>`;

  return renderPage(c, 'Błędy', '/admin/errors', body);
});

export function registerErrors(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
