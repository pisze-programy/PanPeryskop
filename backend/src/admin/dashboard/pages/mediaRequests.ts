// Media Requests page.

import { Hono } from 'hono';
import { empty, esc, fmtDate } from '../../ui';
import { nearestCity } from '../../queries';
import { requireSession } from '../common';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

pageRoutes.get('/media-requests', async (c) => {
  const db = c.env.DB;
  const since = Date.now() - 14 * 86400000;
  const { results } = await db.prepare(`SELECT r.id, r.lat, r.lng, r.created_at, COALESCE(NULLIF(u.username,''), u.device_id) AS user
    FROM media_requests r JOIN users u ON r.user_id=u.id WHERE r.created_at>=? ORDER BY r.created_at DESC LIMIT 200`).bind(since).all();
  const rows = (results as any[]).map((r) => `<tr>
    <td>${fmtDate(r.created_at)}</td><td>${esc(r.user)}</td>
    <td class="font-monospace">${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}</td>
    <td>${esc(nearestCity(r.lat, r.lng))}</td></tr>`).join('');
  const body = `<h2 class="mb-3">Media Requests</h2>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Czas</th><th>Użytkownik</th><th>Pozycja</th><th>Miasto</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Media Requests', '/admin/media-requests', body);
});

export function registerMediaRequests(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
