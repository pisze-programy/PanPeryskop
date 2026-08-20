// Admin dashboard SSR pages, mounted at /admin. Rendered server-side (Tabler UI).
import { Hono } from 'hono';
import { bars, cards, empty, esc, fmtDate, fmtDur, fmtPct, page, pill } from '../ui';
import { adminLogin, getClientIp } from '../auth';
import { CITIES, cityBbox } from '../cities';
import { browserBudget, cronInfo, daySeries, eventsSql, eventsCountSql, nearestCity, EventFilter } from '../queries';
import { seedTomorrow } from '../../seed';
import { clearCookie, fmtPctNum, requireSession, setSessionCookie } from './common';
import { STATUS_REJECTED } from '../../core/models';
import { CANONICAL_TAGS, CANONICAL_TAG_SET, TAG_LABELS } from '../../seed/core/tags';

export const pageRoutes = new Hono<{ Bindings: Env }>();

async function renderPage(c: any, title: string, active: string, html: string) {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  return page(title, active, html);
}

// ---------- Auth ----------
pageRoutes.get('/login', async (c) => {
  const session = await requireSession(c);
  if (session) return c.redirect('/admin');
  const body = `<div style="max-width:380px;margin:10vh auto">
    <div class="card card-lg"><div class="card-body p-4">
      <h2 class="card-title mb-1">PanPeryskop · Admin</h2>
      <p class="text-secondary mb-3">Zaloguj się (sesja 4h)</p>
      <form method="post" action="/admin/login">
        <div class="mb-3"><input type="password" name="password" class="form-control" placeholder="Hasło" required autofocus /></div>
        <button class="btn btn-primary w-100" type="submit">Zaloguj</button>
      </form>
    </div></div></div>`;
  return page('Logowanie', '', body);
});

pageRoutes.post('/login', async (c) => {
  const parsed = (await c.req.parseBody<Record<string, string>>().catch(() => ({}))) as Record<string, string>;
  const password = String(parsed.password || '');
  const ip = getClientIp(c);
  const { cookie, reason } = await adminLogin(c.env, password, ip);
  if (cookie) return setSessionCookie(c.redirect('/admin'), cookie, 72 * 3600);
  const msg =
    reason === 'rate' ? 'Za dużo prób. Spróbuj za 15 min.' :
    reason === 'unconfigured' ? 'Hasło admina nie jest skonfigurowane (ADMIN_PASSWORD_HASH).' :
    'Nieprawidłowe hasło.';
  const body = `<div style="max-width:380px;margin:10vh auto"><div class="card"><div class="card-body p-4">
    <div class="alert alert-danger">${esc(msg)}</div>
    <a class="btn btn-outline-secondary" href="/admin/login">Wróć</a></div></div></div>`;
  return page('Logowanie', '', body);
});

pageRoutes.get('/logout', async (c) => {
  const res = c.redirect('/admin/login');
  const headers = new Headers(res.headers);
  headers.set('Set-Cookie', clearCookie());
  return new Response(res.body, { status: res.status, headers });
});

