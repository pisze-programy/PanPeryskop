// Admin dashboard SSR pages, mounted at /admin. Rendered server-side (Tabler UI).
import { Hono } from 'hono';
import { bars, cards, empty, esc, fmtDate, fmtDur, fmtPct, page, pill } from '../ui';
import { adminLogin, getClientIp } from '../auth';
import { CITIES, cityBbox } from '../cities';
import { browserBudget, cronInfo, daySeries, eventsSql, eventsCountSql, nearestCity, EventFilter } from '../queries';
import { clearCookie, fmtPctNum, requireSession, setSessionCookie } from './common';
import { STATUS_REJECTED } from '../../core/models';
import { CANONICAL_TAGS, CANONICAL_TAG_SET, TAG_LABELS } from '../../seed/core/tags';
import { tagCatalog, tagIdSet } from '../../core/tagCatalog';
import { diacriticFold } from '../../seed/core/match';
import { todayWarsaw, addDaysWarsaw } from '../../seed/core/dates';
import { SEED_DAYS_AHEAD } from '../../seed/core/constants';

export const pageRoutes = new Hono<{ Bindings: Env }>();

// Relative day label mirroring the app's story clock: Dziś / Jutro / Pojutrze,
// otherwise the full weekday name (e.g. "Środa").
function dayLabel(dateStr: string): string {
  const today = todayWarsaw();
  const diff = Math.round((Date.parse(`${dateStr}T00:00:00+02:00`) - Date.parse(`${today}T00:00:00+02:00`)) / 86400000);
  if (diff === 0) return 'Dziś';
  if (diff === 1) return 'Jutro';
  if (diff === 2) return 'Pojutrze';
  const s = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', timeZone: 'Europe/Warsaw' }).format(new Date(`${dateStr}T12:00:00+02:00`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

function tagSlug(label: string): string {
  return diacriticFold(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

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
  const today = todayWarsaw();
  const windowEnd = addDaysWarsaw(today, SEED_DAYS_AHEAD);
  const [users, posts, evToday, viewsToday, likes, shares, errs, mediaReq, lastSeed, cron, budget, windowRows] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts WHERE category=? AND event_date=?').bind('events', today).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM views WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM likes').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM shares').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM media_requests').first<{ n: number }>(),
    db.prepare('SELECT * FROM seed_batches ORDER BY created_at DESC LIMIT 1').first<Record<string, unknown>>(),
    cronInfo(c.env, db),
    c.env.BROWSER ? await browserBudget(c.env) : null,
    db.prepare(`SELECT event_date, status, COUNT(*) n FROM posts
                WHERE category='events' AND event_date BETWEEN ? AND ? GROUP BY event_date, status`)
      .bind(today, windowEnd).all<{ event_date: string; status: string; n: number }>(),
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

  // Events window card: today..today+SEED_DAYS_AHEAD, per-day Approved/Pending/Rejected.
  const perDay = new Map<string, { approved: number; pending: number; rejected: number }>();
  for (const r of windowRows?.results || []) {
    const d = perDay.get(r.event_date) ?? { approved: 0, pending: 0, rejected: 0 };
    if (r.status === 'approved') d.approved += r.n;
    else if (r.status === 'pending') d.pending += r.n;
    else if (r.status === 'rejected') d.rejected += r.n;
    perDay.set(r.event_date, d);
  }
  const sums = { approved: 0, pending: 0, rejected: 0 };
  const windowRowsHtml = Array.from({ length: SEED_DAYS_AHEAD + 1 }, (_, i) => {
    const day = addDaysWarsaw(today, i);
    const d = perDay.get(day) ?? { approved: 0, pending: 0, rejected: 0 };
    sums.approved += d.approved; sums.pending += d.pending; sums.rejected += d.rejected;
    const total = d.approved + d.pending + d.rejected;
    return `<tr>
      <td class="fw-bold">${esc(dayLabel(day))}<span class="text-muted fw-normal"> · ${esc(day)}</span></td>
      <td>${total}</td>
      <td class="text-success">${d.approved}</td>
      <td class="text-warning">${d.pending}</td>
      <td class="text-danger">${d.rejected}</td></tr>`;
  }).join('');
  const windowHtml = `<div class="card mb-3"><div class="card-header"><h3 class="card-title">Eventy — okno (${SEED_DAYS_AHEAD + 1} dni)</h3></div>
    <div class="table-responsive"><table class="table table-vcenter card-table mb-0">
      <thead><tr><th>Dzień</th><th>Wszystkie</th><th class="text-success">Approved</th><th class="text-warning">Pending</th><th class="text-danger">Rejected</th></tr></thead>
      <tbody>${windowRowsHtml}<tr class="table-light">
        <td class="fw-bold">Suma</td><td>${sums.approved + sums.pending + sums.rejected}</td>
        <td class="text-success">${sums.approved}</td><td class="text-warning">${sums.pending}</td><td class="text-danger">${sums.rejected}</td></tr>
      </tbody></table></div></div>`;

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

  // Last seed card — the most recent batch (queue pipeline's run unit) plus the
  // aggregate of its scope runs (the legacy seed_runs provider='total' row was
  // never written by the queue path, so the old card was dead).
  let seedHtml = `<div class="card mb-3"><div class="card-header"><h3 class="card-title">Ostatni seed</h3></div><div class="card-body">`;
  const batch = lastSeed as any;
  if (batch) {
    const agg = await db.prepare(
      `SELECT COALESCE(SUM(candidates),0) cands, COALESCE(SUM(ingested),0) ingested,
              COALESCE(SUM(errors),0) errors, COALESCE(SUM(duration_ms),0) dur, COALESCE(SUM(browser_ms),0) browser
       FROM seed_runs WHERE batch_id=?`
    ).bind(batch.id).first<{ cands: number; ingested: number; errors: number; dur: number; browser: number }>();
    const st = (s: string) =>
      s === 'done' ? pill('done', 'ok') :
      s === 'failed' ? pill('failed', 'err') :
      s === 'ingesting' ? pill('ingesting', 'warn') :
      s === 'fetching' ? pill('fetching', 'warn') : pill(esc(s), 'muted');
    seedHtml += `<div class="row g-3">
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Dzień</div><div class="fw-bold">${esc(batch.day)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Typ</div><div>${esc(batch.run_type)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Status</div><div>${st(batch.status)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Scope</div><div class="fw-bold">${batch.scopes_done}/${batch.scopes_total}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Ingest</div><div class="fw-bold">${agg?.ingested ?? 0}/${agg?.cands ?? 0}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Błędy</div><div class="${(agg?.errors ?? 0) ? 'text-danger' : 'text-success'}">${agg?.errors ?? 0}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Czas</div><div>${fmtDur(agg?.dur ?? 0)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Browser</div><div>${fmtDur(agg?.browser ?? 0)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Aktualizacja</div><div>${fmtDate(batch.updated_at)}</div></div>
      ${batch.reason ? `<div class="col-12"><div class="text-danger" style="font-size:12px">Powód: ${esc(batch.reason)}</div></div>` : ''}
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

  const body = `<h2 class="mb-3">Overview</h2>${ccards}${windowHtml}${cronHtml}${seedHtml}
  <div class="d-flex gap-2"><a class="btn btn-outline-secondary" href="/admin/stats">Statystyki</a><a class="btn btn-outline-secondary" href="/admin/seed">Logi seed</a></div>`;
  return renderPage(c, 'Overview', '/admin', body);
});

// ---------- Events / Moderacja ----------
const EVENT_SOURCES = ['helios', 'multikino', 'cinemacity', 'going', 'kupbilecik', 'dzisapp', 'eventylive', 'luma', 'meetup'];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Escape a string for embedding inside a single-quoted JS string in an onclick
// attribute. Backslash first so the \uXXXX escapes we add stay literal; " and '
// become unicode escapes (safe in both the HTML attribute and the JS string),
// and < > & are escaped so attacker-controlled text can never break out.
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

// Status dropdown — colored per status, auto-submits on change; carries the
// current single tag as a hidden field so a status change never wipes it.
function statusSelect(e: { id: string; status: string; tag: string }): string {
  const colorCls = e.status === 'approved' ? ' text-success' : e.status === 'pending' ? ' text-warning' : ' text-danger';
  const opts = ['approved', 'pending', 'rejected'].map((s) =>
    `<option value="${s}" ${e.status === s ? 'selected' : ''} style="color:var(--tblr-${s === 'approved' ? 'success' : s === 'pending' ? 'warning' : 'danger'})">${s}</option>`).join('');
  return `<form method="post" action="/admin/events/${esc(e.id)}">
    <select name="status" class="form-select form-select-sm${colorCls}" onchange="ppUpdate('${esc(e.id)}', this.form)">${opts}</select>
    <input type="hidden" name="field" value="status" />
    <input type="hidden" name="tags" value="${esc(e.tag)}" /></form>`;
}

// Single tag dropdown — one tag per event, "— brak —" when none (highlighted so
// missing tags are visible). Auto-submits on change; carries status hidden.
function tagSelect(e: { id: string; status: string; tag: string }, catalog: { id: string; label: string }[]): string {
  const hasTag = e.tag !== '';
  const missingCls = hasTag ? '' : ' text-warning';
  const opts = `<option value="" ${!hasTag ? 'selected' : ''}>— brak —</option>` + catalog.map((t) =>
    `<option value="${esc(t.id)}" ${e.tag === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  return `<form method="post" action="/admin/events/${esc(e.id)}">
    <select name="tags" class="form-select form-select-sm${missingCls}" onchange="ppUpdate('${esc(e.id)}', this.form)">${opts}</select>
    <input type="hidden" name="field" value="tag" />
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

// Google Maps URLs — `embed` renders in the modal iframe, `plain` is the regular
// maps page (for "open in a new tab"). Exact coords when available, otherwise the
// city bbox center (same fallback as the app).
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

const PIN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><use href="#icon-map-pin"/></svg>`;

// Place row: pin icon + "Miasto, VENUE"; opens the Google Maps embed in the modal
// (ESC closes), with the plain maps page as the "open in new tab" target.
function placeHtml(lat: number | null, lng: number | null, loc: string): string {
  const label = esc(placeLabel(loc, lat, lng));
  const urls = placeUrls(lat, lng, loc);
  if (!urls.embed) return `<div class="text-secondary" style="font-size:13px">${PIN_ICON} ${label}</div>`;
  return `<div class="text-secondary" style="font-size:13px"><a href="javascript:void(0)" onclick="ppLinkOpen('${jsStr(urls.embed)}', '${jsStr(urls.plain!)}');return false;" class="text-reset text-decoration-none">${PIN_ICON} ${label}</a></div>`;
}

// Full place cell (wrapped so the "Zmień GEO" save can swap it in place).
function placeCellHtml(id: string, lat: number | null, lng: number | null, loc: string): string {
  return `<div class="pp-place-cell" data-id="${esc(id)}">${placeHtml(lat, lng, loc)}</div>`;
}

// "⋯" geo button for a row. Swapped in-place alongside the place cell after a
// geo save so the modal re-opens with the NEW values, not the page-load ones.
function geoButtonHtml(id: string, loc: string, lat: number | null, lng: number | null): string {
  return `<button type="button" class="btn btn-sm btn-icon btn-outline-secondary pp-geo-btn" data-id="${esc(id)}" title="Zmień GEO" onclick="ppGeoOpen('${esc(id)}','${jsStr(loc)}','${lat ?? ''}','${lng ?? ''}')">⋯</button>`;
}

// Rewrite the "Lokalizacja" part of a seed description ("Tytuł: HH:MM, Lokalizacja").
// Returns null when the description does NOT match the seed format — callers must
// then leave the description untouched instead of replacing it wholesale.
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
  const geo = q.geo ? String(q.geo) : null;
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);
  const PAGE_SIZE = 100;

  const filter: EventFilter = { cityId, source, status, from, to, tag, geo, fromMs: null, toMs: null, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
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
  const catalog = await tagCatalog(db);
  const tagOpts = `<option value="">Wszystkie tagi</option><option value="none" ${tag === 'none' ? 'selected' : ''}>Brak</option>` + catalog.map((t) =>
    `<option value="${esc(t.id)}" ${tag === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('');

  const qs = new URLSearchParams();
  if (cityId) qs.set('city', cityId);
  if (source) qs.set('source', source);
  if (status) qs.set('status', status);
  if (tag) qs.set('tag', tag);
  if (geo) qs.set('geo', geo);
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
        ${placeCellHtml(e.id, e.lat, e.lng, loc)}
        ${dateCell({ id: e.id, event_date: e.event_date, showtimes: e.showtimes, time })}
      </td>
      <td>${statusSelect({ id: e.id, status: e.status, tag })}</td>
      <td>${tagSelect({ id: e.id, status: e.status, tag }, catalog)}</td>
      <td class="text-end">${geoButtonHtml(e.id, loc, e.lat, e.lng)}</td></tr>`;
  }).join('');

  const body = `<h2 class="mb-3">${status === 'pending' ? 'Moderacja' : 'Eventy'}</h2>
  <form method="get" action="/admin/events" class="row g-2 mb-3">
    <div class="col-6 col-md-2"><label class="form-label">Miasto</label><select name="city" class="form-select" onchange="this.form.submit()">${cityOpts}</select></div>
    <div class="col-6 col-md-2"><label class="form-label">Źródło</label><select name="source" class="form-select" onchange="this.form.submit()">${srcOpts}</select></div>
    <div class="col-6 col-md-2"><label class="form-label">Status</label><select name="status" class="form-select" onchange="this.form.submit()">${statusOpts}</select></div>
    <div class="col-6 col-md-2"><label class="form-label">Tag</label><select name="tag" class="form-select" onchange="this.form.submit()">${tagOpts}</select></div>
    <div class="col-6 col-md-2"><label class="form-label">Geo</label><select name="geo" class="form-select" onchange="this.form.submit()">
      <option value="">Wszystkie</option>
      <option value="default" ${geo === 'default' ? 'selected' : ''}>Default bbox</option>
    </select></div>
    <div class="col-6 col-md-2"><label class="form-label">Data od</label><input name="from" type="date" class="form-control" value="${esc(from || '')}" onchange="this.form.submit()" /></div>
    <div class="col-6 col-md-2"><label class="form-label">Data do</label><input name="to" type="date" class="form-control" value="${esc(to || '')}" onchange="this.form.submit()" /></div>
    <div class="col-12 d-flex align-items-end">
      <a class="btn btn-outline-secondary" href="/admin/events" onclick="try{['city','source','status','tag','from','to','geo'].forEach(function(k){localStorage.removeItem('evFilter:'+k);});}catch(e){}">Wyczyść</a>
    </div>
  </form>
  ${pager}
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Media</th><th>Wydarzenie</th><th>Status</th><th>Tagi</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">${empty()}</td></tr>`}</tbody></table></div></div>
  ${pager}
  <div id="ppMediaModal" onclick="ppMediaClose()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out">
    <img id="ppMediaImg" alt="" style="max-width:92vw;max-height:92vh;border-radius:8px" />
  </div>
  <div id="ppLinkModal" tabindex="-1" onkeydown="if(event.key==='Escape'){event.preventDefault();ppLinkClose();}" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;align-items:center;justify-content:center;padding:16px;outline:none">
    <div style="width:100%;max-width:960px;height:86vh;background:#fff;border-radius:10px;overflow:hidden;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;padding:6px 8px;background:#fff;border-bottom:1px solid #e9ecef">
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.open(window.ppCurExternal||window.ppCurLink||'', '_blank', 'noopener')">Otwórz w nowej karcie</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="ppLinkClose()">Zamknij (ESC)</button>
      </div>
      <iframe id="ppLinkFrame" title="Podgląd" style="flex:1;border:0;width:100%" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
    </div>
  </div>
  <div id="ppAlertModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;align-items:center;justify-content:center">
    <div class="card" style="max-width:440px;width:92%">
      <div class="card-header"><h3 class="card-title mb-0" id="ppAlertTitle">Uwaga</h3></div>
      <div class="card-body" id="ppAlertMsg"></div>
      <div class="card-footer text-end"><button type="button" class="btn btn-secondary" onclick="ppAlertClose()">OK (ESC)</button></div>
    </div>
  </div>
  <div id="ppGeoModal" tabindex="-1" onkeydown="if(event.key==='Escape'){event.preventDefault();ppGeoClose();}" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;padding:16px;outline:none">
    <div class="card" style="max-width:460px;width:100%">
      <div class="card-header"><h3 class="card-title mb-0">Zmień GEO</h3></div>
      <div class="card-body">
        <div class="mb-3"><label class="form-label">Nazwa lokalizacji</label><input id="ppGeoName" class="form-control" placeholder="np. Multikino Złote Tarasy" /></div>
        <div class="mb-1"><label class="form-label">Geo (lat, lng)</label><input id="ppGeoCoord" class="form-control" placeholder="54.42656865607224, 18.58054868650763" /></div>
        <div class="text-secondary" style="font-size:12px">Wklej współrzędne z Google Maps (np. <span class="font-monospace">54.42656865607224, 18.58054868650763</span>). Zmiana jest trwała — nadpisuje dane seeda dla tego wydarzenia.</div>
      </div>
      <div class="card-footer d-flex justify-content-end align-items-center">
        <div>
          <button type="button" class="btn btn-outline-secondary" onclick="ppGeoClose()">Anuluj</button>
          <button type="button" class="btn btn-primary" onclick="ppGeoSave()">Zapisz</button>
        </div>
      </div>
    </div>
  </div>
  <script>window.ppLinkMap=${JSON.stringify(ppLinkMap)};window.ppSel=${JSON.stringify(ppSel)};window.ppLinkFor=function(id,fb){var m=window.ppLinkMap[id],s=window.ppSel[id];if(m&&s&&m[s])return m[s];return fb;};window.ppBlockedHosts=['multikino.pl','ebilet.pl'];window.ppOpenLink=function(u){var h=(u||'').split('/')[2]||'';var blocked=window.ppBlockedHosts.some(function(b){return h.indexOf(b)!==-1;});if(blocked){window.open(u,'_blank','noopener');}else{ppLinkOpen(u);}};</script>
  <script>
  (function(){
    var media=document.getElementById('ppMediaModal'), alertM=document.getElementById('ppAlertModal'), linkM=document.getElementById('ppLinkModal');
    window.ppMediaOpen=function(src){var img=document.getElementById('ppMediaImg'); if(img){img.style.maxWidth='92vw';img.style.maxHeight='92vh';img.src=src;} media.style.display='flex';};
    window.ppMediaClose=function(){media.style.display='none';};
    window.ppLinkOpen=function(url,external){
      window.ppCurLink=url;
      window.ppCurExternal=external||url;
      var f=document.getElementById('ppLinkFrame');
      if(f) f.src=url;
      linkM.style.display='flex';
      // Focus the modal chrome so ESC reaches the parent document immediately.
      setTimeout(function(){linkM.focus();},0);
    };
    window.ppLinkClose=function(){var f=document.getElementById('ppLinkFrame'); if(f) f.src='about:blank'; linkM.style.display='none';};
    window.ppAlertOpen=function(title,msg){document.getElementById('ppAlertTitle').textContent=title;document.getElementById('ppAlertMsg').textContent=msg;alertM.style.display='flex';};
    window.ppAlertClose=function(){alertM.style.display='none';};
    var geoM=document.getElementById('ppGeoModal');
    window.ppGeoId=null;
    window.ppGeoOpen=function(id,loc,lat,lng){
      window.ppGeoId=id;
      document.getElementById('ppGeoName').value=loc||'';
      document.getElementById('ppGeoCoord').value=(lat&&lng)?lat+', '+lng:'';
      geoM.style.display='flex';
      setTimeout(function(){geoM.focus();document.getElementById('ppGeoName').select();},0);
    };
    window.ppGeoClose=function(){geoM.style.display='none';window.ppGeoId=null;};
    window.ppGeoSwap=function(id,placeHtml,geoBtn){
      var cell=document.querySelector('.pp-place-cell[data-id="'+id+'"]');
      if(cell&&placeHtml) cell.outerHTML=placeHtml;
      var btn=document.querySelector('.pp-geo-btn[data-id="'+id+'"]');
      if(btn&&geoBtn) btn.outerHTML=geoBtn;
    };
    window.ppGeoSave=function(){
      var id=window.ppGeoId; if(!id) return;
      var name=document.getElementById('ppGeoName').value.trim();
      // Google Maps copy format "54.42656865607224, 18.58054868650763" — strip
      // all whitespace + invisible chars (nbsp, zero-width) before parsing.
      // NOTE: backslashes are doubled — this source is a TS template literal, and
      // a bare \d / \s would be dropped when the inline script is emitted.
      var coord=(document.getElementById('ppGeoCoord').value||'').replace(/[\\u200B-\\u200F\\uFEFF\\u00A0\\s]+/g,'');
      var m=/^(-?\\d+(?:\\.\\d+)?)[,;](-?\\d+(?:\\.\\d+)?)$/.exec(coord);
      if(!name){window.ppAlertOpen('Błąd','Podaj nazwę lokalizacji.');return;}
      if(!m){window.ppAlertOpen('Błąd','Nieprawidłowe współrzędne. Wklej np. 54.42656865607224, 18.58054868650763');return;}
      fetch('/admin/events/'+encodeURIComponent(id)+'/geo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,lat:parseFloat(m[1]),lng:parseFloat(m[2])})})
        .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
        .then(function(resp){window.ppGeoSwap(id,resp&&resp.placeHtml,resp&&resp.geoBtn);window.ppGeoClose();})
        .catch(function(){window.ppAlertOpen('Błąd','Nie udało się zapisać GEO.');});
    };
    };
    // A loaded page/iframe steals focus (e.g. a site calling focus()) — pull focus
    // back to the modal chrome so ESC keeps working.
    var frame=document.getElementById('ppLinkFrame');
    if(frame){frame.addEventListener('load',function(){linkM.focus();});}
    // Capture-phase listener as a safety net for controls inside the modal chrome.
    window.addEventListener('keydown',function(e){if(e.key==='Escape'){ppMediaClose();ppLinkClose();ppAlertClose();ppGeoClose();}},true);
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
    var KEYS=['city','source','status','tag','from','to','geo'];
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
  const tag = tagsRaw && (CANONICAL_TAG_SET.has(tagsRaw) || (await tagIdSet(db)).has(tagsRaw)) ? tagsRaw : null;
  const tagsJsonStr = tag ? JSON.stringify([tag]) : null;
  const field = Array.isArray(form.field) ? String(form.field[0]) : String(form.field ?? '');
  if (field === 'tag') {
    // Manual tag edits lock the tag so re-seeds keep the admin's choice.
    await db.prepare('UPDATE posts SET tags = ?, tags_locked = 1 WHERE id = ?').bind(tagsJsonStr, id).run();
  } else {
    await db.prepare('UPDATE posts SET tags = ? WHERE id = ?').bind(tagsJsonStr, id).run();
  }

  return c.json({ ok: true, status, tag });
});

// Set a single event's geo (location name + coords). Geo edits are permanent —
// geo_locked is set and never reset, so re-seeds keep the admin's coordinates and
// description. Returns the fresh place cell + geo button so the row updates in place.
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
  // Only rewrite the location part when the description matches the seed format;
  // otherwise leave it untouched (never replace the whole description with the name).
  const desc = rewriteLoc(row?.description ?? '', name);
  if (desc !== null) {
    await db.prepare('UPDATE posts SET lat = ?, lng = ?, description = ?, geo_locked = 1 WHERE id = ?').bind(lat, lng, desc, id).run();
  } else {
    await db.prepare('UPDATE posts SET lat = ?, lng = ?, geo_locked = 1 WHERE id = ?').bind(lat, lng, id).run();
  }
  const loc = desc !== null ? name : (descParts(row?.description ?? '').loc || name);
  return c.json({ ok: true, placeHtml: placeCellHtml(id, lat, lng, loc), geoBtn: geoButtonHtml(id, loc, lat, lng) });
});

