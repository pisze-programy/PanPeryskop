// Events / Moderacja page: list, filters, status+tag editors, geo override.

import { Hono } from 'hono';
import { empty, esc } from '../../ui';
import { CITIES, cityBbox } from '../../cities';
import { eventsSql, eventsCountSql, nearestCity, EventFilter } from '../../queries';
import { requireSession } from '../common';
import { CANONICAL_TAG_SET } from '../../../seed/core/tags';
import { tagCatalog, tagIdSet } from '../../../core/tagCatalog';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

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
    `<option value="${s}" ${e.status === s ? 'selected' : ''} class="text-${s === 'approved' ? 'success' : s === 'pending' ? 'warning' : 'danger'}">${s}</option>`).join('');
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
  return `<a href="javascript:void(0)" onclick="ppMediaOpen('/media/${esc(full)}');return false;" title="Podgląd">
    <span class="avatar avatar-sm rounded"><img src="/media/${esc(key)}" alt="" loading="lazy" onerror="this.closest('.avatar').classList.add('bg-secondary-lt')" /></span></a>`;
}

// Title: opens the event link (resolved per selected showtime). multikino.pl
// refuses iframes → opened in a new tab automatically; everything else renders in
// the modal. Missing link = DATA ERROR.
function titleHtml(linkUrl: string | null, title: string, id: string, source: string): string {
  const t = esc(title || '—');
  const src = `<span class="text-muted fs-6">(${esc(source)})</span>`;
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

const PIN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="icon align-middle" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#icon-map-pin"/></svg>`;

// Place row: pin icon + "Miasto, VENUE"; opens the Google Maps embed in the modal
// (ESC closes), with the plain maps page as the "open in new tab" target.
function placeHtml(lat: number | null, lng: number | null, loc: string): string {
  const label = esc(placeLabel(loc, lat, lng));
  const urls = placeUrls(lat, lng, loc);
  if (!urls.embed) return `<div class="text-secondary fs-4">${PIN_ICON} ${label}</div>`;
  return `<div class="text-secondary fs-4"><a href="javascript:void(0)" onclick="ppLinkOpen('${jsStr(urls.embed)}', '${jsStr(urls.plain!)}');return false;" class="text-reset text-decoration-none">${PIN_ICON} ${label}</a></div>`;
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
  if (times.length === 0) return `<div class="text-muted fs-5">${d}</div>`;
  if (times.length === 1) return `<div class="text-muted fs-5">${d} · ${esc(times[0])}</div>`;
  const opts = times.map((t, i) => `<option value="${esc(t)}" ${i === 0 ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const sel = `<select class="form-select form-select-sm w-25" onchange="window.ppSel['${esc(e.id)}']=this.value">${opts}</select>`;
  return `<div class="d-flex align-items-center gap-2">
    <span class="text-muted fs-5">${d}</span>${sel}
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
  <div class="modal fade" id="ppMediaModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered modal-xl">
      <div class="modal-content bg-transparent border-0 shadow-none">
        <img id="ppMediaImg" alt="" class="img-fluid mx-auto rounded" onclick="ppMediaClose()" />
      </div>
    </div>
  </div>
  <div class="modal fade" id="ppLinkModal" tabindex="-1">
    <div class="modal-dialog modal-xl">
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
    <div class="modal-dialog modal-dialog-centered modal-sm">
      <div class="modal-content">
        <div class="modal-header"><h3 class="modal-title" id="ppAlertTitle">Uwaga</h3></div>
        <div class="modal-body" id="ppAlertMsg"></div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="ppAlertClose()">OK (ESC)</button></div>
      </div>
    </div>
  </div>
  <div class="modal fade" id="ppGeoModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header"><h3 class="modal-title">Zmień GEO</h3></div>
        <div class="modal-body">
          <div class="mb-3"><label class="form-label">Nazwa lokalizacji</label><input id="ppGeoName" class="form-control" placeholder="np. Multikino Złote Tarasy" /></div>
          <div class="mb-1"><label class="form-label">Geo (lat, lng)</label><input id="ppGeoCoord" class="form-control" placeholder="54.42656865607224, 18.58054868650763" /></div>
          <div class="text-secondary fs-5">Wklej współrzędne z Google Maps (np. <span class="font-monospace">54.42656865607224, 18.58054868650763</span>). Zmiana jest trwała — nadpisuje dane seeda dla tego wydarzenia.</div>
        </div>
        <div class="modal-footer">
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
    // Tabler JS loads at the END of layout, after this inline script — resolve the
    // Modal class at call time, not at init time.
    var modalShow=function(el){var B=window.tabler||window.bootstrap; if(B&&B.Modal&&el) B.Modal.getOrCreateInstance(el).show();};
    var modalHide=function(el){var B=window.tabler||window.bootstrap; if(B&&B.Modal&&el){var m=B.Modal.getInstance(el); if(m) m.hide();}};
    window.ppMediaOpen=function(src){var img=document.getElementById('ppMediaImg'); if(img) img.src=src; modalShow(media);};
    window.ppMediaClose=function(){modalHide(media);};
    window.ppLinkOpen=function(url,external){
      window.ppCurLink=url;
      window.ppCurExternal=external||url;
      var f=document.getElementById('ppLinkFrame');
      if(f) f.src=url;
      modalShow(linkM);
      // Focus the modal chrome so ESC reaches the parent document immediately.
      setTimeout(function(){linkM.focus();},0);
    };
    window.ppLinkClose=function(){var f=document.getElementById('ppLinkFrame'); if(f) f.src='about:blank'; modalHide(linkM);};
    window.ppAlertOpen=function(title,msg){document.getElementById('ppAlertTitle').textContent=title;document.getElementById('ppAlertMsg').textContent=msg;modalShow(alertM);};
    window.ppAlertClose=function(){modalHide(alertM);};
    var geoM=document.getElementById('ppGeoModal');
    window.ppGeoId=null;
    window.ppGeoOpen=function(id,loc,lat,lng){
      window.ppGeoId=id;
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
    // A loaded page/iframe steals focus (e.g. a site calling focus()) — pull focus
    // back to the modal chrome so ESC keeps working.
    var frame=document.getElementById('ppLinkFrame');
    if(frame){frame.addEventListener('load',function(){linkM.focus();});}
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

export function registerEvents(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
