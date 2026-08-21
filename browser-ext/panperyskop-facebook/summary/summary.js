// Summary page: review/edit captured events, see duplicate badges from the
// /preview endpoint, then submit the checked ones (routed to the FB tab for the
// actual upload so fbcdn covers can be fetched in the logged-in context).
// Styled with Tabler (like the admin dashboard) — light theme, card + table.
'use strict';

const TAG_OPTIONS = ['filmy', 'muzyka', 'meetup', 'komedia', 'teatr', 'inne'];
const $ = (sel) => document.querySelector(sel);

let settings = null;
let events = [];
let states = {};
let duplicateByFbId = new Map();
let geoByExt = new Map(); // external_id -> { lat, lng, resolved } preview results

async function init() {
  settings = await PP.settings.get();
  if (!settings.baseUrl || !settings.adminSecret) {
    $('#config-banner').classList.remove('d-none');
  }
  await reload();
  wireButtons();
  if (events.length && settings.baseUrl && settings.adminSecret) {
    runPreview();
    runGeo();
  }
}

async function reload() {
  events = await PP.store.load();
  states = await PP.store.loadStates();
  events.sort((a, b) => (a.startMs || 0) - (b.startMs || 0));
  duplicateByFbId = new Map();
  geoByExt = new Map();
  render();
}

// ---------- rendering ----------
function render() {
  const list = $('#list');
  list.textContent = '';
  $('#count').textContent = `${events.length} captured`;
  if (events.length === 0) {
    list.appendChild(emptyRow());
    return;
  }
  for (const ev of events) list.appendChild(rowFor(ev));
  applyStoredGeo();
}

function emptyRow() {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 8;
  td.className = 'text-center py-5';
  td.innerHTML =
    '<p class="empty-title">No captured events</p>' +
    '<p class="empty-subtitle text-secondary">Open a Facebook events list and scroll — capture and submit are automatic. Watch the console for [ppfb] lines.</p>';
  tr.appendChild(td);
  return tr;
}

function rowFor(ev) {
  const tr = document.createElement('tr');
  tr.dataset.fbId = ev.fbId;

  // ✓ (past events are default-unchecked — the backend rejects them anyway)
  const check = input('checkbox', null, '');
  check.className = 'form-check-input';
  check.checked = !PP.parser.isPastEvent(ev.startMs);
  check.dataset.role = 'check';
  const checkTd = td(check);

  // Media
  const mediaTd = td(thumbFor(ev));

  // Title + URL
  const title = textInput('title', ev.title, 'Title');
  title.className = 'form-control form-control-sm fw-semibold pp-title';
  const link = document.createElement('a');
  link.href = ev.link;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = ev.link;
  link.title = ev.link;
  link.className = 'text-secondary pp-url';
  const titleTd = td(title, link);

  // Date / Location
  const dateTd = td(dtInput(ev.startMs));
  const locTd = td(textInput('location', locationFor(ev), 'Location'));

  // Geo: resolved point badge + a refresh button to re-check after a Location edit
  const geoCell = document.createElement('td');
  geoCell.dataset.role = 'geo';
  geoCell.dataset.fbId = ev.fbId;
  const geoBadge = document.createElement('span');
  geoBadge.dataset.role = 'geo-badge';
  geoBadge.className = 'badge bg-secondary-lt text-secondary';
  geoBadge.textContent = 'geo …';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'btn btn-sm btn-outline-secondary pp-geo-refresh';
  refresh.title = 'Re-check geo';
  refresh.textContent = '⟳';
  refresh.addEventListener('click', () => refreshGeo(ev.fbId));
  geoCell.append(geoBadge, refresh);

  // Tag
  const tagSel = document.createElement('select');
  tagSel.className = 'form-select form-select-sm';
  tagSel.dataset.field = 'tag';
  tagSel.appendChild(new Option('Tag — none', ''));
  for (const t of TAG_OPTIONS) tagSel.appendChild(new Option(t, t));
  tagSel.value = Array.isArray(ev.tags) && ev.tags.length ? ev.tags[0] : '';
  const tagTd = td(tagSel);

  // Status: badges (source/needs-review/duplicate) + submission state
  const meta = document.createElement('div');
  meta.className = 'd-flex gap-1 flex-wrap';
  if (ev.source === 'dom') meta.appendChild(badge('dom', 'muted'));
  if (ev.needsReview || !ev.startMs) meta.appendChild(badge('needs review', 'danger'));
  const st = states[ev.fbId];
  if (st) {
    if (st.status === 'pending') meta.appendChild(badge(`submitted · ${st.reason || 'geo'}`, 'ok'));
    else if (st.status === 'duplicate') meta.appendChild(badge(`duplicate · ${st.reason}`, 'warn'));
    else if (st.status === 'captured') meta.appendChild(badge('in queue', 'info'));
    else if (st.status === 'error') meta.appendChild(badge(`error: ${String(st.reason || '').slice(0, 40)}`, 'danger'));
  }
  const dup = duplicateByFbId.get(`facebook-${ev.fbId}`);
  if (dup) meta.appendChild(dupBadge(dup));

  const result = document.createElement('div');
  result.className = 'd-flex gap-1 flex-wrap';
  result.dataset.role = 'result';
  result.appendChild(badge('pending', 'ok'));

  const statusTd = td(meta, result);

  tr.append(checkTd, mediaTd, titleTd, dateTd, locTd, geoCell, tagTd, statusTd);
  return tr;
}

