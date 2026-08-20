// Tags page: add custom tags + per-tag distribution.

import { Hono } from 'hono';
import { cards, empty, esc, pill } from '../../ui';
import { requireSession } from '../common';
import { CANONICAL_TAG_SET } from '../../../seed/core/tags';
import { tagCatalog } from '../../../core/tagCatalog';
import { diacriticFold } from '../../../seed/core/match';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

function tagSlug(label: string): string {
  return diacriticFold(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

pageRoutes.get('/tags', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const msg = q.msg ? String(q.msg) : null;
  const catalog = await tagCatalog(db);

  const [total, tagged, locked] = await Promise.all([
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='events'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='events' AND tags IS NOT NULL AND tags <> '[]'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='events' AND tags_locked=1").first<{ n: number }>(),
  ]);
  const nTotal = total?.n ?? 0, nTagged = tagged?.n ?? 0;
  const nEmpty = nTotal - nTagged;

  // Per-tag distribution — aggregate the small JSON arrays server-side.
  const evTags = await db.prepare("SELECT tags FROM posts WHERE category='events' AND tags IS NOT NULL AND tags <> '[]'").all<{ tags: string }>();
  const counts = new Map<string, number>();
  for (const r of evTags.results ?? []) {
    let arr: string[] = [];
    try { const v = JSON.parse(r.tags); arr = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { /* ignore */ }
    for (const t of arr) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const known = new Map<string, { label: string; custom: boolean }>();
  for (const t of catalog) known.set(t.id, { label: t.label, custom: !CANONICAL_TAG_SET.has(t.id) });
  for (const id of counts.keys()) if (!known.has(id)) known.set(id, { label: id, custom: true });

  const distRows = [...known.entries()]
    .map(([id, info]) => ({ id, label: info.label, custom: info.custom, n: counts.get(id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'pl'))
    .map((d) => {
      const pct = nTagged ? Math.round((d.n / nTagged) * 100) : 0;
      return `<tr>
        <td><span class="badge bg-primary-lt text-primary">${esc(d.label)}</span> ${d.custom ? pill('custom', 'muted') : pill('kanon', 'ok')}</td>
        <td>${d.n}</td><td>${pct}%</td></tr>`;
    }).join('');

  const msgHtml = msg === 'added' ? `<div class="alert alert-success">Tag dodany.</div>`
    : msg === 'dup' ? `<div class="alert alert-warning">Tag już istnieje.</div>`
    : msg === 'invalid' ? `<div class="alert alert-warning">Nieprawidłowa nazwa taga.</div>` : '';

  const body = `<h2 class="mb-3">Tagi</h2>${msgHtml}
  ${cards([
    { label: 'Eventy (events)', value: nTotal },
    { label: 'Z tagiem', value: nTagged, color: 'success' },
    { label: 'Puste', value: nEmpty, color: nEmpty ? 'warning' : '' },
    { label: 'Zablokowane (admin)', value: locked?.n ?? 0 },
  ])}
  <div class="card mb-3"><div class="card-header"><h3 class="card-title mb-0">Dodaj nowy tag</h3></div>
    <div class="card-body">
      <form method="post" action="/admin/tags" class="d-flex gap-2" style="max-width:480px">
        <input name="label" class="form-control" placeholder="np. Sport" required />
        <button class="btn btn-primary flex-shrink-0">Dodaj</button>
      </form>
      <div class="text-secondary mt-2" style="font-size:12px">Nowy tag pojawi się w aplikacji (chipy mapy) i w edycji eventów. Kanoniczne tagi (Filmy, Muzyka…) są w kodzie i zawsze na liście. Tagi można tylko dodawać — usuwanie nie jest obsługiwane.</div>
    </div></div>
  <div class="card"><div class="card-header"><h3 class="card-title mb-0">Rozkład per tag</h3></div>
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Tag</th><th>Eventy</th><th>% z otagowanych</th></tr></thead>
      <tbody>${distRows || `<tr><td colspan="3">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Tagi', '/admin/tags', body);
});

pageRoutes.post('/tags', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  const db = c.env.DB;
  const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
  const label = String(form.label ?? '').trim();
  const id = tagSlug(label);
  if (!label || !id) return c.redirect('/admin/tags?msg=invalid');
  if (CANONICAL_TAG_SET.has(id)) return c.redirect('/admin/tags?msg=dup');
  const exists = await db.prepare('SELECT 1 FROM admin_tags WHERE id=?').bind(id).first();
  if (exists) return c.redirect('/admin/tags?msg=dup');
  await db.prepare('INSERT INTO admin_tags (id, label, created_at) VALUES (?, ?, ?)').bind(id, label, Date.now()).run();
  return c.redirect('/admin/tags?msg=added');
});

export function registerTags(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
