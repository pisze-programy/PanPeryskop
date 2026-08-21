// Reports page JS (served at /admin/static/js/pages/reports.js).
export const REPORTS_JS = String.raw`
(function () {
  var banM = document.getElementById('ppBanConfirmModal');
  window.ppBanTarget = null;
  window.ppModerate = function (id, action, el) {
    if (action === 'ban') {
      window.ppBanTarget = { id: id, el: el };
      var dev = el.closest('tr').querySelector('.font-monospace');
      document.getElementById('ppBanDevice').textContent = dev ? dev.textContent : '—';
      var err = document.getElementById('ppBanErr'); if (err) err.style.display = 'none';
      window.ppModalShow(banM);
      return;
    }
    ppSend(id, action, el);
  };
  window.ppBanClose = function () { window.ppModalHide(banM); window.ppBanTarget = null; };
  window.ppBanConfirm = function () {
    var t = window.ppBanTarget; if (!t) return;
    window.ppModalHide(banM); window.ppBanTarget = null;
    ppSend(t.id, 'ban', t.el);
  };
  function ppSend(id, action, el) {
    fetch('/admin/reports/' + encodeURIComponent(id) + '/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function () {
        var msg = action === 'reject' ? 'Post odrzucony.' : action === 'ban' ? 'Urządzenie autora zbanowane.' : 'Raport rozwiązany.';
        window.ppToast(msg, 'success');
        var tr = el ? el.closest('tr') : null;
        if (tr) tr.remove();
        var badge = document.getElementById('ppOpenBadge');
        if (badge) {
          var n = parseInt(badge.textContent, 10);
          if (n > 0) badge.textContent = (n - 1) + ' otwartych';
        }
      })
      .catch(function () {
        if (action === 'ban') { var e = document.getElementById('ppBanErr'); if (e) { e.textContent = 'Nie udało się zbanować.'; e.style.display = 'block'; } }
        else window.ppToast('Nie udało się wykonać akcji.', 'danger');
      });
  }
})();
`;
