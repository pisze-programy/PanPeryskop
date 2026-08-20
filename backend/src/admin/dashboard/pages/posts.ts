// Posts page: live posts list.

import { Hono } from 'hono';
import { empty, esc, fmtDate, pill } from '../../ui';
import { requireSession } from '../common';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

// ---------- Posts ----------
pageRoutes.get('/posts', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(`SELECT p.id, p.description, p.created_at, p.status, p.type, p.thumb_key, p.likes_count, p.views_count,
    COALESCE(NULLIF(u.username,''), u.device_id) AS author FROM posts p JOIN users u ON p.user_id=u.id
    WHERE p.category='live' ORDER BY p.created_at DESC LIMIT 200`).all();
  const rows = (results as any[]).map((p) => `<tr>
    <td>${esc(p.author)}</td><td>${esc((p.description || '').slice(0, 50))}</td>
    <td>${fmtDate(p.created_at)}</td><td>${p.likes_count}</td><td>${p.views_count}</td>
    <td>${p.status === 'approved' ? pill('approved', 'ok') : pill(esc(p.status), 'err')}</td>
    ${p.thumb_key ? `<td><span class="avatar avatar-sm rounded"><img src="/media/${esc(p.thumb_key)}" loading="lazy" /></span></td>` : '<td>—</td>'}</tr>`).join('');
  const body = `<h2 class="mb-3">Posty (live)</h2>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Autor</th><th>Opis</th><th>Czas</th><th>Like</th><th>Views</th><th>Status</th><th>Media</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Posty', '/admin/posts', body);
});

export function registerPosts(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
