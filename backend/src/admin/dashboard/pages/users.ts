// Users page: list with last-active column + filter.

import { Hono } from 'hono';
import { empty, esc, fmtDate, pill } from '../../ui';
import { requireSession } from '../common';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

// Relative "last active" label: przed chwilą / X min / X h / X dni temu, else date.
function relAgo(ms: number | null | undefined): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'przed chwilą';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min temu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h temu`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days} d. temu`;
  return fmtDate(ms);
}

pageRoutes.get('/users', async (c) => {
  const db = c.env.DB;
  const active = String(c.req.query('active') ?? '');
  let cond = '';
  const binds: unknown[] = [];
  if (active === 'never') cond = ' AND u.last_seen IS NULL';
  else if (active === '24h' || active === '7d' || active === '30d') {
    const h = active === '24h' ? 24 : active === '7d' ? 168 : 720;
    cond = ' AND u.last_seen >= ?';
    binds.push(Date.now() - h * 3600 * 1000);
  }
  const { results } = await db.prepare(`SELECT u.id, u.device_id, u.username, u.auth_provider, u.created_at, u.last_seen,
      (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id) AS post_count,
      (SELECT COUNT(*) FROM views v WHERE v.user_id=u.id) AS view_count,
      EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id=u.device_id) AS banned
      FROM users u WHERE 1=1${cond}
      ORDER BY (u.last_seen IS NULL), u.last_seen DESC, u.created_at DESC LIMIT 300`).bind(...binds).all();
  const actOpts = [['', 'Wszyscy'], ['24h', '24 h'], ['7d', '7 dni'], ['30d', '30 dni'], ['never', 'Nigdy (brak aktywności)']]
    .map(([v, l]) => `<option value="${v}" ${active === v ? 'selected' : ''}>${l}</option>`).join('');
  const rows = (results as any[]).map((u) => `<tr>
    <td class="font-monospace">${esc(u.device_id)}</td><td>${esc(u.username || '—')}</td>
    <td>${esc(u.auth_provider)}</td><td>${fmtDate(u.created_at)}</td>
    <td>${u.last_seen ? relAgo(u.last_seen) : '<span class="text-muted">—</span>'}</td>
    <td>${u.post_count}</td><td>${u.view_count}</td>
    <td>${u.banned ? pill('BAN', 'err') : pill('ok', 'ok')}</td></tr>`).join('');
  const body = `<h2 class="mb-3">Użytkownicy</h2>
  <form method="get" action="/admin/users" class="row g-2 mb-3">
    <div class="col-6 col-md-3"><label class="form-label">Aktywność</label><select name="active" class="form-select" onchange="this.form.submit()">${actOpts}</select></div>
    <div class="col-6 col-md-3 d-flex align-items-end"><a class="btn btn-outline-secondary" href="/admin/users">Wyczyść</a></div>
  </form>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Device</th><th>Username</th><th>Provider</th><th>Utworzony</th><th>Ostatnia aktywność</th><th>Posty</th><th>Views</th><th>Status</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="8">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Użytkownicy', '/admin/users', body);
});

export function registerUsers(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
