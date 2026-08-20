// Errors page: client error log.

import { Hono } from 'hono';
import { empty, esc, fmtDate, pill } from '../../ui';
import { requireSession } from '../common';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

pageRoutes.get('/errors', async (c) => {
  const db = c.env.DB;
  const since = Date.now() - 7 * 86400000;
  const { results } = await db.prepare('SELECT * FROM client_errors WHERE created_at>=? ORDER BY created_at DESC LIMIT 200').bind(since).all();
  const rows = (results as any[]).map((e) => `<tr>
    <td>${fmtDate(e.created_at)}</td><td class="font-monospace">${esc(e.device_id || '—')}</td>
    <td>${pill(esc(e.error_type), 'err')}</td><td>${esc((e.message || '').slice(0, 80))}</td>
    ${e.meta ? `<td class="font-monospace text-truncate w-25" title="${esc(e.meta)}">${esc(e.meta.slice(0, 50))}</td>` : '<td>—</td>'}</tr>`).join('');
  const body = `<h2 class="mb-3">Błędy klienta</h2>
  <p class="text-secondary">Błędy zgłaszane przez appkę (nieudane background-uploady → DLQ). <strong>Crashy raportuje Apple</strong> — App Store Connect → TestFlight → Crash Reports, nie trafiają tutaj.</p>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Czas</th><th>Device</th><th>Typ</th><th>Message</th><th>Meta</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">${empty()} Brak błędów uploadu w ostatnich 7 dniach.</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Błędy', '/admin/errors', body);
});

export function registerErrors(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
