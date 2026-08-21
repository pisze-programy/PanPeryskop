// Shared admin client runtime (served at /admin/static/js/admin.js). Every page
// gets this: toasts, modal helpers, media/link/alert modals, chart factory, misc.
export const ADMIN_JS = String.raw`
(function () {
  var B = function () { return window.tabler || window.bootstrap; };
  var zone = null;
  function toastZone() {
    if (!zone) zone = document.getElementById('ppToastWrap');
    return zone;
  }
  window.ppToast = function (msg, kind) {
    var wrap = toastZone();
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast align-items-center text-bg-' + (kind === 'danger' ? 'danger' : 'success') + ' border-0';
    el.innerHTML = '<div class="d-flex"><div class="toast-body">' + msg + '</div>' +
      '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
    wrap.appendChild(el);
    var b = B();
    var t = b && b.Toast ? b.Toast.getOrCreateInstance(el) : null;
    if (t) t.show();
    setTimeout(function () { if (t) t.hide(); }, 3500);
  };
  window.ppModalShow = function (el) { var b = B(); if (b && b.Modal && el) b.Modal.getOrCreateInstance(el).show(); };
  window.ppModalHide = function (el) { var b = B(); if (b && b.Modal && el) { var m = b.Modal.getInstance(el); if (m) m.hide(); } };
  window.ppMediaOpen = function (src) {
    var img = document.getElementById('ppMediaImg');
    if (img) img.src = src;
    window.ppModalShow(document.getElementById('ppMediaModal'));
  };
  window.ppMediaClose = function () { window.ppModalHide(document.getElementById('ppMediaModal')); };
  window.ppAlertOpen = function (title, msg) {
    var t = document.getElementById('ppAlertTitle');
    var m = document.getElementById('ppAlertMsg');
    if (t) t.textContent = title;
    if (m) m.textContent = msg;
    window.ppModalShow(document.getElementById('ppAlertModal'));
  };
  window.ppAlertClose = function () { window.ppModalHide(document.getElementById('ppAlertModal')); };
  window.ppCopyId = function (id) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id).then(function () { window.ppToast('ID skopiowane.', 'success'); }, function () {});
    } else {
      window.ppToast('Kopiowanie nie działa w tej przeglądarce.', 'danger');
    }
  };
  window.ppDebounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  };
  window.ppCharts = {};
  window.ppChart = function (elId, cfg) {
    function init() {
      if (!window.ApexCharts) return null;
      var el = document.getElementById(elId);
      if (!el) return null;
      var chart = new window.ApexCharts(el, cfg);
      chart.render();
      window.ppCharts[elId] = chart;
      return chart;
    }
    if (document.readyState !== 'loading') return init();
    document.addEventListener('DOMContentLoaded', init);
  };
  window.ppDestroyChart = function (elId) {
    var c = window.ppCharts[elId];
    if (c) { try { c.destroy(); } catch (e) {} delete window.ppCharts[elId]; }
  };
  window.ppDestroyCharts = function () {
    Object.keys(window.ppCharts).forEach(function (k) { try { window.ppCharts[k].destroy(); } catch (e) {} });
    window.ppCharts = {};
  };
})();
`;