// ---------- Overview ----------
pageRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  const dayStart = now - 86400000;
  const [users, posts, evToday, viewsToday, likes, shares, errs, mediaReq, lastSeed, cron, budget] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts WHERE category=? AND created_at>=?').bind('events', dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM views WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM likes').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM shares').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM media_requests').first<{ n: number }>(),
    db.prepare('SELECT * FROM seed_runs WHERE provider=? ORDER BY created_at DESC LIMIT 1').bind('total').first<Record<string, unknown>>(),
    cronInfo(c.env, db),
    c.env.BROWSER ? await browserBudget(c.env) : null,
  ]);
  const ccards = cards([
    { label: 'Użytkownicy', value: users?.n ?? 0 },
    { label: 'Posty', value: posts?.n ?? 0 },
    { label: 'Eventy dziś', value: evToday?.n ?? 0, color: 'success' },
    { label: 'Views dziś', value: viewsToday?.n ?? 0 },
    { label: 'Like', value: likes?.n ?? 0 },
    { label: 'Share', value: shares?.n ?? 0, color: 'primary' },
    { label: 'Błędy dziś', value: errs?.n ?? 0, color: (errs?.n ?? 0) > 0 ? 'danger' : '' },
    { label: 'Media Requests', value: mediaReq?.n ?? 0 },
  ]);

  // Cron card
  let cronHtml = `<div class="card mb-3"><div class="card-header"><h3 class="card-title">Cron (planowanie)</h3></div><div class="card-body">`;
  cronHtml += `<p class="mb-1"><strong>Harmonogram:</strong> ${esc(cron.schedules.join(', '))}</p>
    <p class="mb-1 text-secondary">${esc(cron.summary)}</p>`;
  cronHtml += cron.nextRunMs
    ? `<p class="mb-1"><strong>Następny run:</strong> ${fmtDate(cron.nextRunMs)}</p>`
    : `<p class="mb-1 text-warning">Brak zaplanowanego crona.</p>`;
  cronHtml += cron.lastCronRunMs
    ? `<p class="mb-0"><strong>Ostatni cron:</strong> ${fmtDate(cron.lastCronRunMs)} ${pill('OK', 'ok')}</p>`
    : `<p class="mb-0"><strong>Ostatni cron:</strong> <span class="text-warning">jeszcze nie wystartował</span></p>`;
  cronHtml += `</div></div>`;

  // Last seed card
  let seedHtml = `<div class="card mb-3"><div class="card-header"><h3 class="card-title">Ostatni seed</h3></div><div class="card-body">`;
  if (lastSeed) {
    const s = lastSeed as any;
    seedHtml += `<div class="row g-3">
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Dzień</div><div class="fw-bold">${esc(s.day)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Typ</div><div>${esc(s.run_type)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Ingest</div><div class="fw-bold">${s.ingested}/${s.candidates}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Błędy</div><div class="${s.errors ? 'text-danger' : 'text-success'}">${s.errors}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Czas</div><div>${fmtDur(s.duration_ms)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Browser</div><div>${fmtDur(s.browser_ms)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Wykonany</div><div>${fmtDate(s.created_at)}</div></div>
    </div>`;
  } else seedHtml += '<p class="text-secondary mb-0">Brak uruchomień seeda.</p>';
  if (budget) {
    seedHtml += `<div class="mt-3 d-flex align-items-center" style="gap:10px">
      <span class="text-secondary">Budget Browser Run</span>
      <div class="progress flex-grow-1" style="height:8px"><div class="progress-bar ${budget.exceeded ? 'bg-danger' : 'bg-primary'}" style="width:${Math.min(100, fmtPctNum(budget.monthMs, budget.limitMs))}%"></div></div>
      <span class="${budget.exceeded ? 'text-danger fw-bold' : ''}">${fmtPct(budget.monthMs, budget.limitMs)} (${fmtDur(budget.monthMs)} / ${fmtDur(budget.limitMs)})</span>
    </div>`;
  }
  seedHtml += `</div></div>`;

  const body = `<h2 class="mb-3">Overview</h2>${ccards}${cronHtml}${seedHtml}
  <div class="d-flex gap-2"><a class="btn btn-outline-secondary" href="/admin/stats">Statystyki</a><a class="btn btn-outline-secondary" href="/admin/seed">Logi seed</a></div>`;
  return renderPage(c, 'Overview', '/admin', body);
});

// ---------- Events / Moderacja ----------
const EVENT_SOURCES = ['helios', 'multikino', 'cinemacity', 'going', 'kupbilecik', 'dzisapp', 'eventylive', 'luma', 'meetup'];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Escape a string for embedding inside a single-quoted JS string in an onclick attr.
function jsStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
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

// Status dropdown — colored per status, auto-submits on change; carries the
// current single tag as a hidden field so a status change never wipes it.
function statusSelect(e: { id: string; status: string; tag: string }): string {
  const colorCls = e.status === 'approved' ? ' text-success' : e.status === 'pending' ? ' text-warning' : ' text-danger';
  const opts = ['approved', 'pending', 'rejected'].map((s) =>
    `<option value="${s}" ${e.status === s ? 'selected' : ''} style="color:var(--tblr-${s === 'approved' ? 'success' : s === 'pending' ? 'warning' : 'danger'})">${s}</option>`).join('');
  return `<form method="post" action="/admin/events/${esc(e.id)}">
    <select name="status" class="form-select form-select-sm${colorCls}" onchange="ppUpdate('${esc(e.id)}', this.form)">${opts}</select>
    <input type="hidden" name="tags" value="${esc(e.tag)}" /></form>`;
}

