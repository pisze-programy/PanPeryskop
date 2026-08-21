// Events / Moderacja page: summary cards, advanced filters, table with badges +
// kebab actions, Tabler pagination, CSV export, geo override, in-place saves.

import { Hono } from 'hono';
import { bars, empty, esc, pagination, pill, relAgo, toastContainer, toastScript, icon } from '../../ui';
import { CITIES, cityBbox } from '../../cities';
import { eventsSql, eventsCountSql, nearestCity, EventFilter, eventSourceBreakdown, eventStatusBreakdown } from '../../queries';
import { requireSession } from '../common';
import { CANONICAL_TAG_SET } from '../../../seed/core/tags';
import { ProviderId } from '../../../seed/core/types';
import { tagCatalog, tagIdSet } from '../../../core/tagCatalog';
import { todayWarsaw } from '../../../seed/core/dates';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

// ---------- Events / Moderacja ----------
const EVENT_SOURCES = Object.values(ProviderId);

const SOURCE_BADGE: Record<string, string> = {
  helios: 'bg-red-lt text-red', cinemacity: 'bg-blue-lt text-blue', multikino: 'bg-cyan-lt text-cyan',
  going: 'bg-green-lt text-green', kupbilecik: 'bg-purple-lt text-purple', dzisapp: 'bg-pink-lt text-pink',
  eventylive: 'bg-orange-lt text-orange', luma: 'bg-teal-lt text-teal', meetup: 'bg-indigo-lt text-indigo',
};

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Escape a string for embedding inside a single-quoted JS string in an onclick
// attribute. Backslash first so the \uXXXX escapes we add stay literal.
function jsStr(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\u0027')
    .replace(/"/g, '\\u0022')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\n/g, '\\n');
}

function parseTags(t: string | null | undefined): string[] {
  if (!t) return [];
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

// "Tytuł: HH:MM, Lokalizacja" → { title, time, loc } — the seed description format.
function descParts(description: string): { title: string; time: string; loc: string } {
  const m = /^(.+?):\s*(\d{2}:\d{2}),\s*(.*)$/.exec(description || '');
  return m ? { title: m[1], time: m[2], loc: m[3] } : { title: description || '', time: '', loc: '' };
}

// Status dropdown — colored per status, auto-submits on change.
function statusSelect(e: { id: string; status: string }): string {
  const colorCls = e.status === 'approved' ? ' text-success' : e.status === 'pending' ? ' text-warning' : ' text-danger';
  const opts = ['approved', 'pending', 'rejected'].map((s) =>
    `<option value="${s}" ${e.status === s ? 'selected' : ''} class="text-${s === 'approved' ? 'success' : s === 'pending' ? 'warning' : 'danger'}">${s}</option>`).join('');
  return `<form method="post" action="/admin/events/${esc(e.id)}">
    <select name="status" class="form-select form-select-sm${colorCls}" onchange="ppUpdate('${esc(e.id)}', this.form)">${opts}</select>
    <input type="hidden" name="field" value="status" /></form>`;
}

// Tag dropdown — shows the first tag; a "+N" suffix notes extra tags. Saves merge.
function tagSelect(e: { id: string; status: string; tag: string; extra: number }, catalog: { id: string; label: string }[]): string {
  const hasTag = e.tag !== '';
  const missingCls = hasTag ? '' : ' text-warning';
  const opts = `<option value="" ${!hasTag ? 'selected' : ''}>— brak —</option>` + catalog.map((t) =>
    `<option value="${esc(t.id)}" ${e.tag === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  const lockIcon = `<span title="Tag ustawiony ręcznie">🔒</span>`;
  return `<form method="post" action="/admin/events/${esc(e.id)}">
    <select name="tags" class="form-select form-select-sm${missingCls}" onchange="ppUpdate('${esc(e.id)}', this.form)">${opts}</select>
    ${e.extra > 0 ? `<span class="text-muted fs-6">+${e.extra}</span>` : ''}
    <input type="hidden" name="field" value="tag" />
    <input type="hidden" name="status" value="${esc(e.status)}" />
    <span class="text-muted">${lockIcon}</span></form>`;
}

function eventThumb(e: { thumb_key?: string | null; media_key?: string | null }): string {
  const key = e.thumb_key || e.media_key;
  const full = e.media_key || e.thumb_key;
  if (!key) return '—';
  return `<a href="javascript:void(0)" onclick="ppMediaOpen('/media/${esc(full)}');return false;" title="Podgląd">
    <span class="avatar avatar-sm rounded"><img src="/media/${esc(key)}" alt="" loading="lazy" onerror="this.closest('.avatar').classList.add('bg-secondary-lt')" /></span></a>`;
}

// Title: opens the event link (resolved per selected showtime).
function titleHtml(linkUrl: string | null, title: string, id: string, source: string): string {
  const t = esc(title || '—');
  const src = `<span class="text-muted fs-6">(${esc(source)})</span>`;
  if (linkUrl) {
    return `<a href="javascript:void(0)" onclick="ppOpenLink(ppLinkFor('${esc(id)}', '${jsStr(linkUrl)}'));return false;" class="text-reset text-decoration-none">${t}</a> ${src}`;
  }
  return `<a href="javascript:void(0)" onclick="ppAlertOpen('Błąd danych','Wydarzenie nie ma linku (${esc(id)}). Eventy zawsze powinny mieć link.');return false;" class="text-danger text-decoration-none">${t} ⚠</a> ${src}`;
}

function cityByLoc(loc: string): string | null {
  const l = norm(loc);
  for (const ct of CITIES) {
    if (l.includes(norm(ct.name))) return ct.id;
  }
  return null;
}

function placeUrls(lat: number | null, lng: number | null, loc: string): { embed: string | null; plain: string | null } {
  let base: string | null = null;
  if (lat != null && lng != null) base = `https://www.google.com/maps?q=${lat},${lng}`;
  else {
    const cid = cityByLoc(loc);
    if (cid) {
      const b = cityBbox(cid);
      if (b) base = `https://www.google.com/maps?q=${b.swLat + (b.neLat - b.swLat) / 2},${b.swLng + (b.neLng - b.swLng) / 2}`;
    }
  }
  return base ? { embed: `${base}&output=embed`, plain: base } : { embed: null, plain: null };
}

function placeLabel(loc: string, lat: number | null, lng: number | null): string {
  const city = lat != null && lng != null ? nearestCity(lat, lng) : '';
  const venue = (loc.split(',')[0] || '').trim();
  if (!city && !venue) return '--- Brak';
  return [city, venue].filter(Boolean).join(', ');
}

const PIN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="icon align-middle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#icon-map-pin"/></svg>`;

function placeHtml(lat: number | null, lng: number | null, loc: string): string {
  const label = esc(placeLabel(loc, lat, lng));
  const urls = placeUrls(lat, lng, loc);
  if (!urls.embed) return `<div class="text-secondary fs-4">${PIN_ICON} ${label}</div>`;
  return `<div class="text-secondary fs-4"><a href="javascript:void(0)" onclick="ppLinkOpen('${jsStr(urls.embed)}', '${jsStr(urls.plain!)}');return false;" class="text-reset text-decoration-none">${PIN_ICON} ${label}</a></div>`;
}

function placeCellHtml(id: string, lat: number | null, lng: number | null, loc: string): string {
  return `<div class="pp-place-cell" data-id="${esc(id)}">${placeHtml(lat, lng, loc)}</div>`;
}

function geoButtonHtml(id: string, loc: string, lat: number | null, lng: number | null): string {
  return `<button type="button" class="btn btn-sm btn-icon btn-outline-secondary pp-geo-btn" data-id="${esc(id)}" title="Zmień GEO" onclick="ppGeoOpen('${esc(id)}','${jsStr(loc)}','${lat ?? ''}','${lng ?? ''}')">⋯</button>`;
}

function rewriteLoc(description: string, name: string): string | null {
  const m = /^(.+?):\s*(\d{2}:\d{2}),\s*(.*)$/.exec(description || '');
  if (m) return `${m[1]}: ${m[2]}, ${name}`;
  return null;
}

function parseShowtimes(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

function bookingURLFor(bookingJson: string | null | undefined, time: string, linkUrl: string | null): string | null {
  if (!bookingJson) return null;
  let entries: Array<{ time?: string; kind?: string; params?: Record<string, string> }> = [];
  try { entries = JSON.parse(bookingJson); } catch { return null; }
  const b = entries.find((x) => x.time === time);
  if (!b || !b.kind || !b.params) return null;
  const p = b.params;
  if (b.kind === 'helios') {
    if (p.screen && p.cinema && p.itemId && p.itemSourceId && linkUrl)
      return `https://bilety.helios.pl/screen/${p.screen}?cinemaId=${p.cinema}&backUrl=${encodeURIComponent(linkUrl)}&item_id=${p.itemId}&item_source_id=${p.itemSourceId}`;
    return null;
  }
  if (b.kind === 'cinemacity') {
    if (p.order && p.cinema) return `https://tickets.cinema-city.pl/order/${p.order}?lang=pl&x-cinema=${p.cinema}`;
    return null;
  }
  if (b.kind === 'multikino') {
    if (p.cinemaId && p.filmId && p.sessionId) return `https://www.multikino.pl/rezerwacja-biletow/podsumowanie/${p.cinemaId}/${p.filmId}/${p.sessionId}`;
    return null;
  }
  return null;
}

function dateCell(e: { id: string; event_date?: string | null; showtimes?: string | null; time?: string }): string {
  const d = esc(e.event_date || '');
  const times = parseShowtimes(e.showtimes);
  if (times.length === 0) return `<div class="text-muted fs-5">${d}</div>`;
  if (times.length === 1) return `<div class="text-muted fs-5">${d} · ${esc(times[0])}</div>`;
  const opts = times.map((t, i) => `<option value="${esc(t)}" ${i === 0 ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const sel = `<select class="form-select form-select-sm w-25" onchange="window.ppSel['${esc(e.id)}']=this.value">${opts}</select>`;
  return `<div class="d-flex align-items-center gap-2">
    <span class="text-muted fs-5">${d}</span>${sel}
  </div>`;
}

// Row actions kebab — replaces the lone "⋯" geo button.
function rowActions(id: string, loc: string, lat: number | null, lng: number | null, url: string | null): string {
  return `<div class="dropdown text-end">
    <button class="btn btn-action dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Akcje">${icon('more-horizontal')}</button>
    <div class="dropdown-menu dropdown-menu-end">
      <a class="dropdown-item" href="#" onclick="ppGeoOpen('${esc(id)}','${jsStr(loc)}','${lat ?? ''}','${lng ?? ''}');return false;">Zmień GEO</a>
      <a class="dropdown-item" href="#" onclick="ppMediaOpen('/media/${esc(url ?? '')}');return false;">Podgląd mediów</a>
      <a class="dropdown-item" href="#" onclick="ppOpenLink(ppLinkFor('${esc(id)}', '${jsStr(url ?? '')}'));return false;">Otwórz link</a>
      <div class="dropdown-divider"></div>
      <a class="dropdown-item" href="#" onclick="ppCopyId('${esc(id)}');return false;">Kopiuj ID</a>
    </div>
  </div>`;
}

// Build the query-string for pager/segmented links from the current params.
function buildQs(params: Record<string, string>, overrides: Record<string, string | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (k !== 'page') qs.set(k, v);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === '') qs.delete(k);
    else qs.set(k, v);
  }
  return qs.toString();
}

pageRoutes.get('/events', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();

  // CSV export — same filters, capped rows, attachment.
  if (q.export === 'csv') {
    const session = await requireSession(c);
    if (!session) return c.redirect('/admin/login');
    const f: EventFilter = {
      cityId: q.city ? String(q.city) : null,
      source: q.source ? String(q.source) : null,
      status: q.status ? String(q.status) : null,
      from: q.from ? String(q.from) : null,
      to: q.to ? String(q.to) : null,
      tag: q.tag ? String(q.tag) : null,
      geo: q.geo ? String(q.geo) : null,
      fromMs: null, toMs: null,
      q: q.q ? String(q.q) : null,
      sources: q.sources ? String(q.sources).split(',').filter(Boolean) : null,
      limit: 50_000,
    };
    const { sql, binds } = eventsSql(f);
    const { results } = await db.prepare(sql).bind(...binds).all();
    const rows = (results as any[]).map((e) => {
      const { title, loc } = descParts(e.description);
      return { id: e.id, external_id: e.external_id, source: e.source, title, venue: loc, event_date: e.event_date, showtimes: e.showtimes, status: e.status, city: e.lat != null ? nearestCity(e.lat, e.lng) : '', lat: e.lat ?? '', lng: e.lng ?? '', link_url: e.link_url, created_at: e.created_at, is_sold_out: e.is_sold_out ?? 0, geo_locked: e.geo_locked ?? 0, tags_locked: e.tags_locked ?? 0 };
    });
    const head = ['id', 'external_id', 'source', 'title', 'venue', 'event_date', 'showtimes', 'status', 'city', 'lat', 'lng', 'link_url', 'created_at', 'is_sold_out', 'geo_locked', 'tags_locked'];
    const csv = [head, ...rows.map((r) => head.map((h) => { const v = (r as any)[h]; return v == null ? '' : `"${String(v).replace(/"/g, '""')}"`; }))].map((r) => r.join(',')).join('\n');
    return new Response(csv, {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="events-${todayWarsaw()}.csv"` },
    });
  }

  const cityId = q.city ? String(q.city) : null;
  const source = q.source ? String(q.source) : null;
  const sources = q.sources ? String(q.sources).split(',').filter(Boolean) : null;
  const status = q.status ? String(q.status) : null;
  const from = q.from ? String(q.from) : null;
  const to = q.to ? String(q.to) : null;
  const tag = q.tag ? String(q.tag) : null;
  const geo = q.geo ? String(q.geo) : null;
  const search = q.q ? String(q.q) : null;
  const cfrom = q.cfrom ? String(q.cfrom) : null;
  const cto = q.cto ? String(q.cto) : null;
  const limitRaw = parseInt(String(q.limit || '50'), 10);
  const PAGE_SIZE = [25, 50, 100, 200].includes(limitRaw) ? limitRaw : 50;
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);

  const fromMs = cfrom ? Date.parse(`${cfrom}T00:00:00+02:00`) : null;
  const toMs = cto ? Date.parse(`${cto}T23:59:59.999+02:00`) : null;

  const filter: EventFilter = {
    cityId, source, sources, status, from, to, tag, geo, fromMs, toMs,
    q: search, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  };
  const [{ sql, binds }, cnt, catalog, statusCnt, srcCnt, flagsCnt, untagged] = await Promise.all([
    Promise.resolve(eventsSql(filter)),
    eventsCountSql(filter),
    tagCatalog(db),
    eventStatusBreakdown(db),
    eventSourceBreakdown(db),
    db.prepare('SELECT geo_locked, tags_locked, is_sold_out, COUNT(*) n FROM posts WHERE category=\'events\' GROUP BY geo_locked, tags_locked, is_sold_out').all<{ geo_locked: number; tags_locked: number; is_sold_out: number; n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='events' AND (tags IS NULL OR tags='[]')").first<{ n: number }>(),
  ]);
  const { results } = await db.prepare(sql).bind(...binds).all();
  const cntRow = await db.prepare(cnt.sql).bind(...cnt.binds).first<{ n: number }>();
  const total = cntRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [geoLocked, tagsLocked, soldOut] = (() => {
    let gl = 0, tl = 0, so = 0;
    for (const r of flagsCnt.results ?? []) {
      if (r.geo_locked) gl = r.n;
      if (r.tags_locked) tl = r.n;
      if (r.is_sold_out) so = r.n;
    }
    return [gl, tl, so];
  })();
  const nUntagged = untagged?.n ?? 0;

  // ---- Page header ----
  const header = `<div class="page-header d-print-none mb-3">
    <div class="row align-items-center">
      <div class="col">
        <div class="page-pretitle">PanPeryskop Admin</div>
        <h2 class="page-title">Eventy
          <span class="badge bg-secondary-lt text-secondary ms-2">${statusCnt.approved + statusCnt.pending + statusCnt.rejected} wydarzeń</span>
          <a class="badge bg-warning-lt text-warning ms-1 text-decoration-none" href="/admin/events?status=pending">moderacja: ${statusCnt.pending}</a>
        </h2>
        <div class="text-secondary">Wydarzenia z ${srcCnt.length} źródeł</div>
      </div>
      <div class="col-auto">
        <div class="btn-list">
          <a class="btn btn-outline-secondary" href="/admin/events?status=pending">Moderacja</a>
          <a class="btn btn-primary" href="/admin/events?export=csv&${esc(buildQs(q, {}))}">${icon('download')} Eksport CSV</a>
        </div>
      </div>
    </div>
  </div>`;

  // ---- Stat cards ----
  const pctApproved = statusCnt.approved + statusCnt.pending + statusCnt.rejected > 0
    ? Math.round((statusCnt.approved / (statusCnt.approved + statusCnt.pending + statusCnt.rejected)) * 1000) / 10
    : 0;
  const statRowA = `<div class="row row-cards mb-3">
    <div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Razem wydarzeń</div>
      <div class="h2 mb-0" id="ppStat-total">${statusCnt.approved + statusCnt.pending + statusCnt.rejected}</div>
    </div></div></div>
    <div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Zaakceptowane</div>
      <div class="h2 mb-0 text-success" id="ppStat-approved">${statusCnt.approved} <span class="fs-5 text-muted">· ${pctApproved}%</span></div>
    </div></div></div>
    <div class="col-6 col-md-3"><a class="card card-sm text-reset text-decoration-none" href="/admin/events?status=pending"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Moderacja</div>
      <div class="h2 mb-0 text-warning" id="ppStat-pending">${statusCnt.pending}</div>
    </div></a></div>
    <div class="col-6 col-md-3"><a class="card card-sm text-reset text-decoration-none" href="/admin/events?status=rejected"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Odrzucone</div>
      <div class="h2 mb-0 text-danger" id="ppStat-rejected">${statusCnt.rejected}</div>
    </div></a></div>
  </div>`;
  const qCard = (label: string, value: number, color: string, hint: string, id: string) =>
    `<div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">${label}</div>
      <div class="h2 mb-0 ${color}" id="${id}" title="${esc(hint)}">${value}</div>
    </div></div></div>`;
  const statRowB = `<div class="row row-cards mb-3">
    ${qCard('Wyprzedane', soldOut, 'text-danger', 'Wydarzenia oznaczone jako wyprzedane', 'ppStat-sold')}
    ${qCard('Ręczne GEO', geoLocked, 'text-primary', 'GEO ustawione ręcznie — nie nadpisywane przez seed', 'ppStat-geo')}
    ${qCard('Ręczne tagi', tagsLocked, 'text-secondary', 'Tagi ustawione ręcznie — nie nadpisywane przez seed', 'ppStat-taglock')}
    ${qCard('Bez taga', nUntagged, 'text-warning', 'Wydarzenia bez żadnego taga', 'ppStat-untagged')}
  </div>`;

  const srcCard = `<div class="card mb-3">
    <div class="card-header"><h3 class="card-title">Źródła</h3>
      <div class="card-actions"><span class="text-secondary fs-5">${srcCnt.length} źródeł</span></div></div>
    <div class="card-body">${bars(srcCnt.map((s) => ({ label: s.source, value: s.n })))}</div>
  </div>`;

  // ---- Filter bar ----
  const seg = (label: string, href: string, active: boolean, extra = '') =>
    `<a class="btn btn-sm ${active ? 'active' : ''}" href="${esc(href)}">${label}${extra}</a>`;
  const statusSeg = `<div class="d-flex align-items-center gap-2 flex-wrap mb-3">
    <span class="text-secondary fw-bold">Status</span>
    <div class="btn-group btn-group-segmented" role="group">
      ${seg('Wszystkie', `/admin/events?${buildQs(q, { status: null })}`, !status)}
      ${seg('Oczekujące', `/admin/events?${buildQs(q, { status: 'pending' })}`, status === 'pending', `<span class="text-warning ms-1">${statusCnt.pending}</span>`)}
      ${seg('Zaakceptowane', `/admin/events?${buildQs(q, { status: 'approved' })}`, status === 'approved')}
      ${seg('Odrzucone', `/admin/events?${buildQs(q, { status: 'rejected' })}`, status === 'rejected')}
    </div>
    <span class="text-secondary ms-auto">Wynik: <strong>${total}</strong> wydarzeń</span>
  </div>`;

  const cityOpts = `<option value="">Wszystkie miasta</option>` + CITIES.map((ct) =>
    `<option value="${ct.id}" ${cityId === ct.id ? 'selected' : ''}>${esc(ct.name)}</option>`).join('');
  const tagOpts = `<option value="">Wszystkie tagi</option><option value="none" ${tag === 'none' ? 'selected' : ''}>Brak</option>` + catalog.map((t) =>
    `<option value="${esc(t.id)}" ${tag === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  const geoOpts = `<option value="">Wszystkie</option>
    <option value="locked" ${geo === 'locked' ? 'selected' : ''}>Z ręcznym GEO (${geoLocked})</option>
    <option value="default" ${geo === 'default' ? 'selected' : ''}>Fallback bbox</option>
    <option value="none" ${geo === 'none' ? 'selected' : ''}>Bez współrzędnych</option>`;
  const srcSelLabel = sources && sources.length ? `${sources[0]}${sources.length > 1 ? ` +${sources.length - 1}` : ''}` : 'Wszystkie';
  const srcCheckboxes = EVENT_SOURCES.map((s) => {
    const checked = sources?.includes(s) ? 'checked' : '';
    const n = srcCnt.find((x) => x.source === s)?.n ?? 0;
    return `<label class="dropdown-item"><input class="form-check-input me-2 pp-src" type="checkbox" value="${esc(s)}" ${checked}> ${esc(s)} <span class="text-muted ms-auto">${n}</span></label>`;
  }).join('');
  const limitOpts = [25, 50, 100, 200].map((n) => `<option value="${n}" ${PAGE_SIZE === n ? 'selected' : ''}>${n}</option>`).join('');

  const filterBar = `<div class="card mb-3"><div class="card-body">
    ${statusSeg}
    <form method="get" action="/admin/events" class="row g-2">
      <div class="col-12 col-md-4">
        <label class="form-label">Szukaj</label>
        <div class="input-group">
          <span class="input-group-text">${icon('search')}</span>
          <input name="q" class="form-control" value="${esc(search || '')}" placeholder="tytuł, miejsce, miasto, external_id…">
          <button class="btn btn-primary" type="submit">Szukaj</button>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <label class="form-label">Źródła</label>
        <div class="dropdown">
          <button class="btn btn-outline-secondary w-100 dropdown-toggle" type="button" data-bs-toggle="dropdown">${esc(srcSelLabel)}</button>
          <div class="dropdown-menu dropdown-menu-end p-2" style="min-width:230px">
            ${srcCheckboxes}
            <div class="dropdown-divider"></div>
            <button class="btn btn-sm btn-primary w-100" type="button" onclick="ppApplySources()">Zastosuj</button>
          </div>
        </div>
        <input type="hidden" name="sources" id="ppSources" value="${esc((sources ?? []).join(','))}">
      </div>
      <div class="col-6 col-md-3"><label class="form-label">Miasto</label><select name="city" class="form-select" onchange="this.form.submit()">${cityOpts}</select></div>
      <div class="col-6 col-md-3"><label class="form-label">Tag</label><select name="tag" class="form-select" onchange="this.form.submit()">${tagOpts}</select></div>
      <div class="col-6 col-md-3"><label class="form-label">GEO</label><select name="geo" class="form-select" onchange="this.form.submit()">${geoOpts}</select></div>
      <div class="col-6 col-md-2"><label class="form-label">Data od</label><input type="date" name="from" class="form-control" value="${esc(from || '')}" onchange="this.form.submit()"></div>
      <div class="col-6 col-md-2"><label class="form-label">Data do</label><input type="date" name="to" class="form-control" value="${esc(to || '')}" onchange="this.form.submit()"></div>
      <div class="col-6 col-md-2"><label class="form-label">Seed od</label><input type="date" name="cfrom" class="form-control" value="${esc(cfrom || '')}" onchange="this.form.submit()"></div>
      <div class="col-6 col-md-2"><label class="form-label">Seed do</label><input type="date" name="cto" class="form-control" value="${esc(cto || '')}" onchange="this.form.submit()"></div>
      <div class="col-6 col-md-2">
        <label class="form-label">Na stronę</label>
        <select name="limit" class="form-select" onchange="this.form.submit()">${limitOpts}</select>
      </div>
      <div class="col-12 d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
        <a class="btn btn-outline-secondary" href="/admin/events" onclick="ppClearFilters(event)">Wyczyść filtry</a>
      </div>
    </form>
  </div></div>`;

  // ---- Moderation banner ----
  const modBanner = status === 'pending'
    ? `<div class="alert alert-warning mb-3">Nowy dzień seeda do przejrzenia — <strong>${statusCnt.pending}</strong> wydarzeń czeka na decyzję. ${icon('chevron-right')}</div>`
    : '';

  // ---- Pagination ----
  const pageHref = (p: number) => {
    const qs = buildQs(q, {});
    return `/admin/events?${qs}${qs ? '&' : ''}page=${p}`;
  };
  const pager = (top: boolean) => `<div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
    <span class="text-secondary">${total} wydarzeń · strona ${page} / ${totalPages}</span>
    ${pagination(page, totalPages, pageHref)}
  </div>`;

  // ---- Table rows ----
  const ppLinkMap: Record<string, Record<string, string>> = {};
  const ppSel: Record<string, string> = {};
  const rows = (results as any[]).map((e) => {
    const { title, time, loc } = descParts(e.description);
    const tags = parseTags(e.tags);
    const tag = tags[0] ?? '';
    const extra = tags.length - 1;
    const times = parseShowtimes(e.showtimes);
    if (times.length > 0) {
      ppSel[e.id] = times[0];
      const map: Record<string, string> = {};
      for (const t of times) { const u = bookingURLFor(e.showtime_booking, t, e.link_url); if (u) map[t] = u; }
      if (Object.keys(map).length) ppLinkMap[e.id] = map;
    }
    const srcBadge = SOURCE_BADGE[e.source] ? `<span class="badge ${SOURCE_BADGE[e.source]}">${esc(e.source)}</span>` : '';
    const soldBadge = e.is_sold_out ? `<span class="badge bg-danger-lt text-danger">wyprzedane</span>` : '';
    const geoLockBadge = e.geo_locked ? `<span class="badge bg-primary-lt text-primary" title="GEO ustawione ręcznie">${icon('lock', 'icon icon-tiny me-1')}geo</span>` : '';
    const tagLockBadge = e.tags_locked ? `<span class="badge bg-primary-lt text-primary" title="Tag ustawiony ręcznie">${icon('lock', 'icon icon-tiny me-1')}tag</span>` : '';
    const rejectHint = e.status === 'rejected' && e.rejection_reason ? `<i class="text-danger" title="${esc(String(e.rejection_reason))}">⚠</i>` : '';
    const seedDay = e.created_at ? new Date(e.created_at).toISOString().slice(5, 10) : '';
    const mediaUrl = e.media_key || e.thumb_key || '';
    return `<tr>
      <td>${eventThumb(e)}</td>
      <td>
        <div class="fw-semibold">${titleHtml(e.link_url, title, e.id, e.source)} ${srcBadge} ${soldBadge} ${geoLockBadge} ${tagLockBadge}</div>
        ${placeCellHtml(e.id, e.lat, e.lng, loc)}
      </td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="text-muted fs-5">${esc(e.event_date || '')}</span>${dateCell({ id: e.id, event_date: e.event_date, showtimes: e.showtimes, time })}
        </div>
        <div class="text-muted fs-6" title="Czas seeda">seed ${esc(seedDay)}</div>
      </td>
      <td>${statusSelect({ id: e.id, status: e.status })} ${rejectHint}</td>
      <td>${tagSelect({ id: e.id, status: e.status, tag, extra }, catalog)}</td>
      <td class="text-end">${rowActions(e.id, loc, e.lat, e.lng, e.link_url)}</td></tr>`;
  }).join('');

  const emptyRow = `<tr><td colspan="7">
    <div class="empty">
      <div class="empty-icon">${icon('search')}</div>
      <p class="empty-title">Brak wydarzeń</p>
      <p class="empty-subtitle text-secondary">Nic nie pasuje do tych filtrów.</p>
      <div class="empty-action"><a class="btn btn-outline-secondary" href="/admin/events">Wyczyść filtry</a></div>
    </div></td></tr>`;

  const tableHtml = `<div class="card mb-3">
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Media</th><th>Wydarzenie</th><th>Data</th><th>Status</th><th>Tag</th><th class="text-end">Akcje</th></tr></thead>
      <tbody>${rows || emptyRow}</tbody></table></div>
  </div>`;

  // ---- Modals (Tabler flavor) ----
  const modals = `<div class="modal fade" id="ppMediaModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-xl modal-blur">
      <div class="modal-content bg-transparent border-0 shadow-none">
        <img id="ppMediaImg" alt="" class="img-fluid mx-auto rounded" onclick="ppMediaClose()" />
      </div>
    </div>
  </div>
  <div class="modal fade" id="ppLinkModal" tabindex="-1">
    <div class="modal-dialog modal-xl modal-blur">
      <div class="modal-content">
        <div class="modal-header">
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.open(window.ppCurExternal||window.ppCurLink||'', '_blank', 'noopener')">Otwórz w nowej karcie</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="ppLinkClose()">Zamknij (ESC)</button>
        </div>
        <div class="modal-body p-0">
          <iframe id="ppLinkFrame" title="Podgląd" class="w-100 border-0 d-block" height="640" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
        </div>
      </div>
    </div>
  </div>
  <div class="modal fade" id="ppAlertModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-sm modal-blur">
      <div class="modal-content">
        <div class="modal-header"><h3 class="modal-title" id="ppAlertTitle">Uwaga</h3></div>
        <div class="modal-body" id="ppAlertMsg"></div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="ppAlertClose()">OK (ESC)</button></div>
      </div>
    </div>
  </div>
  <div class="modal fade" id="ppGeoModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-blur">
      <div class="modal-content">
        <div class="modal-status bg-danger" id="ppGeoStatus" style="display:none"></div>
        <div class="modal-header"><h3 class="modal-title">Zmień GEO</h3></div>
        <div class="modal-body">
          <div class="mb-3"><label class="form-label">Nazwa lokalizacji</label><input id="ppGeoName" class="form-control" placeholder="np. Multikino Złote Tarasy" /></div>
          <div class="mb-1"><label class="form-label">Geo (lat, lng)</label><input id="ppGeoCoord" class="form-control" placeholder="54.42656865607224, 18.58054868650763" /></div>
          <div class="text-secondary fs-5">Wklej współrzędne z Google Maps. Zapis jest trwały (geo_locked).</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" onclick="ppGeoClose()">Anuluj</button>
          <button type="button" class="btn btn-primary" onclick="ppGeoSave()">Zapisz</button>
        </div>
      </div>
    </div>
  </div>`;

  const body = `${header}${statRowA}${statRowB}${srcCard}${modBanner}${filterBar}${pager(true)}${tableHtml}${pager(false)}${modals}
  ${toastContainer()}
  <script>window.ppLinkMap=${JSON.stringify(ppLinkMap)};window.ppSel=${JSON.stringify(ppSel)};window.ppLinkFor=function(id,fb){var m=window.ppLinkMap[id],s=window.ppSel[id];if(m&&s&&m[s])return m[s];return fb;};window.ppBlockedHosts=['multikino.pl','ebilet.pl'];window.ppOpenLink=function(u){var h=(u||'').split('/')[2]||'';var blocked=window.ppBlockedHosts.some(function(b){return h.indexOf(b)!==-1;});if(blocked){window.open(u,'_blank','noopener');}else{ppLinkOpen(u);}};</script>
  <script>
  (function(){
    var media=document.getElementById('ppMediaModal'), alertM=document.getElementById('ppAlertModal'), linkM=document.getElementById('ppLinkModal');
    var modalShow=function(el){var B=window.tabler||window.bootstrap; if(B&&B.Modal&&el) B.Modal.getOrCreateInstance(el).show();};
    var modalHide=function(el){var B=window.tabler||window.bootstrap; if(B&&B.Modal&&el){var m=B.Modal.getInstance(el); if(m) m.hide();}};
    window.ppMediaOpen=function(src){var img=document.getElementById('ppMediaImg'); if(img) img.src=src; modalShow(media);};
    window.ppMediaClose=function(){modalHide(media);};
    window.ppLinkOpen=function(url,external){
      window.ppCurLink=url; window.ppCurExternal=external||url;
      var f=document.getElementById('ppLinkFrame');
      if(f) f.src=url;
      modalShow(linkM);
      setTimeout(function(){linkM.focus();},0);
    };
    window.ppLinkClose=function(){var f=document.getElementById('ppLinkFrame'); if(f) f.src='about:blank'; modalHide(linkM);};
    window.ppAlertOpen=function(title,msg){document.getElementById('ppAlertTitle').textContent=title;document.getElementById('ppAlertMsg').textContent=msg;modalShow(alertM);};
    window.ppAlertClose=function(){modalHide(alertM);};
    var geoM=document.getElementById('ppGeoModal');
    window.ppGeoId=null;
    window.ppGeoStatusEl=document.getElementById('ppGeoStatus');
    window.ppGeoShowStatus=function(msg){if(window.ppGeoStatusEl){window.ppGeoStatusEl.textContent=msg;window.ppGeoStatusEl.style.display='block';}};
    window.ppGeoClearStatus=function(){if(window.ppGeoStatusEl){window.ppGeoStatusEl.style.display='none';}};
    window.ppGeoOpen=function(id,loc,lat,lng){
      window.ppGeoId=id; window.ppGeoClearStatus();
      document.getElementById('ppGeoName').value=loc||'';
      document.getElementById('ppGeoCoord').value=(lat&&lng)?lat+', '+lng:'';
      modalShow(geoM);
      setTimeout(function(){geoM.focus();document.getElementById('ppGeoName').select();},0);
    };
    window.ppGeoClose=function(){modalHide(geoM);window.ppGeoId=null;};
    window.ppGeoSwap=function(id,placeHtml,geoBtn){
      var cell=document.querySelector('.pp-place-cell[data-id="'+id+'"]');
      if(cell&&placeHtml) cell.outerHTML=placeHtml;
      var btn=document.querySelector('.pp-geo-btn[data-id="'+id+'"]');
      if(btn&&geoBtn) btn.outerHTML=geoBtn;
    };
    window.ppGeoSave=function(){
      var id=window.ppGeoId; if(!id) return;
      var name=document.getElementById('ppGeoName').value.trim();
      var coord=(document.getElementById('ppGeoCoord').value||'').replace(/[\\u200B-\\u200F\\uFEFF\\u00A0\\s]+/g,'');
      var m=/^(-?\\d+(?:\\.\\d+)?)[,;](-?\\d+(?:\\.\\d+)?)$/.exec(coord);
      if(!name){window.ppGeoShowStatus('Podaj nazwę lokalizacji.');return;}
      if(!m){window.ppGeoShowStatus('Nieprawidłowe współrzędne. Wklej np. 54.42656865607224, 18.58054868650763');return;}
      fetch('/admin/events/'+encodeURIComponent(id)+'/geo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,lat:parseFloat(m[1]),lng:parseFloat(m[2])})})
        .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
        .then(function(resp){window.ppGeoSwap(id,resp&&resp.placeHtml,resp&&resp.geoBtn);window.ppGeoClose();window.ppToast('GEO zaktualizowane.','success');})
        .catch(function(){window.ppToast('Nie udało się zapisać GEO.','danger');});
    };
    var frame=document.getElementById('ppLinkFrame');
    if(frame){frame.addEventListener('load',function(){linkM.focus();});}
    window.ppUpdate=function(id,formEl){
      var sel=formEl.querySelector('select');
      var fd=new FormData(formEl);
      fetch('/admin/events/'+encodeURIComponent(id),{method:'POST',body:fd})
        .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
        .then(function(resp){
          if(sel){
            sel.classList.remove('text-success','text-warning','text-danger');
            if(sel.name==='status'){
              if(sel.value==='approved') sel.classList.add('text-success');
              else if(sel.value==='pending') sel.classList.add('text-warning');
              else sel.classList.add('text-danger');
            }
            sel.style.outline='2px solid var(--tblr-success)';
            setTimeout(function(){sel.style.outline='';},700);
          }
          if(resp&&resp.counts){
            var set=function(id,v){var el=document.getElementById(id); if(el) el.textContent=String(v);};
            set('ppStat-total',resp.counts.total); set('ppStat-approved',resp.counts.approved);
            set('ppStat-pending',resp.counts.pending); set('ppStat-rejected',resp.counts.rejected);
            set('ppStat-untagged',resp.counts.untagged);
          }
          window.ppToast('Zapisano.','success');
        })
        .catch(function(){window.ppToast('Nie udało się zapisać zmiany.','danger');});
    };
    window.ppApplySources=function(){
      var out=[];
      document.querySelectorAll('.pp-src:checked').forEach(function(cb){out.push(cb.value);});
      var h=document.getElementById('ppSources');
      if(h) h.value=out.join(',');
      var form=h?h.closest('form'):null;
      if(form) form.submit();
    };
    window.ppClearFilters=function(e){
      if(e) e.preventDefault();
      location.href='/admin/events';
    };
    window.ppCopyId=function(id){
      if(navigator.clipboard){navigator.clipboard.writeText(id).then(function(){window.ppToast('ID skopiowane.','success');},function(){});}
      else window.ppToast('Kopiowanie nie działa w tym przeglądarce.','danger');
    };
  })();
  </script>
  ${toastScript()}`;

  return renderPage(c, 'Eventy', '/admin/events', body);
});

pageRoutes.post('/events/:id', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  const db = c.env.DB;
  const id = c.req.param('id');
  const form = (await c.req.parseBody({ all: true }).catch(() => ({}))) as Record<string, unknown>;

  const rawStatus = Array.isArray(form.status) ? String(form.status[0]) : String(form.status ?? '');
  const status = rawStatus === 'approved' || rawStatus === 'pending' || rawStatus === 'rejected' ? rawStatus : null;
  const rawField = Array.isArray(form.field) ? String(form.field[0]) : String(form.field ?? '');

  if (status && rawField === 'status') {
    if (status === 'rejected') {
      await db.prepare('UPDATE posts SET status = ? WHERE id = ?').bind(status, id).run();
    } else {
      await db.prepare('UPDATE posts SET status = ?, rejection_reason = NULL WHERE id = ?').bind(status, id).run();
    }
  }

  const tagsRaw = Array.isArray(form.tags) ? String(form.tags[0]) : String(form.tags ?? '');
  const tag = tagsRaw && (CANONICAL_TAG_SET.has(tagsRaw) || (await tagIdSet(db)).has(tagsRaw)) ? tagsRaw : null;
  if (rawField === 'tag') {
    const row = await db.prepare('SELECT tags FROM posts WHERE id=?').bind(id).first<{ tags: string | null }>();
    const existing = parseTags(row?.tags ?? null);
    // Merge, never clobber: edit the first (displayed) tag, keep the rest.
    let merged: string[];
    if (tag) merged = [tag, ...existing.filter((t) => t !== tag)];
    else merged = existing.length > 1 ? existing.slice(1) : [];
    const tagsJsonStr = merged.length ? JSON.stringify(merged) : null;
    // Manual tag edits lock the tag so re-seeds keep the admin's choice.
    await db.prepare('UPDATE posts SET tags = ?, tags_locked = 1 WHERE id = ?').bind(tagsJsonStr, id).run();
  }

  const [statusCnt, untagged] = await Promise.all([
    eventStatusBreakdown(db),
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='events' AND (tags IS NULL OR tags='[]')").first<{ n: number }>(),
  ]);
  const counts = {
    total: statusCnt.approved + statusCnt.pending + statusCnt.rejected,
    approved: statusCnt.approved,
    pending: statusCnt.pending,
    rejected: statusCnt.rejected,
    untagged: untagged?.n ?? 0,
  };
  return c.json({ ok: true, status, tag, counts });
});

// Set a single event's geo (location name + coords). Geo edits are permanent.
pageRoutes.post('/events/:id/geo', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!name) return c.json({ error: 'Nazwa lokalizacji jest wymagana' }, 400);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return c.json({ error: 'Nieprawidłowe współrzędne. Wklej np. 54.42656865607224, 18.58054868650763' }, 400);
  }
  const row = await db.prepare('SELECT description FROM posts WHERE id=?').bind(id).first<{ description: string | null }>();
  const desc = rewriteLoc(row?.description ?? '', name);
  if (desc !== null) {
    await db.prepare('UPDATE posts SET lat = ?, lng = ?, description = ?, geo_locked = 1 WHERE id = ?').bind(lat, lng, desc, id).run();
  } else {
    await db.prepare('UPDATE posts SET lat = ?, lng = ?, geo_locked = 1 WHERE id = ?').bind(lat, lng, id).run();
  }
  const loc = desc !== null ? name : (descParts(row?.description ?? '').loc || name);
  return c.json({ ok: true, placeHtml: placeCellHtml(id, lat, lng, loc), geoBtn: geoButtonHtml(id, loc, lat, lng) });
});

export function registerEvents(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
