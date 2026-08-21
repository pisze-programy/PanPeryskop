// Users page JS (served at /admin/static/js/pages/users.js).
export const USERS_JS = String.raw`
(function () {
  var banM = document.getElementById('ppBanModal');
  window.ppBanTarget = null;
  window.ppBan = function (id, device, action) {
    window.ppBanTarget = { id: id, device: device, action: action };
    var t = document.getElementById('ppBanTitle');
    var st = document.getElementById('ppBanStatus');
    var d = document.getElementById('ppBanDevice');
    if (st) st.style.display = 'none';
    if (t) t.textContent = action === 'unban' ? 'Odbanuj urządzenie' : 'Ban urządzenia';
    if (d) d.textContent = device;
    window.ppModalShow(banM);
  };
  window.ppBanClose = function () { window.ppModalHide(banM); window.ppBanTarget = null; };
  window.ppBanConfirm = function () {
    var t = window.ppBanTarget; if (!t) return;
    var reason = document.getElementById('ppBanReason') ? document.getElementById('ppBanReason').value.trim() : '';
    fetch('/admin/users/' + encodeURIComponent(t.id) + '/' + t.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason }) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function () {
        window.ppBanClose();
        window.ppToast(t.action === 'unban' ? 'Odbanowano.' : 'Zbanowano urządzenie ' + t.device + '.', 'success');
        location.reload();
      })
      .catch(function () {
        var st = document.getElementById('ppBanStatus');
        if (st) { st.textContent = 'Nie udało się wykonać operacji.'; st.style.display = 'block'; }
      });
  };
  document.querySelectorAll('.pp-ban').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.ppBan(btn.getAttribute('data-id'), btn.getAttribute('data-device'), btn.getAttribute('data-action'));
    });
  });
})();
window.ppSearchDebounce = window.ppDebounce(function (input) { input.form.submit(); }, 400);
`;