// Single tag dropdown — one tag per event, "— brak —" when none (highlighted so
// missing tags are visible). Auto-submits on change; carries status hidden.
function tagSelect(e: { id: string; status: string; tag: string }): string {
  const hasTag = e.tag !== '';
  const missingCls = hasTag ? '' : ' text-warning';
  const opts = `<option value="" ${!hasTag ? 'selected' : ''}>— brak —</option>` + CANONICAL_TAGS.map((t) =>
    `<option value="${t}" ${e.tag === t ? 'selected' : ''}>${esc(TAG_LABELS[t] ?? t)}</option>`).join('');
  return `<form method="post" action="/admin/events/${esc(e.id)}">
    <select name="tags" class="form-select form-select-sm${missingCls}" onchange="ppUpdate('${esc(e.id)}', this.form)">${opts}</select>
    <input type="hidden" name="status" value="${esc(e.status)}" /></form>`;
}

function eventThumb(e: { thumb_key?: string | null; media_key?: string | null }): string {
  const key = e.thumb_key || e.media_key;
  const full = e.media_key || e.thumb_key;
  if (!key) return '—';
  return `<img src="/media/${esc(key)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:6px;cursor:zoom-in" loading="lazy" onerror="this.style.display='none'" onclick="ppMediaOpen('/media/${esc(full)}')" />`;
}

// Title: opens the event link (resolved per selected showtime). multikino.pl
// refuses iframes → opened in a new tab automatically; everything else renders in
// the modal. Missing link = DATA ERROR.
function titleHtml(linkUrl: string | null, title: string, id: string, source: string): string {
  const t = esc(title || '—');
  const src = `<span class="text-muted" style="font-size:11px">(${esc(source)})</span>`;
  if (linkUrl) {
    return `<a href="javascript:void(0)" onclick="ppOpenLink(ppLinkFor('${esc(id)}', '${jsStr(linkUrl)}'));return false;" class="text-reset text-decoration-none">${t}</a> ${src}`;
  }
  return `<a href="javascript:void(0)" onclick="ppAlertOpen('Błąd danych','Wydarzenie nie ma linku (${esc(id)}). Eventy zawsze powinny mieć link.');return false;" class="text-danger text-decoration-none">${t} ⚠</a> ${src}`;
}

// Which city id is mentioned in the location string (fallback geo for null coords).
function cityByLoc(loc: string): string | null {
  const l = norm(loc);
  for (const ct of CITIES) {
    if (l.includes(norm(ct.name))) return ct.id;
  }
  return null;
}

// Google Maps embed URL (shown in the link modal) — exact coords when available,
// otherwise the city bbox center (same fallback as the app).
function placeEmbed(lat: number | null, lng: number | null, loc: string): string | null {
  let base: string | null = null;
  if (lat != null && lng != null) base = `https://www.google.com/maps?q=${lat},${lng}`;
  else {
    const cid = cityByLoc(loc);
    if (cid) {
      const b = cityBbox(cid);
      if (b) base = `https://www.google.com/maps?q=${b.swLat + (b.neLat - b.swLat) / 2},${b.swLng + (b.neLng - b.swLng) / 2}`;
    }
  }
  return base ? `${base}&output=embed` : null;
}

function placeLabel(loc: string, lat: number | null, lng: number | null): string {
  const city = lat != null && lng != null ? nearestCity(lat, lng) : '';
  const venue = (loc.split(',')[0] || '').trim();
  if (!city && !venue) return '--- Brak';
  return [city, venue].filter(Boolean).join(', ');
}

const PIN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><use href="#icon-map-pin"/></svg>`;

// Place row: pin icon + "Miasto, VENUE"; the whole thing opens a Google Maps
// embed in the modal (ESC closes) — a live pin check on the map.
function placeHtml(lat: number | null, lng: number | null, loc: string): string {
  const label = esc(placeLabel(loc, lat, lng));
  const embed = placeEmbed(lat, lng, loc);
  if (!embed) return `<div class="text-secondary" style="font-size:13px">${PIN_ICON} ${label}</div>`;
  return `<div class="text-secondary" style="font-size:13px"><a href="javascript:void(0)" onclick="ppLinkOpen('${jsStr(embed)}');return false;" class="text-reset text-decoration-none">${PIN_ICON} ${label}</a></div>`;
}

function parseShowtimes(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

// Replicates the app's per-showtime deep-link builder (Post.bookingURL(for:)).
// Only cinema providers carry showtime_booking; everything else → null (the
// event's link_url is used instead).
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

// Date + showtime selector. The selector drives the row link (ppLinkFor) so the
// admin previews the deep-link of the chosen showtime; disabled when only one.
function dateCell(e: { id: string; event_date?: string | null; showtimes?: string | null; time?: string }): string {
  const d = esc(e.event_date || '');
  const times = parseShowtimes(e.showtimes);
  if (times.length === 0) return `<div class="text-muted" style="font-size:12px">${d}</div>`;
  if (times.length === 1) return `<div class="text-muted" style="font-size:12px">${d} · ${esc(times[0])}</div>`;
  const opts = times.map((t, i) => `<option value="${esc(t)}" ${i === 0 ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const sel = `<select class="form-select form-select-sm" style="width:110px" onchange="window.ppSel['${esc(e.id)}']=this.value">${opts}</select>`;
  return `<div class="d-flex align-items-center gap-1">
    <span class="text-muted" style="font-size:12px">${d}</span>${sel}
  </div>`;
}

