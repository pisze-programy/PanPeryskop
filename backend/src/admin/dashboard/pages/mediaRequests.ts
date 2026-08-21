// Media Requests page: stat cards, Leaflet map with active/expired pins, top
// cities + users, filters, table with pagination.
// Client logic in /admin/static/js/pages/media-requests.js; markers bootstrapped
// inline (window.ppRequests). Leaflet loads from CDN (page assets).

import { Hono } from 'hono';
import { empty, esc, fmtDate, icon, initialsAvatar, pageHeader, pagination, pill, relAgo, safeJson, staticFilePath } from '../../ui';
import { CITIES, cityBbox, nearestCity } from '../../cities';
import { mediaRequestsSql, mediaRequestsCountSql, MediaRequestFilter } from '../../queries';
import { requireSession } from '../common';
import { MEDIA_REQUEST_TTL_MS } from '../../../core/models';
import { todayWarsaw } from '../../../seed/core/dates';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();
const PAGE_SIZE = 50;
const DAYS_OPTIONS = [7, 14, 30, 90];

pageRoutes.get('/media-requests', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const daysRaw = parseInt(String(q.days || '14'), 10);
  const days = DAYS_OPTIONS.includes(daysRaw) ? daysRaw : 14;
  const city = q.city ? String(q.city) : null;
  const userId = q.user ? String(q.user) : null;
  const from = q.from ? String(q.from) : null;
  const to = q.to ? String(q.to) : null;
  const activeOnly = q.active === '1';
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);
  const since = Date.now() - days * 86_400_000;

  const filter: MediaRequestFilter = {
    days, cityId: city, userId,
    fromMs: from ? Date.parse(`${from}T00:00:00+02:00`) : null,
    toMs: to ? Date.parse(`${to}T23:59:59.999+02:00`) : null,
    activeOnly, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  };
  const [c14, cToday, cActive, cUsers, topUsers, list, cnt] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM media_requests WHERE created_at>=?').bind(since).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) n FROM media_requests WHERE date(created_at/1000,'unixepoch','+2 hours')=?`).bind(todayWarsaw()).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM media_requests WHERE created_at>=?').bind(Date.now() - MEDIA_REQUEST_TTL_MS).first<{ n: number }>(),
    db.prepare('SELECT COUNT(DISTINCT user_id) n FROM media_requests WHERE created_at>=?').bind(since).first<{ n: number }>(),
    db.prepare(`SELECT COALESCE(NULLIF(u.username,''), u.device_id) AS user, r.user_id, COUNT(*) n, MAX(r.created_at) last_at
                FROM media_requests r JOIN users u ON r.user_id=u.id
                WHERE r.created_at>=? GROUP BY r.user_id ORDER BY n DESC, last_at DESC LIMIT 10`).bind(since).all<{ user: string; user_id: string; n: number; last_at: number }>(),
    Promise.resolve(mediaRequestsSql(filter)),
    Promise.resolve(mediaRequestsCountSql(filter)),
  ]);
  const listSql = list as unknown as { sql: string; binds: unknown[] };
  const countSql = cnt as unknown as { sql: string; binds: unknown[] };
  const rows = await db.prepare(listSql.sql).bind(...listSql.binds).all<any>();
  const cntRow = await db.prepare(countSql.sql).bind(...countSql.binds).first<{ n: number }>();
  const total = cntRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const results = (rows.results ?? []) as any[];

  const allForCities = await db.prepare('SELECT lat, lng FROM media_requests WHERE created_at>=?').bind(since).all<{ lat: number; lng: number }>();
  const cityCounts = new Map<string, number>();
  for (const r of allForCities.results ?? []) {
    const name = nearestCity(r.lat, r.lng);
    cityCounts.set(name, (cityCounts.get(name) ?? 0) + 1);
  }
  const topCities = [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCity = Math.max(1, ...topCities.map(([, n]) => n));

  const header = `<div class="mb-3">
    <h2 class="mb-2">Media Requests</h2>
    <div class="text-secondary fs-5">Piny „poproś o relację” od użytkowników. Aktywne przez 4 h od dodania, cooldown 30 min / user.</div>
  </div>`;

  const statCard = (label: string, value: number, color = '') => `<div class="col-sm-6 col-xl-2">
    <div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">${label}</div>
      <div class="h2 mb-0 ${color}">${value}</div>
    </div></div></div>`;
  const statRow = `<div class="row row-cards mb-3">
    ${statCard('Ostatnie 14 dni', c14?.n ?? 0)}
    ${statCard('Dziś', cToday?.n ?? 0, 'text-primary')}
    ${statCard('Aktywne teraz', cActive?.n ?? 0, (cActive?.n ?? 0) > 0 ? 'text-success' : '')}
    ${statCard('Miasta (14d)', topCities.length)}
    ${statCard('Użytkownicy (14d)', cUsers?.n ?? 0)}
  </div>`;

  const markers = results.map((r) => ({
    id: r.id, lat: Number(r.lat), lng: Number(r.lng), user: String(r.user || ''),
    city: nearestCity(r.lat, r.lng), at: r.created_at, active: r.created_at >= Date.now() - MEDIA_REQUEST_TTL_MS,
  }));

  const mapCard = `<div class="row g-3 mb-3">
    <div class="col-12 col-xl-8">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Mapa próśb</h3>
          <div class="card-actions">
            <span class="badge bg-success-lt text-success">● aktywne</span>
            <span class="badge bg-secondary-lt text-secondary">● wygasłe</span>
          </div>
        </div>
        <div class="ratio ratio-16x9"><div id="ppMap" class="w-100 h-100"></div></div>
      </div>
    </div>
    <div class="col-12 col-xl-4">
      <div class="card mb-3">
        <div class="card-header"><h3 class="card-title">Miasta</h3></div>
        <div class="card-body">${topCities.map(([name, n]) => `
          <div class="d-flex align-items-center mb-2 gap-2">
            <span class="text-secondary">${esc(name)}</span>
            <div class="progress flex-grow-1 progress-sm"><div class="progress-bar" style="width:${Math.round((n / maxCity) * 100)}%"></div></div>
            <span class="text-muted text-end">${n}</span>
          </div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Użytkownicy</h3></div>
        <ul class="list-group list-group-flush">
          ${(topUsers.results ?? []).map((u) => `<li class="list-group-item d-flex align-items-center gap-2">
            ${initialsAvatar(u.user, u.user_id, 'avatar-sm')}
            <span class="text-truncate">${esc(u.user)}</span>
            <span class="text-muted ms-auto">${u.n}</span>
          </li>`).join('') || '<li class="list-group-item text-secondary">Brak danych.</li>'}
        </ul>
      </div>
    </div>
  </div>`;

  const cityOpts = `<option value="">Wszystkie miasta</option>` + CITIES.map((ct) =>
    `<option value="${ct.id}" ${city === ct.id ? 'selected' : ''}>${esc(ct.name)}</option>`).join('');
  const userOpts = `<option value="">Wszyscy użytkownicy</option>` + (topUsers.results ?? []).map((u) =>
    `<option value="${esc(u.user_id)}" ${userId === u.user_id ? 'selected' : ''}>${esc(u.user)}</option>`).join('');
  const filterBar = `<form method="get" action="/admin/media-requests" class="card mb-3"><div class="card-body">
    <div class="row g-2 align-items-end">
      <div class="col-6 col-md-2"><label class="form-label">Zakres</label>
        <select name="days" class="form-select" onchange="this.form.submit()">${DAYS_OPTIONS.map((d) => `<option value="${d}" ${days === d ? 'selected' : ''}>${d} dni</option>`).join('')}</select></div>
      <div class="col-6 col-md-2"><label class="form-label">Miasto</label><select name="city" class="form-select" onchange="this.form.submit()">${cityOpts}</select></div>
      <div class="col-6 col-md-3"><label class="form-label">Użytkownik</label><select name="user" class="form-select" onchange="this.form.submit()">${userOpts}</select></div>
      <div class="col-6 col-md-2"><label class="form-label">Data od</label><input name="from" type="date" class="form-control" value="${esc(from || '')}" onchange="this.form.submit()"></div>
      <div class="col-6 col-md-2"><label class="form-label">Data do</label><input name="to" type="date" class="form-control" value="${esc(to || '')}" onchange="this.form.submit()"></div>
      <div class="col-6 col-md-2">
        <label class="form-check"><input class="form-check-input" type="checkbox" name="active" value="1" ${activeOnly ? 'checked' : ''} onchange="this.form.submit()"> Aktywne tylko</label>
      </div>
      <div class="col-6 col-md-1 d-flex align-items-end"><a class="btn btn-outline-secondary" href="/admin/media-requests">Wyczyść</a></div>
    </div>
  </div></form>`;

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    qs.set('days', String(days));
    if (city) qs.set('city', city);
    if (userId) qs.set('user', userId);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (activeOnly) qs.set('active', '1');
    qs.set('page', String(p));
    return `/admin/media-requests?${qs}`;
  };

  const rowsHtml = results.map((r) => {
    const active = r.created_at >= Date.now() - MEDIA_REQUEST_TTL_MS;
    const city = nearestCity(r.lat, r.lng);
    const cityPill = city.startsWith('poza miastami') ? pill(city, 'muted') : pill(city, 'ok');
    return `<tr>
      <td><div class="d-flex align-items-center gap-2">
        ${initialsAvatar(r.user, r.user_id, 'avatar-sm')}
        <span>${esc(r.user)}</span></div></td>
      <td>${cityPill}</td>
      <td class="font-monospace">${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}</td>
      <td>${fmtDate(r.created_at)} <span class="text-muted fs-6">(${new Date(r.created_at).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' })} PL)</span></td>
      <td>${active ? pill('aktywne', 'ok') : pill('wygasłe', 'muted')}</td>
      <td class="text-secondary">${relAgo(r.created_at)}</td></tr>`;
  }).join('');

  const body = `${header}${statRow}${mapCard}${filterBar}
  <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
    <span class="text-secondary">${total} próśb · strona ${page} / ${totalPages}</span>
    ${pagination(page, totalPages, pageHref)}
  </div>
  <div class="card mb-3">
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Użytkownik</th><th>Miasto</th><th>Pozycja</th><th>Czas</th><th>Status</th><th>Wiek</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="6">${empty()}</td></tr>`}</tbody></table></div>
  </div>
  <script>window.ppRequests=${safeJson(markers)};window.ppReqTtl=${MEDIA_REQUEST_TTL_MS};</script>`;

  return renderPage(c, 'Media Requests', '/admin/media-requests', body, {
    css: ['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'],
    scripts: ['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', staticFilePath('media-requests')],
  });
});

export function registerMediaRequests(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
