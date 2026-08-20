// Reports page: user reports + moderation actions.

import { Hono } from 'hono';
import { empty, esc, fmtDate, pill } from '../../ui';
import { requireSession } from '../common';
import { STATUS_REJECTED } from '../../../core/models';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

pageRoutes.get('/reports', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(`SELECT r.id, r.post_id, r.reason, r.status, r.created_at,
      COALESCE(NULLIF(u.username,''), u.device_id) AS reporter,
      COALESCE(NULLIF(a.username,''), a.device_id) AS author, a.device_id AS author_device,
      p.thumb_key
    FROM reports r
    JOIN users u ON u.id = r.reporter_user_id
    JOIN posts p ON p.id = r.post_id
    JOIN users a ON a.id = p.user_id
    ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 200`).all();
  const rows = (results as any[]).map((r) => {
    const thumb = r.thumb_key
      ? `<img src="/media/${esc(r.thumb_key)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px" loading="lazy" />`
      : '—';
    const status = r.status === 'open' ? pill('open', 'warn') : pill(r.status, 'muted');
    const actions = r.status === 'open'
      ? `<div class="d-flex gap-1">
           <form method="post" action="/admin/reports/${esc(r.id)}/reject"><button class="btn btn-sm btn-danger">Odrzuć post</button></form>
           <form method="post" action="/admin/reports/${esc(r.id)}/ban"><button class="btn btn-sm btn-danger">Banuj urządzenie</button></form>
           <form method="post" action="/admin/reports/${esc(r.id)}/resolve"><button class="btn btn-sm btn-outline-secondary">Rozwiąż</button></form>
         </div>`
      : '—';
    return `<tr><td>${thumb}</td><td class="font-monospace">${esc(r.post_id.slice(0, 12))}</td>
      <td>${esc(r.reporter)}</td><td>${esc(r.author)}</td><td class="font-monospace">${esc(r.author_device)}</td>
      <td>${esc(r.reason)}</td><td>${fmtDate(r.created_at)}</td><td>${status}</td><td>${actions}</td></tr>`;
  }).join('');
  const body = `<h2 class="mb-3">Raporty treści</h2>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Media</th><th>Post</th><th>Zgłaszający</th><th>Autor</th><th>Device autora</th><th>Powód</th><th>Czas</th><th>Status</th><th>Akcje</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="9">${empty()} Brak raportów — pojawią się, gdy użytkownik zgłosi post w appce („Zgłoś").</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Raporty', '/admin/reports', body);
});

pageRoutes.post('/reports/:id/reject', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  const db = c.env.DB;
  const id = c.req.param('id');
  const report = await db.prepare('SELECT post_id FROM reports WHERE id = ?').bind(id).first<{ post_id: string }>();
  if (report) {
    await db.prepare('UPDATE posts SET status = ?, rejection_reason = ? WHERE id = ?').bind(STATUS_REJECTED, 'raport', report.post_id).run();
    await db.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(id).run();
  }
  return c.redirect('/admin/reports');
});

pageRoutes.post('/reports/:id/ban', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  const db = c.env.DB;
  const id = c.req.param('id');
  const report = await db.prepare('SELECT post_id FROM reports WHERE id = ?').bind(id).first<{ post_id: string }>();
  if (report) {
    const author = await db.prepare('SELECT u.device_id FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?').bind(report.post_id).first<{ device_id: string }>();
    if (author) {
      await db
        .prepare('INSERT INTO banned_devices (device_id, reason, banned_at) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET reason = excluded.reason')
        .bind(author.device_id, 'naruszenie treści (raport)', Date.now())
        .run();
    }
    await db.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(id).run();
  }
  return c.redirect('/admin/reports');
});

pageRoutes.post('/reports/:id/resolve', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  await c.env.DB.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(c.req.param('id')).run();
  return c.redirect('/admin/reports');
});

export function registerReports(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