// ---------- Tags ----------
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

// ---------- Users ----------
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
const batchStatusPill = (s: string) =>
  s === 'done' ? pill('done', 'ok') :
  s === 'failed' ? pill('failed', 'err') :
  s === 'ingesting' ? pill('ingesting', 'warn') :
  s === 'fetching' ? pill('fetching', 'warn') :
  s === 'fetch_done' ? pill('fetch_done', 'warn') : pill(esc(s), 'muted');

const scopeStatusPill = (s: string) =>
  s === 'done' ? pill('done', 'ok') :
  s === 'failed' ? pill('failed', 'err') :
  s === 'running' ? pill('running', 'warn') : pill(esc(s), 'muted');

pageRoutes.get('/seed', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const dFrom = q.dfrom ? String(q.dfrom) : null;
  const dTo = q.dto ? String(q.dto) : null;
  const bStatus = q.bstatus ? String(q.bstatus) : null;
  const provider = q.provider ? String(q.provider) : null;
  const transport = q.transport ? String(q.transport) : null;
  const runType = q.rtype ? String(q.rtype) : null;
  const since = Date.now() - 30 * 86400000;

  let bSql = 'SELECT * FROM seed_batches WHERE created_at>=?';
  const bBinds: unknown[] = [since];
  if (dFrom) { bSql += ' AND day>=?'; bBinds.push(dFrom); }
  if (dTo) { bSql += ' AND day<=?'; bBinds.push(dTo); }
  if (bStatus) { bSql += ' AND status=?'; bBinds.push(bStatus); }
  bSql += ' ORDER BY created_at DESC LIMIT 60';
  const { results: batches } = await db.prepare(bSql).bind(...bBinds).all();

  let rSql = 'SELECT * FROM seed_runs WHERE created_at>=?';
  const rBinds: unknown[] = [since];
  if (provider) { rSql += ' AND provider=?'; rBinds.push(provider); }
  if (transport) { rSql += ' AND transport=?'; rBinds.push(transport); }
  if (runType) { rSql += ' AND run_type=?'; rBinds.push(runType); }
  rSql += ' ORDER BY created_at DESC LIMIT 500';
  const { results: runs } = await db.prepare(rSql).bind(...rBinds).all();

  // Fetch each batch's scopes + runs in two IN() queries, group in JS.
  const ids = (batches as any[]).map((b) => b.id);
  const byBatch = new Map<string, any[]>();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const [sc, ru] = await Promise.all([
      db.prepare(`SELECT * FROM seed_scopes WHERE batch_id IN (${ph})`).bind(...ids).all(),
      db.prepare(`SELECT * FROM seed_runs WHERE batch_id IN (${ph})`).bind(...ids).all(),
    ]);
    for (const s of (sc.results ?? []) as any[]) { (byBatch.get(s.batch_id) ?? byBatch.set(s.batch_id, []).get(s.batch_id)!).push({ kind: 'scope', ...s }); }
    for (const r of (ru.results ?? []) as any[]) { (byBatch.get(r.batch_id) ?? byBatch.set(r.batch_id, []).get(r.batch_id)!).push({ kind: 'run', ...r }); }
  }

  const [bCount, bDone, bFailed, errSum] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM seed_batches WHERE created_at>=?').bind(since).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM seed_batches WHERE created_at>=? AND status='done'").bind(since).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM seed_batches WHERE created_at>=? AND status='failed'").bind(since).first<{ n: number }>(),
    db.prepare('SELECT COALESCE(SUM(errors),0) n FROM seed_runs WHERE created_at>=?').bind(since).first<{ n: number }>(),
  ]);
  const budget = c.env.BROWSER ? await browserBudget(c.env) : null;
  const cron = await cronInfo(c.env, db);

  const batchCards = (batches as any[]).map((b) => {
    const items = byBatch.get(b.id) ?? [];
    const scopes = items.filter((x) => x.kind === 'scope');
    const rs = items.filter((x) => x.kind === 'run');
    const scopeRows = scopes.map((s) => `<tr>
      <td class="font-monospace">${esc(s.provider)}</td><td class="font-monospace">${esc(s.scope)}</td>
      <td>${scopeStatusPill(s.status)}</td><td>${s.attempts}</td>
      <td>${s.error ? `<span class="text-danger font-monospace" title="${esc(s.error)}">${esc((s.error as string).slice(0, 50))}</span>` : '—'}</td></tr>`).join('');
    const runRows = rs.map((r) => `<tr>
      <td>${fmtDate(r.created_at)}</td><td>${esc(r.provider)}</td><td>${esc(r.transport)}</td>
      <td>${r.candidates}</td><td>${r.ingested}</td><td>${r.skipped}</td>
      <td class="${r.errors ? 'text-danger fw-bold' : 'text-success'}">${r.errors}</td>
      <td>${fmtDur(r.duration_ms)}</td><td>${fmtDur(r.browser_ms)}</td></tr>`).join('');
    const scopesBlock = `<div class="text-secondary mb-1" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em">Scopy</div>
      <div class="table-responsive mb-3"><table class="table table-sm table-vcenter">
        <thead><tr><th>Provider</th><th>Scope</th><th>Status</th><th>Próby</th><th>Błąd</th></tr></thead>
        <tbody>${scopeRows || `<tr><td colspan="5" class="text-secondary">Brak scopów.</td></tr>`}</tbody></table></div>`;
    const runsBlock = `<div class="text-secondary mb-1" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em">Uruchomienia (seed_runs)</div>
      <div class="table-responsive"><table class="table table-sm table-vcenter">
        <thead><tr><th>Czas</th><th>Provider</th><th>Transport</th><th>Cand</th><th>Ingest</th><th>Skip</th><th>Err</th><th>Czas</th><th>Browser</th></tr></thead>
        <tbody>${runRows || `<tr><td colspan="9" class="text-secondary">Brak logów (batch sprzed linkowania runów).</td></tr>`}</tbody></table></div>`;
    return `<details class="card mb-2">
      <summary class="card-header py-2" style="cursor:pointer">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span class="fw-bold">${esc(b.day)}</span>
          ${b.run_type === 'cron' ? pill('cron', 'ok') : pill('manual', 'muted')}
          ${batchStatusPill(b.status)}
          <span class="text-secondary" style="font-size:12px">Scopy ${b.scopes_done}/${b.scopes_total} · Providerzy ${b.providers_done}/${b.providers_total}</span>
          <span class="text-secondary" style="font-size:12px">${fmtDate(b.updated_at)}</span>
          ${b.reason ? `<span class="text-danger" style="font-size:12px" title="${esc(b.reason)}">${esc((b.reason as string).slice(0, 40))}</span>` : ''}
        </div>
      </summary>
      <div class="card-body">${scopesBlock}${runsBlock}</div>
    </details>`;
  }).join('');

  const runRows = (runs as any[]).map((r) => `<tr>
    <td>${fmtDate(r.created_at)}</td><td>${esc(r.day)}</td>
    <td>${r.run_type === 'cron' ? pill('cron', 'ok') : pill('manual', 'muted')}</td>
    <td>${esc(r.provider)}</td><td>${esc(r.transport)}</td>
    <td>${r.candidates}</td><td>${r.ingested}</td><td>${r.skipped}</td>
    <td class="${r.errors ? 'text-danger fw-bold' : 'text-success'}">${r.errors}</td>
    <td>${fmtDur(r.duration_ms)}</td><td>${fmtDur(r.browser_ms)}</td>
    ${r.error_detail ? `<td class="font-monospace text-danger" title="${esc(r.error_detail)}">${esc(r.error_detail.slice(0, 30))}</td>` : '<td>—</td>'}</tr>`).join('');

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

  const providers = ['helios', 'multikino', 'cinemacity', 'going', 'kupbilecik', 'dzisapp', 'eventylive', 'luma', 'meetup'];
  const sel = (name: string, cur: string | null, opts: string[]) =>
    `<select name="${name}" class="form-select" onchange="this.form.submit()">${opts.map((o) =>
      `<option value="${o}" ${cur === o ? 'selected' : ''}>${o || 'Wszystkie'}</option>`).join('')}</select>`;
  const filterHtml = `<form method="get" action="/admin/seed" class="row g-2 mb-3">
    <div class="col-12"><span class="text-secondary text-uppercase fw-bold" style="font-size:11px">Filtry · Batche</span></div>
    <div class="col-6 col-md-2"><label class="form-label">Dzień od</label><input name="dfrom" type="date" class="form-control" value="${esc(dFrom || '')}" onchange="this.form.submit()" /></div>
    <div class="col-6 col-md-2"><label class="form-label">Dzień do</label><input name="dto" type="date" class="form-control" value="${esc(dTo || '')}" onchange="this.form.submit()" /></div>
    <div class="col-6 col-md-2"><label class="form-label">Status</label>${sel('bstatus', bStatus, ['', 'created', 'fetching', 'fetch_done', 'ingesting', 'done', 'failed'])}</div>
    <div class="col-12"><span class="text-secondary text-uppercase fw-bold" style="font-size:11px">Filtry · Rundy (seed_runs)</span></div>
    <div class="col-6 col-md-2"><label class="form-label">Provider</label>${sel('provider', provider, ['', ...providers])}</div>
    <div class="col-6 col-md-2"><label class="form-label">Transport</label>${sel('transport', transport, ['', 'fetch', 'browser', 'mixed'])}</div>
    <div class="col-6 col-md-2"><label class="form-label">Typ</label>${sel('rtype', runType, ['', 'cron', 'manual'])}</div>
    <div class="col-12 d-flex align-items-end"><a class="btn btn-outline-secondary" href="/admin/seed">Wyczyść filtry</a></div>
  </form>`;

  const body = `<h2 class="mb-3">Seed</h2>
  <div class="alert alert-light mb-3" style="font-size:13px">
    <strong>Jak to czytać?</strong> Seed działa automatycznie (cron, bez przycisków w panelu). Każde uruchomienie tworzy jeden
    <strong>batch</strong> = pełny seed jednego dnia. W batchu <strong>scopy</strong> (jednostki fetch per provider + sekcja)
    przechodzą przez kolejkę; każdy scope loguje uruchomienie w <strong>seed_runs</strong>; pobrane eventy
    (seed_candidates) są deduplikowane i ingestowane. Rozwiń batch, żeby zobaczyć jego scopy i logi.
  </div>
  ${cronHtml}${budgetHtml}
  ${cards([
    { label: 'Batche (30 dni)', value: bCount?.n ?? 0 },
    { label: 'Zakończone', value: bDone?.n ?? 0, color: 'success' },
    { label: 'Failed', value: bFailed?.n ?? 0, color: (bFailed?.n ?? 0) ? 'danger' : '' },
    { label: 'Błędy (runs 30d)', value: errSum?.n ?? 0, color: (errSum?.n ?? 0) ? 'danger' : '' },
  ])}
  ${filterHtml}
  <div class="mb-3"><h3 class="h4">Batche (kolejki)</h3>${batchCards || `<div class="alert alert-light text-secondary">Brak batchy w oknie.</div>`}</div>
  <div class="mb-3"><h3 class="h4">Rundy (seed_runs)</h3>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Czas</th><th>Dzień</th><th>Typ</th><th>Provider</th><th>Transport</th><th>Cand</th><th>Ingest</th><th>Skip</th><th>Err</th><th>Czas</th><th>Browser</th><th>Błąd</th></tr></thead>
    <tbody>${runRows || `<tr><td colspan="12">${empty()}</td></tr>`}</tbody></table></div></div></div>`;
  return renderPage(c, 'Seed', '/admin/seed', body);
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
  <p class="text-secondary">Błędy zgłaszane przez appkę (nieudane background-uploady → DLQ). <strong>Crashy raportuje Apple</strong> — App Store Connect → TestFlight → Crash Reports, nie trafiają tutaj.</p>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Czas</th><th>Device</th><th>Typ</th><th>Message</th><th>Meta</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">${empty()} Brak błędów uploadu w ostatnich 7 dniach.</td></tr>`}</tbody></table></div></div>`;
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