/** Raw place string for the single Location input (older captures lack it). */
function locationFor(ev) {
  if (ev.location) return ev.location;
  return [ev.venue, ev.address].filter(Boolean).join(', ');
}

function thumbFor(ev) {
  const img = document.createElement('img');
  img.className = 'pp-thumb';
  img.alt = '';
  if (ev.mediaUrl) {
    img.src = ev.mediaUrl;
    img.onerror = () => img.classList.add('pp-thumb-broken');
  } else {
    img.classList.add('pp-thumb-broken');
  }
  return img;
}

function td(...children) {
  const cell = document.createElement('td');
  cell.append(...children);
  return cell;
}

function dupBadge(dup) {
  const b = badge(`duplicate · ${dup.provider}`, 'warn');
  b.title = dup.title;
  return b;
}

function badge(text, cls) {
  const s = document.createElement('span');
  s.className = `badge ${cls}`;
  s.textContent = text;
  return s;
}

function textInput(field, value, placeholder) {
  const el = input('text', field, placeholder);
  el.className = 'form-control form-control-sm';
  el.value = value || '';
  return el;
}

function dtInput(startMs) {
  const el = input('datetime-local', 'startMs', '');
  el.className = 'form-control form-control-sm';
  el.value = startMs ? toLocalInput(startMs) : '';
  return el;
}

function input(type, field, placeholder) {
  const el = document.createElement('input');
  el.type = type;
  if (field) el.dataset.field = field;
  if (placeholder) el.placeholder = placeholder;
  return el;
}

function toLocalInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromLocalInput(v) {
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

// ---------- actions ----------
function wireButtons() {
  $('#btn-refresh').addEventListener('click', async () => {
    await reload();
    if (events.length && settings.baseUrl && settings.adminSecret) {
      runPreview();
      runGeo();
    }
  });
  $('#btn-check-all').addEventListener('click', () => setAllChecked(true));
  $('#btn-uncheck-all').addEventListener('click', () => setAllChecked(false));
  $('#btn-clear').addEventListener('click', clearAll);
  $('#btn-options').addEventListener('click', () => browser.runtime.openOptionsPage());
  $('#link-options').addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
  $('#btn-submit').addEventListener('click', submitAll);
  $('#btn-download').addEventListener('click', downloadSelected);
}

function setAllChecked(value) {
  for (const input of document.querySelectorAll('input[data-role="check"]')) input.checked = value;
}

async function clearAll() {
  if (!confirm('Remove all captured events?')) return;
  await PP.store.clear();
  await reload();
}

// ---------- preview (duplicate badges) ----------
async function runPreview() {
  const payload = events
    .filter((e) => e.startMs)
    .map((e) => ({ externalId: `facebook-${e.fbId}`, title: e.title, startMs: e.startMs, venue: e.venue }));
  if (payload.length === 0) return;
  try {
    const results = await PP.api.preview(settings, payload);
    duplicateByFbId = new Map(results.map((r) => [r.externalId, r]));
    render();
  } catch (e) {
    PP.log.error('preview failed', e);
  }
}

// ---------- geo preview ----------
/** Stored split for geo (re-parse the raw location if the city is missing). */
function geoInputFor(ev) {
  const g = { venue: ev.venue || '', address: ev.address || '', city: ev.city || '' };
  if (!g.city && ev.location) {
    const p = PP.parser.parsePlace(ev.location);
    if (p.city) g.city = p.city;
    if (!g.venue) g.venue = p.venue;
    if (!g.address) g.address = p.address;
  }
  return g;
}

async function runGeo() {
  if (!settings.baseUrl || !settings.adminSecret) return;
  const targets = events.filter((e) => {
    if (PP.parser.isPastEvent(e.startMs)) return false;
    const g = geoInputFor(e);
    return Boolean(g.venue || g.address || g.city);
  });
  if (targets.length === 0) return;
  const payload = targets.map((e) => ({ externalId: `facebook-${e.fbId}`, ...geoInputFor(e) }));
  try {
    const results = await PP.api.geoPreview(settings, payload);
    for (const r of results) geoByExt.set(r.externalId, r);
    applyStoredGeo();
  } catch (e) {
    PP.log.error('geo preview failed', e);
  }
}

async function refreshGeo(fbId) {
  const row = document.querySelector(`tr[data-fb-id="${fbId}"]`);
  const cell = row && row.querySelector('[data-role="geo"]');
  if (!row || !cell) return;
  const place = PP.parser.parsePlace(row.querySelector('[data-field="location"]').value.trim());
  const externalId = `facebook-${fbId}`;
  setGeoBadge(cell, null, 'geo …', 'bg-secondary-lt text-secondary');
  try {
    const results = await PP.api.geoPreview(settings, [{ externalId, ...place }]);
    const r = results[0];
    geoByExt.set(externalId, r);
    applyGeo(cell, r);
  } catch (e) {
    applyGeo(cell, null);
  }
}

function setGeoBadge(cell, cls, text, title) {
  const badgeEl = cell.querySelector('[data-role="geo-badge"]');
  if (!badgeEl) return;
  badgeEl.className = `badge ${cls}`;
  badgeEl.textContent = text;
  if (title) badgeEl.title = title;
}

function applyGeo(cell, result) {
  if (result && result.resolved) {
    setGeoBadge(cell, 'bg-green-lt text-green', `✓ ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}`, '');
  } else if (result && result.reason === 'no_city') {
    setGeoBadge(cell, 'bg-red-lt text-red', 'no city', 'Add the city to the Location field (e.g. "…, Poznań"), then ⟳');
  } else if (result) {
    setGeoBadge(cell, 'bg-red-lt text-red', 'no geo', 'No coordinates — fix the Location field, then ⟳');
  } else {
    setGeoBadge(cell, 'bg-yellow-lt text-yellow', 'geo?', 'geo preview failed — try ⟳');
  }
}

function applyStoredGeo() {
  for (const [externalId, result] of geoByExt) {
    const fbId = externalId.replace(/^facebook-/, '');
    const cell = document.querySelector(`tr[data-fb-id="${fbId}"] [data-role="geo"]`);
    if (cell) applyGeo(cell, result);
  }
}

// ---------- submit ----------
function collectEvents() {
  const out = [];
  for (const row of document.querySelectorAll('#list tr')) {
    const check = row.querySelector('input[data-role="check"]');
    if (!check || !check.checked) continue;
    const fbId = row.dataset.fbId;
    const ev = events.find((e) => e.fbId === fbId);
    if (!ev) continue;
    const field = (name) => row.querySelector(`[data-field="${name}"]`).value.trim();
    const startMs = fromLocalInput(field('startMs'));
    const place = PP.parser.parsePlace(field('location'));
    out.push({
      fbId,
      title: field('title'),
      startMs,
      venue: place.venue,
      address: place.address,
      city: place.city,
      link: ev.link,
      mediaUrl: ev.mediaUrl,
      tags: field('tag') ? [field('tag')] : [],
      needsReview: !startMs,
    });
  }
  return out;
}

function flash(text, cls) {
  const el = $('#flash');
  el.className = `alert ${cls || 'alert-info'}`;
  el.textContent = text;
  el.classList.remove('d-none');
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function submitAll() {
  const selected = collectEvents();
  if (selected.length === 0) {
    alert('Select at least one event.');
    return;
  }
  const missingDate = selected.filter((e) => e.needsReview);
  if (missingDate.length) {
    alert(`Events without a date cannot be submitted: ${missingDate.map((e) => e.title).join(', ')}`);
    return;
  }

  $('#btn-submit').disabled = true;
  flash(`Submitting ${selected.length} event(s)…`, 'alert-info');
  try {
    const res = await withTimeout(
      browser.runtime.sendMessage({ type: 'pp-submit', events: selected }),
      120_000,
      'Submit timed out — no response from the background/content script',
    );
    if (!res || !res.ok) throw new Error((res && res.error) || 'submit failed');
    renderResults(res.results);
    const okCount = (res.results || []).filter((r) => r.ok).length;
    flash(
      `Done: ${okCount}/${selected.length} accepted (see per-event status)`,
      okCount === selected.length ? 'alert-success' : 'alert-warning',
    );
  } catch (e) {
    PP.log.error('submit failed', e);
    flash(`Submit failed: ${e.message}`, 'alert-danger');
  } finally {
    $('#btn-submit').disabled = false;
  }
}

/**
 * Dry-run export: write the selected events AND the stored raw GraphQL payloads
 * to one local JSON file. The `events` mirror what POST /admin/seed/facebook
 * would receive; `raw` lets the parsed events be validated against the actual
 * network data before anything touches the DB.
 */
async function downloadSelected() {
  const selected = collectEvents();
  if (selected.length === 0) {
    alert('Select at least one event.');
    return;
  }
  const eventsPayload = selected.map((ev) => {
    const stored = events.find((e) => e.fbId === ev.fbId) || {};
    return {
      external_id: `facebook-${ev.fbId}`,
      title: ev.title,
      startMs: ev.startMs,
      start_local: ev.startMs ? toLocalInput(ev.startMs).replace('T', ' ') : null,
      venue: ev.venue,
      address: ev.address,
      city: ev.city,
      location: stored.location || [ev.venue, ev.address].filter(Boolean).join(', '),
      link: ev.link,
      mediaUrl: ev.mediaUrl,
      tags: ev.tags,
      source: stored.source || 'unknown',
      needs_review: ev.needsReview,
    };
  });

  const raw = await PP.store.raw();
  const out = JSON.stringify({ events: eventsPayload, raw }, null, 2) + '\n';

  const blob = new Blob([out], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `panperyskop-facebook-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderResults(results) {
  for (const r of results || []) {
    const fbId = r.externalId.replace(/^facebook-/, '');
    const row = document.querySelector(`tr[data-fb-id="${fbId}"]`);
    if (!row) continue;
    const resultEl = row.querySelector('[data-role="result"]');
    resultEl.textContent = '';
    if (!r.ok) {
      resultEl.appendChild(badge(`error: ${r.error}`, 'danger'));
      continue;
    }
    const d = r.data || {};
    switch (d.status) {
      case 'pending':
        resultEl.appendChild(badge(`pending · moderation · ${d.geo || 'geo'}`, 'warn'));
        break;
      case 'ingested':
        resultEl.appendChild(badge('ingested ✓', 'ok'));
        break;
      case 'duplicate':
        resultEl.appendChild(badge(`duplicate · ${d.winner && d.winner.provider}`, 'warn'));
        break;
      case 'no_coords':
        resultEl.appendChild(badge('no coordinates — fix location', 'danger'));
        break;
      default:
        resultEl.appendChild(badge(`status: ${d.status}`, 'warn'));
    }
    row.querySelector('input[data-role="check"]').checked = false;
  }
}

init();
