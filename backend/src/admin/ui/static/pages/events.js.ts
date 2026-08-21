// Events page JS (served at /admin/static/js/pages/events.js).
// Reads inline data: window.ppLinkMap, window.ppSel.
export const EVENTS_JS = String.raw`
(function () {
  window.ppLinkFor = function (id, fb) {
    var m = window.ppLinkMap, s = window.ppSel;
    if (m && s && m[id] && s[id] && m[id][s[id]]) return m[id][s[id]];
    return fb;
  };
  window.ppBlockedHosts = ['multikino.pl', 'ebilet.pl'];
  window.ppOpenLink = function (u) {
    var h = (u || '').split('/')[2] || '';
    var blocked = window.ppBlockedHosts.some(function (b) { return h.indexOf(b) !== -1; });
    if (blocked) { window.open(u, '_blank', 'noopener'); } else { window.ppLinkOpen(u); }
  };
  window.ppLinkOpen = function (url, external) {
    window.ppCurLink = url;
    window.ppCurExternal = external || url;
    var m = document.getElementById('ppLinkModal');
    var f = document.getElementById('ppLinkFrame');
    if (f) f.src = url;
    window.ppModalShow(m);
    setTimeout(function () { if (m) m.focus(); }, 0);
  };
  window.ppLinkClose = function () {
    var f = document.getElementById('ppLinkFrame');
    if (f) f.src = 'about:blank';
    window.ppModalHide(document.getElementById('ppLinkModal'));
  };
  var frame = document.getElementById('ppLinkFrame');
  if (frame) frame.addEventListener('load', function () { var m = document.getElementById('ppLinkModal'); if (m) m.focus(); });

  window.ppGeoId = null;
  window.ppGeoStatusEl = null;
  window.ppGeoShowStatus = function (msg) { if (window.ppGeoStatusEl) { window.ppGeoStatusEl.textContent = msg; window.ppGeoStatusEl.style.display = 'block'; } };
  window.ppGeoClearStatus = function () { if (window.ppGeoStatusEl) window.ppGeoStatusEl.style.display = 'none'; };
  window.ppGeoOpen = function (id, loc, lat, lng) {
    window.ppGeoId = id;
    window.ppGeoStatusEl = document.getElementById('ppGeoStatus');
    window.ppGeoClearStatus();
    document.getElementById('ppGeoName').value = loc || '';
    document.getElementById('ppGeoCoord').value = (lat && lng) ? lat + ', ' + lng : '';
    var m = document.getElementById('ppGeoModal');
    window.ppModalShow(m);
    setTimeout(function () { if (m) m.focus(); document.getElementById('ppGeoName').select(); }, 0);
  };
  window.ppGeoClose = function () { window.ppModalHide(document.getElementById('ppGeoModal')); window.ppGeoId = null; };
  window.ppGeoSwap = function (id, placeHtml, geoBtn) {
    var cell = document.querySelector('.pp-place-cell[data-id="' + id + '"]');
    if (cell && placeHtml) cell.outerHTML = placeHtml;
    var btn = document.querySelector('.pp-geo-btn[data-id="' + id + '"]');
    if (btn && geoBtn) btn.outerHTML = geoBtn;
  };
  window.ppGeoSave = function () {
    var id = window.ppGeoId; if (!id) return;
    var name = document.getElementById('ppGeoName').value.trim();
    var coord = (document.getElementById('ppGeoCoord').value || '').replace(/[\u200B-\u200F\uFEFF\u00A0\s]+/g, '');
    var m = /^(-?\d+(?:\.\d+)?)[,;](-?\d+(?:\.\d+)?)$/.exec(coord);
    if (!name) { window.ppGeoShowStatus('Podaj nazwę lokalizacji.'); return; }
    if (!m) { window.ppGeoShowStatus('Nieprawidłowe współrzędne. Wklej np. 54.42656865607224, 18.58054868650763'); return; }
    var prop = document.getElementById('ppGeoPropagate');
    var propagate = !!(prop && prop.checked);
    fetch('/admin/events/' + encodeURIComponent(id) + '/geo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, lat: parseFloat(m[1]), lng: parseFloat(m[2]), propagate: propagate }) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (resp) {
        window.ppGeoSwap(id, resp && resp.placeHtml, resp && resp.geoBtn);
        window.ppGeoClose();
        window.ppToast(resp && resp.updated ? 'GEO zaktualizowane. Propagowano na ' + resp.updated + ' eventów.' : 'GEO zaktualizowane.', 'success');
      })
      .catch(function () { window.ppToast('Nie udało się zapisać GEO.', 'danger'); });
  };
  window.ppApplyCounts = function (c) {
    if (!c) return;
    var set = function (k, v) { var el = document.getElementById(k); if (el) el.textContent = String(v); };
    set('ppStat-total', c.total); set('ppStat-approved', c.approved); set('ppStat-pending', c.pending);
    set('ppStat-rejected', c.rejected); set('ppStat-untagged', c.untagged);
    set('ppStat-sold', c.sold); set('ppStat-geo', c.geoLocked); set('ppStat-taglock', c.tagsLocked);
  };
  window.ppSoldToggle = function (id, on) {
    fetch('/admin/events/' + encodeURIComponent(id) + '/sold', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: !!on }) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (resp) {
        var el = document.querySelector('.pp-sold-badge[data-id="' + id + '"]');
        if (el && resp && resp.soldHtml) el.outerHTML = resp.soldHtml;
        window.ppApplyCounts(resp && resp.counts);
        window.ppToast(on ? 'Oznaczono jako wyprzedane.' : 'Oznaczono jako dostępne.', 'success');
      })
      .catch(function () { window.ppToast('Nie udało się zapisać stanu wyprzedane.', 'danger'); });
  };
  window.ppTimeId = null;
  window.ppTimeStatusEl = null;
  window.ppTimeShowStatus = function (msg) { if (window.ppTimeStatusEl) { window.ppTimeStatusEl.textContent = msg; window.ppTimeStatusEl.style.display = 'block'; } };
  window.ppTimeClearStatus = function () { if (window.ppTimeStatusEl) window.ppTimeStatusEl.style.display = 'none'; };
  window.ppTimeOpen = function (id, timesJson) {
    window.ppTimeId = id;
    window.ppTimeStatusEl = document.getElementById('ppTimeStatus');
    window.ppTimeClearStatus();
    var first = '';
    try { var arr = JSON.parse(timesJson || '[]'); if (Array.isArray(arr) && arr.length) first = arr[0]; } catch (e) {}
    var inp = document.getElementById('ppTimeInput');
    if (inp) inp.value = first;
    var m = document.getElementById('ppTimeModal');
    window.ppModalShow(m);
    setTimeout(function () { if (m) m.focus(); if (inp) inp.select(); }, 0);
  };
  window.ppTimeClose = function () { window.ppModalHide(document.getElementById('ppTimeModal')); window.ppTimeId = null; };
  window.ppTimeSwap = function (id, html) {
    var el = document.querySelector('.pp-date-cell[data-id="' + id + '"]');
    if (el && html) el.innerHTML = html;
  };
  window.ppTimeSave = function () {
    var id = window.ppTimeId; if (!id) return;
    var t = (document.getElementById('ppTimeInput').value || '').trim();
    if (!/^\d{2}:\d{2}$/.test(t) || t < '00:00' || t > '23:59') { window.ppTimeShowStatus('Podaj godzinę w formacie HH:MM (00:00–23:59).'); return; }
    fetch('/admin/events/' + encodeURIComponent(id) + '/time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time: t }) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (resp) {
        window.ppTimeSwap(id, resp && resp.dateHtml);
        window.ppApplyCounts(resp && resp.counts);
        window.ppTimeClose();
        window.ppToast('Godzina zapisana.', 'success');
      })
      .catch(function () { window.ppToast('Nie udało się zapisać godziny.', 'danger'); });
  };
  window.ppUpdate = function (id, formEl) {
    var sel = formEl.querySelector('select');
    var fd = new FormData(formEl);
    fetch('/admin/events/' + encodeURIComponent(id), { method: 'POST', body: fd })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (resp) {
        if (sel) {
          sel.classList.remove('text-success', 'text-warning', 'text-danger');
          if (sel.name === 'status') {
            if (sel.value === 'approved') sel.classList.add('text-success');
            else if (sel.value === 'pending') sel.classList.add('text-warning');
            else sel.classList.add('text-danger');
          }
          sel.style.outline = '2px solid var(--tblr-success)';
          setTimeout(function () { sel.style.outline = ''; }, 700);
        }
        window.ppApplyCounts(resp && resp.counts);
        window.ppToast('Zapisano.', 'success');
      })
      .catch(function () { window.ppToast('Nie udało się zapisać zmiany.', 'danger'); });
  };
  window.ppApplySources = function () {
    var out = [];
    document.querySelectorAll('.pp-src:checked').forEach(function (cb) { out.push(cb.value); });
    var h = document.getElementById('ppSources');
    if (h) h.value = out.join(',');
    var form = h ? h.closest('form') : null;
    if (form) form.submit();
  };
  window.ppClearFilters = function (e) {
    if (e) e.preventDefault();
    location.href = '/admin/events';
  };
})();
`;
