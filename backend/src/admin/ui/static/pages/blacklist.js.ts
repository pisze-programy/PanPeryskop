// Blacklist page JS (served at /admin/static/js/pages/blacklist.js).
// Reads inline data: window.ppBlPartners (partner ids seen on current events).
export const BLACKLIST_JS = String.raw`
(function () {
  window.ppBlRead = function () {
    return {
      pattern: (document.getElementById('ppBlPattern').value || '').trim(),
      venue: (document.getElementById('ppBlVenue').value || '').trim(),
      partner_id: (document.getElementById('ppBlPartnerId').value || '').trim(),
      partner_name: (document.getElementById('ppBlPartnerName').value || '').trim(),
      note: (document.getElementById('ppBlNote').value || '').trim()
    };
  };
  window.ppBlPreview = function () {
    var hint = document.getElementById('ppBlHint');
    if (!hint) return;
    var b = window.ppBlRead();
    if (!b.pattern && !b.partner_id) { hint.innerHTML = 'Wymagany wzorzec tytu\u0142u <strong>lub</strong> organizator.'; return; }
    fetch('/admin/api/blacklist/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (resp) {
        var n = resp && resp.matchCount ? resp.matchCount : 0;
        hint.innerHTML = 'Zablokuje <strong>' + n + '</strong> aktualnych wydarze\u0144' + (n ? '' : ' (obecnie 0 \u2014 z\u0142apie przysz\u0142e)') + '.';
      })
      .catch(function () { hint.innerHTML = 'Nie uda\u0142o si\u0119 policzy\u0107 dopasowa\u0144.'; });
  };
  window.ppBlAdd = function () {
    var b = window.ppBlRead();
    if (!b.pattern && !b.partner_id) { window.ppToast('Podaj wzorzec tytu\u0142u lub organizator.', 'danger'); return; }
    fetch('/admin/api/blacklist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function () { window.ppToast('Regu\u0142a dodana.', 'success'); setTimeout(function () { location.reload(); }, 400); })
      .catch(function () { window.ppToast('Nie uda\u0142o si\u0119 doda\u0107 regu\u0142y.', 'danger'); });
  };
  window.ppBlToggle = function (id, active) {
    fetch('/admin/blacklist/' + encodeURIComponent(id) + '/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !!active }) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function () { window.ppToast(active ? 'Regu\u0142a w\u0142\u0105czona.' : 'Regu\u0142a wy\u0142\u0105czona.', 'success'); setTimeout(function () { location.reload(); }, 400); })
      .catch(function () { window.ppToast('Nie uda\u0142o si\u0119 prze\u0142\u0105czy\u0107.', 'danger'); });
  };
  window.ppBlDelete = function (id, label) {
    if (!window.confirm('Usun\u0105\u0107 regu\u0142\u0119: ' + (label || id) + '?')) return;
    fetch('/admin/blacklist/' + encodeURIComponent(id) + '/delete', { method: 'POST' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function () { window.ppToast('Regu\u0142a usuni\u0119ta.', 'success'); setTimeout(function () { location.reload(); }, 400); })
      .catch(function () { window.ppToast('Nie uda\u0142o si\u0119 usun\u0105\u0107.', 'danger'); });
  };
})();
`;