pageRoutes.get('/events', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const cityId = q.city ? String(q.city) : null;
  const source = q.source ? String(q.source) : null;
  const status = q.status ? String(q.status) : null;
  const from = q.from ? String(q.from) : null;
  const to = q.to ? String(q.to) : null;
  const tag = q.tag ? String(q.tag) : null;
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);
  const PAGE_SIZE = 100;

  const filter: EventFilter = { cityId, source, status, from, to, tag, fromMs: null, toMs: null, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  const { sql, binds } = eventsSql(filter);
  const { results } = await db.prepare(sql).bind(...binds).all();
  const cnt = eventsCountSql(filter);
  const cntRow = await db.prepare(cnt.sql).bind(...cnt.binds).first<{ n: number }>();
  const total = cntRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cityOpts = `<option value="">Wszystkie miasta</option>` + CITIES.map((ct) =>
    `<option value="${ct.id}" ${cityId === ct.id ? 'selected' : ''}>${esc(ct.name)}</option>`).join('');
  const srcOpts = `<option value="">Wszystkie źródła</option>` + EVENT_SOURCES.map((s) =>
    `<option value="${s}" ${source === s ? 'selected' : ''}>${s}</option>`).join('');
  const statusOpts = ['', 'pending', 'approved', 'rejected'].map((s) =>
    `<option value="${s}" ${status === s ? 'selected' : ''}>${s === '' ? 'Wszystkie statusy' : s}</option>`).join('');
  const tagOpts = `<option value="">Wszystkie tagi</option><option value="none" ${tag === 'none' ? 'selected' : ''}>Brak</option>` + CANONICAL_TAGS.map((t) =>
    `<option value="${t}" ${tag === t ? 'selected' : ''}>${esc(TAG_LABELS[t] ?? t)}</option>`).join('');

  const qs = new URLSearchParams();
  if (cityId) qs.set('city', cityId);
  if (source) qs.set('source', source);
  if (status) qs.set('status', status);
  if (tag) qs.set('tag', tag);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const qstr = qs.toString();
  const prevHref = page > 1 ? `/admin/events?${qstr}${qstr ? '&' : ''}page=${page - 1}` : null;
  const nextHref = page < totalPages ? `/admin/events?${qstr}${qstr ? '&' : ''}page=${page + 1}` : null;
  const pager = `<div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
    <span class="text-secondary">${total} wydarzeń · strona ${page} / ${totalPages}</span>
    <div class="btn-group">
      ${prevHref ? `<a class="btn btn-outline-secondary btn-sm" href="${esc(prevHref)}">‹ Poprzednia</a>` : '<span class="btn btn-outline-secondary btn-sm disabled">‹ Poprzednia</span>'}
      ${nextHref ? `<a class="btn btn-outline-secondary btn-sm" href="${esc(nextHref)}">Następna ›</a>` : '<span class="btn btn-outline-secondary btn-sm disabled">Następna ›</span>'}
    </div></div>`;

  const ppLinkMap: Record<string, Record<string, string>> = {};
  const ppSel: Record<string, string> = {};
  const rows = (results as any[]).map((e) => {
    const { title, time, loc } = descParts(e.description);
    const tag = parseTags(e.tags)[0] ?? '';
    const times = parseShowtimes(e.showtimes);
    if (times.length > 0) {
      ppSel[e.id] = times[0];
      const map: Record<string, string> = {};
      for (const t of times) { const u = bookingURLFor(e.showtime_booking, t, e.link_url); if (u) map[t] = u; }
      if (Object.keys(map).length) ppLinkMap[e.id] = map;
    }
    return `<tr>
      <td>${eventThumb(e)}</td>
      <td>
        <div class="fw-semibold">${titleHtml(e.link_url, title, e.id, e.source)}</div>
        ${placeHtml(e.lat, e.lng, loc)}
        ${dateCell({ id: e.id, event_date: e.event_date, showtimes: e.showtimes, time })}
      </td>
      <td>${statusSelect({ id: e.id, status: e.status, tag })}</td>
      <td>${tagSelect({ id: e.id, status: e.status, tag })}</td></tr>`;
  }).join('');

  const body = `<h2 class="mb-3">${status === 'pending' ? 'Moderacja' : 'Eventy'}</h2>
  <form method="get" action="/admin/events" class="row g-2 mb-3">
    <div class="col-6 col-md-2"><label class="form-label">Miasto</label><select name="city" class="form-select" onchange="this.form.submit()">${cityOpts}</select></div>
    <div class="col-6 col-md-2"><label class="form-label">Źródło</label><select name="source" class="form-select" onchange="this.form.submit()">${srcOpts}</select></div>
    <div class="col-6 col-md-2"><label class="form-label">Status</label><select name="status" class="form-select" onchange="this.form.submit()">${statusOpts}</select></div>
    <div class="col-6 col-md-2"><label class="form-label">Tag</label><select name="tag" class="form-select" onchange="this.form.submit()">${tagOpts}</select></div>
    <div class="col-6 col-md-2"><label class="form-label">Data od</label><input name="from" type="date" class="form-control" value="${esc(from || '')}" onchange="this.form.submit()" /></div>
    <div class="col-6 col-md-2"><label class="form-label">Data do</label><input name="to" type="date" class="form-control" value="${esc(to || '')}" onchange="this.form.submit()" /></div>
    <div class="col-12 d-flex align-items-end">
      <a class="btn btn-outline-secondary" href="/admin/events" onclick="try{['city','source','status','tag','from','to'].forEach(function(k){localStorage.removeItem('evFilter:'+k);});}catch(e){}">Wyczyść</a>
    </div>
  </form>
  ${pager}
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Media</th><th>Wydarzenie</th><th>Status</th><th>Tagi</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4">${empty()}</td></tr>`}</tbody></table></div></div>
  ${pager}
  <div id="ppMediaModal" onclick="ppMediaClose()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out">
    <img id="ppMediaImg" alt="" style="max-width:92vw;max-height:92vh;border-radius:8px" />
  </div>
  <div id="ppLinkModal" tabindex="-1" onkeydown="if(event.key==='Escape'){event.preventDefault();ppLinkClose();}" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;align-items:center;justify-content:center;padding:16px;outline:none">
    <div style="width:100%;max-width:960px;height:86vh;background:#fff;border-radius:10px;overflow:hidden;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;padding:6px 8px;background:#fff;border-bottom:1px solid #e9ecef">
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.open(window.ppCurLink||'', '_blank', 'noopener')">Otwórz w nowej karcie</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="ppLinkClose()">Zamknij (ESC)</button>
      </div>
      <iframe id="ppLinkFrame" title="Podgląd" style="flex:1;border:0;width:100%" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
    </div>
  </div>
  <div id="ppAlertModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center">
    <div class="card" style="max-width:440px;width:92%">
      <div class="card-header"><h3 class="card-title mb-0" id="ppAlertTitle">Uwaga</h3></div>
      <div class="card-body" id="ppAlertMsg"></div>
      <div class="card-footer text-end"><button type="button" class="btn btn-secondary" onclick="ppAlertClose()">OK (ESC)</button></div>
    </div>
  </div>
  <script>window.ppLinkMap=${JSON.stringify(ppLinkMap)};window.ppSel=${JSON.stringify(ppSel)};window.ppLinkFor=function(id,fb){var m=window.ppLinkMap[id],s=window.ppSel[id];if(m&&s&&m[s])return m[s];return fb;};window.ppBlockedHosts=['multikino.pl','ebilet.pl'];window.ppOpenLink=function(u){var h=(u||'').split('/')[2]||'';var blocked=window.ppBlockedHosts.some(function(b){return h.indexOf(b)!==-1;});if(blocked){window.open(u,'_blank','noopener');}else{ppLinkOpen(u);}};</script>
  <script>
  (function(){
    var media=document.getElementById('ppMediaModal'), alertM=document.getElementById('ppAlertModal'), linkM=document.getElementById('ppLinkModal');
    window.ppMediaOpen=function(src){var img=document.getElementById('ppMediaImg'); if(img){img.style.maxWidth='92vw';img.style.maxHeight='92vh';img.src=src;} media.style.display='flex';};
    window.ppMediaClose=function(){media.style.display='none';};
    window.ppLinkOpen=function(url){
      window.ppCurLink=url;
      var f=document.getElementById('ppLinkFrame');
      if(f) f.src=url;
      linkM.style.display='flex';
      // Focus the modal chrome so ESC reaches the parent document immediately.
      setTimeout(function(){linkM.focus();},0);
    };
    window.ppLinkClose=function(){var f=document.getElementById('ppLinkFrame'); if(f) f.src='about:blank'; linkM.style.display='none';};
    window.ppAlertOpen=function(title,msg){document.getElementById('ppAlertTitle').textContent=title;document.getElementById('ppAlertMsg').textContent=msg;alertM.style.display='flex';};
    window.ppAlertClose=function(){alertM.style.display='none';};
    // A loaded page/iframe steals focus (e.g. a site calling focus()) — pull focus
    // back to the modal chrome so ESC keeps working.
    var frame=document.getElementById('ppLinkFrame');
    if(frame){frame.addEventListener('load',function(){linkM.focus();});}
    // Capture-phase listener as a safety net for controls inside the modal chrome.
    window.addEventListener('keydown',function(e){if(e.key==='Escape'){ppMediaClose();ppLinkClose();ppAlertClose();}},true);
    // In-place save of a status/tag change — no page reload.
    window.ppUpdate=function(id,formEl){
      var sel=formEl.querySelector('select');
      var fd=new FormData(formEl);
      fetch('/admin/events/'+encodeURIComponent(id),{method:'POST',body:fd})
        .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
        .then(function(){
          if(sel){
            sel.classList.remove('text-success','text-warning','text-danger');
            if(sel.name==='status'){
              if(sel.value==='approved') sel.classList.add('text-success');
              else if(sel.value==='pending') sel.classList.add('text-warning');
              else sel.classList.add('text-danger');
            }else if(sel.name==='tags'){
              if(!sel.value) sel.classList.add('text-warning');
            }
            sel.style.outline='2px solid var(--tblr-success)';
            setTimeout(function(){sel.style.outline='';},700);
          }
        })
        .catch(function(){window.ppAlertOpen('Błąd','Nie udało się zapisać zmiany.');});
    };
    var KEYS=['city','source','status','tag','from','to'];
    var q=new URLSearchParams(location.search);
    var hasQ=[...q.keys()].length>0;
    if(hasQ){KEYS.forEach(function(k){var v=q.get(k); if(v) localStorage.setItem('evFilter:'+k,v);});}
    else{
      var saved={},any=false;
      KEYS.forEach(function(k){var v=localStorage.getItem('evFilter:'+k); if(v){saved[k]=v;any=true;}});
      if(any){Object.keys(saved).forEach(function(k){q.set(k,saved[k]);}); location.replace('/admin/events?'+q.toString()); return;}
    }
    var form=document.querySelector('form[action="/admin/events"]');
    if(form){form.addEventListener('submit',function(){KEYS.forEach(function(k){var el=form.elements[k]; if(el) localStorage.setItem('evFilter:'+k,el.value);});});}
  })();
  </script>`;
  return renderPage(c, status === 'pending' ? 'Moderacja' : 'Eventy', '/admin/events', body);
});

pageRoutes.post('/events/:id', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  const db = c.env.DB;
  const id = c.req.param('id');
  const form = (await c.req.parseBody({ all: true }).catch(() => ({}))) as Record<string, unknown>;

  const rawStatus = Array.isArray(form.status) ? String(form.status[0]) : String(form.status ?? '');
  const status = rawStatus === 'approved' || rawStatus === 'pending' || rawStatus === 'rejected' ? rawStatus : null;
  if (status) {
    if (status === 'rejected') {
      await db.prepare('UPDATE posts SET status = ? WHERE id = ?').bind(status, id).run();
    } else {
      await db.prepare('UPDATE posts SET status = ?, rejection_reason = NULL WHERE id = ?').bind(status, id).run();
    }
  }

  const tagsRaw = Array.isArray(form.tags) ? String(form.tags[0]) : String(form.tags ?? '');
  const tag = CANONICAL_TAG_SET.has(tagsRaw) ? tagsRaw : null;
  const tagsJsonStr = tag ? JSON.stringify([tag]) : null;
  await db.prepare('UPDATE posts SET tags = ? WHERE id = ?').bind(tagsJsonStr, id).run();

  return c.json({ ok: true, status, tag });
});

// ---------- Users ----------
pageRoutes.get('/users', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(`SELECT u.id, u.device_id, u.username, u.auth_provider, u.created_at,
      (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id) AS post_count,
      (SELECT COUNT(*) FROM views v WHERE v.user_id=u.id) AS view_count,
      EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id=u.device_id) AS banned
      FROM users u ORDER BY u.created_at DESC LIMIT 200`).all();
  const rows = (results as any[]).map((u) => `<tr>
    <td class="font-monospace">${esc(u.device_id)}</td><td>${esc(u.username || '—')}</td>
    <td>${esc(u.auth_provider)}</td><td>${fmtDate(u.created_at)}</td>
    <td>${u.post_count}</td><td>${u.view_count}</td>
    <td>${u.banned ? pill('BAN', 'err') : pill('ok', 'ok')}</td></tr>`).join('');
  const body = `<h2 class="mb-3">Użytkownicy</h2>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Device</th><th>Username</th><th>Provider</th><th>Utworzony</th><th>Posty</th><th>Views</th><th>Status</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Użytkownicy', '/admin/users', body);
});

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
    ${p.thumb_key ? `<td><img src="/media/${esc(p.thumb_key)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px" loading="lazy" /></td>` : '<td>—</td>'}</tr>`).join('');
  const body = `<h2 class="mb-3">Posty (live)</h2>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Autor</th><th>Opis</th><th>Czas</th><th>Like</th><th>Views</th><th>Status</th><th>Media</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Posty', '/admin/posts', body);
});

