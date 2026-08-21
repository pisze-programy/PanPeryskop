// Posts page JS (served at /admin/static/js/pages/posts.js).
export const POSTS_JS = String.raw`
(function () {
  var rejectM = document.getElementById('ppRejectModal');
  window.ppRejectId = null;
  window.ppPostReject = function (id) {
    window.ppRejectId = id;
    var r = document.getElementById('ppRejectReason'); if (r) r.value = '';
    var h = document.getElementById('ppRejectHint'); if (h) h.style.display = 'none';
    window.ppModalShow(rejectM);
  };
  window.ppRejectClose = function () { window.ppModalHide(rejectM); window.ppRejectId = null; };
  window.ppRejectSave = function () {
    var id = window.ppRejectId; if (!id) return;
    var reason = document.getElementById('ppRejectReason') ? document.getElementById('ppRejectReason').value.trim() : '';
    if (!reason) { var h = document.getElementById('ppRejectHint'); if (h) h.style.display = 'block'; return; }
    ppPostSet(id, 'rejected', reason);
    window.ppRejectClose();
  };
  window.ppPostSet = function (id, status, reason) {
    var fd = new FormData();
    fd.append('status', status);
    if (reason) fd.append('reason', reason);
    fetch('/admin/posts/' + encodeURIComponent(id) + '/status', { method: 'POST', body: fd })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (resp) {
        window.ppToast(resp.status === 'rejected' ? 'Post odrzucony.' : (resp.status === 'approved' ? 'Post zatwierdzony.' : 'Zapisano.'), 'success');
        var cur = new URLSearchParams(location.search).get('status');
        if (cur && cur !== resp.status) {
          var tr = document.querySelector('tr[data-id="' + id + '"]');
          if (tr) tr.remove();
          return;
        }
        var cell = document.querySelector('.pp-status-cell[data-id="' + id + '"]');
        if (cell) {
          var s = resp.status;
          cell.innerHTML = s === 'approved' ? '<span class="badge bg-success-lt text-success">approved</span>' : s === 'pending' ? '<span class="badge bg-warning-lt text-warning">pending</span>' : '<span class="badge bg-danger-lt text-danger">rejected</span>';
        }
      })
      .catch(function () { window.ppToast('Nie udało się zapisać zmiany.', 'danger'); });
  };
  window.ppPostBan = function (id, device) {
    if (!window.confirm('Zbanować urządzenie ' + device + '?')) return;
    fetch('/admin/posts/' + encodeURIComponent(id) + '/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function () { window.ppToast('Urządzenie autora zbanowane.', 'success'); })
      .catch(function () { window.ppToast('Nie udało się zbanować.', 'danger'); });
  };
})();
`;
