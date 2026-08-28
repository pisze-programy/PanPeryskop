// Blacklist page: rules that drop seed events before ingest (title + venue +
// organizer). Client logic in /admin/static/js/pages/blacklist.js; match counts
// are computed server-side against the current event posts.

import { Hono } from 'hono';
import {
  badge, card, cardHeader, empty, esc, icon, jsStr, pageHeader, safeJson, staticFilePath, table,
} from '../../ui';
import { requireSession } from '../common';
import { blacklistMatch, ruleFromRow } from '../../../seed/core/blacklist';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

function candFromPost(r: { description: string | null; partner_id?: string | null }) {
  const desc = r.description || '';
  const m = /^(.+?):\s*\d{2}:\d{2},\s*(.*)$/.exec(desc);
  return {
    title: m ? m[1].trim() : desc.trim(),
    venue: m ? (m[2].split(',')[0] || '').trim() : '',
    partnerId: r.partner_id || null,
  };
}

pageRoutes.get('/blacklist', async (c) => {
  const db = c.env.DB;
  const msg = c.req.query('msg') ? String(c.req.query('msg')) : null;

  const { results: rules } = await db
    .prepare('SELECT id, pattern, venue, partner_id, partner_name, note, active, created_at FROM event_blacklist ORDER BY created_at DESC')
    .all<{ id: string; pattern: string | null; venue: string | null; partner_id: string | null; partner_name: string | null; note: string | null; active: number | null; created_at: number }>();
  const { results: posts } = await db.prepare(
    "SELECT description, partner_id FROM posts WHERE category='events' AND status IN ('approved','pending')"
  ).all<{ description: string | null; partner_id: string | null }>();
  const postCands = (posts ?? []).map(candFromPost);

  const nActive = (rules ?? []).filter((r) => r.active !== 0).length;
  const header = pageHeader({
    pretitle: 'Panel · Antyspam',
    title: `Blacklista <span class="badge bg-danger-lt text-danger ms-2">${nActive} aktywnych</span>`,
    subtitle: 'Wydarzenia seeda dopasowane do wzorca (tytuł/venue/organizator) są odrzucane przed wsadem — to samo dopasowanie co w dedupe.',
  });

  const formFields = `
    <div class="row g-2">
      <div class="col-12 col-md-6">
        <label class="form-label">Wzorzec tytułu <span class="text-secondary">(opcjonalnie)</span></label>
        <input id="ppBlPattern" class="form-control" placeholder="np. Koncert Chopinowski W Najpiękniejszej Sali Koncertowej Fryderyk" maxlength="200" oninput="ppBlPreview()" />
      </div>
      <div class="col-6 col-md-3">
        <label class="form-label">Venue <span class="text-secondary">(opcjonalnie)</span></label>
        <input id="ppBlVenue" class="form-control" placeholder="np. Sala Koncertowa Fryderyk" maxlength="200" oninput="ppBlPreview()" />
      </div>
      <div class="col-6 col-md-3">
        <label class="form-label">Partner id <span class="text-secondary">(opcjonalnie)</span></label>
        <input id="ppBlPartnerId" class="form-control" placeholder="np. 2107" maxlength="50" oninput="ppBlPreview()" />
      </div>
      <div class="col-6 col-md-3">
        <label class="form-label">Organizator <span class="text-secondary">(etykieta)</span></label>
        <input id="ppBlPartnerName" class="form-control" placeholder="np. Agencja Presto" maxlength="200" oninput="ppBlPreview()" />
      </div>
      <div class="col-6 col-md-3">
        <label class="form-label">Notatka</label>
        <input id="ppBlNote" class="form-control" placeholder="dlaczego" maxlength="200" />
      </div>
    </div>
    <div class="text-secondary fs-5 mt-2" id="ppBlHint">Wymagany wzorzec tytułu <strong>lub</strong> organizator. Dopasowanie: zawieranie tokenów tytułu (≥0.8) ORAZ venue (jeśli podane) ORAZ partner_id (jeśli podany).</div>`;

  const addCard = card({
    header: cardHeader({
      title: 'Dodaj regułę',
      actions: `<button class="btn btn-primary" type="button" onclick="ppBlAdd()">${icon('plus')} Dodaj</button>`,
    }),
    body: formFields,
    class: 'mb-3',
  });

  const rows = (rules ?? []).map((r) => {
    const rule = { active: r.active !== 0, ...ruleFromRow(r) };
    const matches = postCands.filter((pc) =>
      blacklistMatch({ pattern: rule.pattern, venue: rule.venue, partnerId: rule.partnerId }, pc)).length;
    const partnerTxt = [r.partner_name, r.partner_id ? `#${r.partner_id}` : ''].filter(Boolean).join(' ') || '—';
    const statusBadge = rule.active
      ? badge('Aktywna', 'bg-success-lt text-success')
      : badge('Wyłączona', 'bg-secondary-lt text-secondary');
    return `<tr>
      <td class="fw-semibold">${esc(r.pattern || '—')}${r.pattern ? (r.note ? ` <span class="text-muted fs-6" title="${esc(r.note)}">ℹ</span>` : '') : ''}</td>
      <td class="text-secondary">${esc(r.venue || '—')}</td>
      <td>${esc(partnerTxt)}</td>
      <td><span class="badge ${matches ? 'bg-danger-lt text-danger' : 'bg-secondary-lt text-secondary'}">${matches}</span></td>
      <td>${statusBadge}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-secondary" type="button" onclick="ppBlToggle('${esc(r.id)}', ${rule.active ? 0 : 1})">${rule.active ? 'Wyłącz' : 'Włącz'}</button>
        <button class="btn btn-sm btn-outline-danger ms-1" type="button" onclick="ppBlDelete('${esc(r.id)}','${jsStr(r.pattern || r.partner_name || '')}')">${icon('x')}</button>
      </td></tr>`;
  }).join('');

  const tableHtml = table({
    head: '<thead><tr><th>Wzorzec</th><th>Venue</th><th>Organizator</th><th>Dopasowania</th><th>Status</th><th class="text-end">Akcje</th></tr></thead>',
    rows: rows || `<tr><td colspan="6">${empty({ icon: icon('ban'), title: 'Brak reguł', subtitle: 'Dodaj pierwszą regułę wyżej lub z listy wydarzeń.' })}</td></tr>`,
  });

  const msgHtml = msg === 'added' ? '<div class="alert alert-success">Reguła dodana.</div>' : '';

  const body = `${header}${msgHtml}${addCard}${tableHtml}
  <script>window.ppBlPartners=${safeJson([...new Set((posts ?? []).map((p) => p.partner_id).filter((x): x is string => !!x))])};</script>
  <script src="${staticFilePath('blacklist')}"></script>`;

  return renderPage(c, 'Blacklista', '/admin/blacklist', body);
});

pageRoutes.post('/blacklist/:id/delete', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  await c.env.DB.prepare('DELETE FROM event_blacklist WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

pageRoutes.post('/blacklist/:id/toggle', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  const body = await c.req.json<{ active?: unknown }>().catch(() => ({})) as { active?: unknown };
  await c.env.DB.prepare('UPDATE event_blacklist SET active = ? WHERE id = ?').bind(body.active === true ? 1 : 0, c.req.param('id')).run();
  return c.json({ ok: true });
});

export function registerBlacklist(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