// ---------- Seed ----------
pageRoutes.get('/seed', async (c) => {
  const db = c.env.DB;
  const since = Date.now() - 30 * 86400000;
  const { results } = await db.prepare('SELECT * FROM seed_runs WHERE created_at>=? ORDER BY created_at DESC LIMIT 500').bind(since).all();
  const { results: batches } = await db.prepare('SELECT id, day, status, scopes_total, scopes_done, reason, created_at, updated_at FROM seed_batches WHERE created_at>=? ORDER BY created_at DESC LIMIT 50').bind(since).all();
  const budget = c.env.BROWSER ? await browserBudget(c.env) : null;
  const cron = await cronInfo(c.env, db);
  const rows = (results as any[]).map((r) => `<tr>
    <td>${fmtDate(r.created_at)}</td><td>${esc(r.day)}</td>
    <td>${r.run_type === 'cron' ? pill('cron', 'ok') : pill('manual', 'muted')}</td>
    <td>${esc(r.provider)}</td><td>${esc(r.transport)}</td>
    <td>${r.candidates}</td><td>${r.ingested}</td><td>${r.skipped}</td>
    <td class="${r.errors ? 'text-danger fw-bold' : 'text-success'}">${r.errors}</td>
    <td>${fmtDur(r.duration_ms)}</td><td>${fmtDur(r.browser_ms)}</td>
    ${r.error_detail ? `<td class="font-monospace text-danger" title="${esc(r.error_detail)}">${esc(r.error_detail.slice(0, 30))}</td>` : '<td>—</td>'}</tr>`).join('');

  const batchPill = (s: string) =>
    s === 'done' ? pill('done', 'ok') :
    s === 'failed' ? pill('failed', 'err') :
    s === 'ingesting' ? pill('ingesting', 'warn') :
    s === 'fetching' ? pill('fetching', 'warn') : pill(esc(s), 'muted');
  const batchRows = (batches as any[]).map((b) => `<tr>
    <td class="font-monospace">${esc(b.id.slice(0, 8))}</td><td>${esc(b.day)}</td>
    <td>${batchPill(b.status)}</td>
    <td>${b.scopes_done}/${b.scopes_total}</td>
    <td>${fmtDate(b.updated_at)}</td>
    <td>${b.reason ? `<span class="text-danger" title="${esc(b.reason)}">${esc((b.reason as string).slice(0, 40))}</span>` : '—'}</td></tr>`).join('');

  let budgetHtml = '';
  if (budget) {
    budgetHtml = `<div class="alert ${budget.exceeded ? 'alert-danger' : 'alert-success'} d-flex align-items-center" style="gap:12px">
      <span>Budget Browser Run (miesiąc): <strong>${fmtPct(budget.monthMs, budget.limitMs)}</strong> (${fmtDur(budget.monthMs)} / ${fmtDur(budget.limitMs)})</span>
      ${budget.exceeded ? '<strong>PRZEKROCZONY</strong>' : ''}</div>`;
  }
  const cronHtml = `<div class="alert alert-light d-flex align-items-center" style="gap:12px;flex-wrap:wrap">
    <span><strong>Cron:</strong> ${esc(cron.schedules.join(', '))} — ${esc(cron.summary)}</span>
    ${cron.nextRunMs ? `<span class="text-secondary">Następny: <strong>${fmtDate(cron.nextRunMs)}</strong></span>` : ''}
    ${cron.lastCronRunMs ? `<span class="text-secondary">Ostatni: ${fmtDate(cron.lastCronRunMs)}</span>` : '<span class="text-warning">Cron nie wystartował</span>'}</div>`;

  const body = `<h2 class="mb-3">Seed</h2>${cronHtml}${budgetHtml}
  <form method="post" action="/admin/seed/run" class="mb-3"><button class="btn btn-primary">▶ Seed jutro (ręcznie)</button></form>
  <div class="card mb-3"><div class="card-header"><h3 class="card-title">Batche (kolejki)</h3></div><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Batch</th><th>Dzień</th><th>Status</th><th>Scope</th><th>Ostatnia aktywność</th><th>Powód</th></tr></thead>
    <tbody>${batchRows || `<tr><td colspan="6">${empty()}</td></tr>`}</tbody></table></div></div>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Czas</th><th>Dzień</th><th>Typ</th><th>Provider</th><th>Transport</th><th>Cand</th><th>Ingest</th><th>Skip</th><th>Err</th><th>Czas</th><th>Browser</th><th>Błąd</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="12">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Seed', '/admin/seed', body);
});

pageRoutes.post('/seed/run', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  // Fire-and-forget: return immediately; seed runs in the background (up to the
  // 15 min cron wall time). The seed page polls/refreshes to show the new run.
  const ctx = c.executionCtx;
  ctx.waitUntil(
    seedTomorrow(c.env)
      .then((r) => console.log(`admin seed run: day=${r.day} ingested=${r.total.ingested} errors=${r.total.errors} browserMs=${r.total.browserMs}`))
      .catch((e) => console.error(`admin seed run failed: ${(e as Error).message}`))
  );
  return c.redirect('/admin/seed');
});

// ---------- Stats ----------
pageRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  const days = 14;
  const since = Date.now() - days * 86400000;
  const views = await daySeries(db, 'views', 'created_at', since);
  const media = await daySeries(db, 'posts', 'created_at', since);
  const logins = await daySeries(db, 'auth_events', 'created_at', since, " AND event='login'");
  const signups = await daySeries(db, 'auth_events', 'created_at', since, " AND event='register'");
  const likes = await daySeries(db, 'likes', 'created_at', since);
  const shares = await daySeries(db, 'shares', 'created_at', since);
  const toBars = (s: { d: string; n: number }[]) => bars(s.map((x) => ({ label: x.d.slice(5), value: x.n })));
  const block = (t: string, s: { d: string; n: number }[]) =>
    `<div class="card mb-3"><div class="card-header"><h3 class="card-title">${t}</h3></div><div class="card-body">${s.length ? toBars(s) : empty()}</div></div>`;
  const body = `<h2 class="mb-3">Statystyki · ${days} dni</h2>${block('Views', views)}${block('Media dodane', media)}${block('Logowania', logins)}${block('Rejestracje', signups)}${block('Like', likes)}${block('Share', shares)}`;
  return renderPage(c, 'Statystyki', '/admin/stats', body);
});

// ---------- Errors ----------
pageRoutes.get('/errors', async (c) => {
  const db = c.env.DB;
  const since = Date.now() - 7 * 86400000;
  const { results } = await db.prepare('SELECT * FROM client_errors WHERE created_at>=? ORDER BY created_at DESC LIMIT 200').bind(since).all();
  const rows = (results as any[]).map((e) => `<tr>
    <td>${fmtDate(e.created_at)}</td><td class="font-monospace">${esc(e.device_id || '—')}</td>
    <td>${pill(esc(e.error_type), 'err')}</td><td>${esc((e.message || '').slice(0, 80))}</td>
    ${e.meta ? `<td class="font-monospace" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.meta)}">${esc(e.meta.slice(0, 50))}</td>` : '<td>—</td>'}</tr>`).join('');
  const body = `<h2 class="mb-3">Błędy klienta</h2>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Czas</th><th>Device</th><th>Typ</th><th>Message</th><th>Meta</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Błędy', '/admin/errors', body);
});

// ---------- Media requests ----------
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

// ---------- Reports (UGC moderation) ----------
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
    <tbody>${rows || `<tr><td colspan="9">${empty()}</td></tr>`}</tbody></table></div></div>`;
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
