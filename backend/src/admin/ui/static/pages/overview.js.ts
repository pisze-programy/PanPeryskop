// Overview page JS (served at /admin/static/js/pages/overview.js).
export const OVERVIEW_JS = String.raw`
window.ppInitCharts = function () {
  if (!window.PP_DATA) return;
  window.ppDestroyCharts();
  var d = window.PP_DATA;
  var clr = function (c) { return 'var(--tblr-' + c + ')'; };
  window.ppChart('pp-chart-activity', {
    chart: { type: 'area', height: 280, fontFamily: 'inherit', toolbar: { show: false } },
    series: [
      { name: 'Views', data: d.activity.views },
      { name: 'Media', data: d.activity.media },
      { name: 'Logowania', data: d.activity.logins }
    ],
    colors: [clr('primary'), clr('success'), clr('warning')],
    stroke: { width: 2, curve: 'smooth' }, fill: { opacity: 0.06 },
    dataLabels: { enabled: false }, grid: { strokeDashArray: 4 },
    xaxis: { categories: d.activity.days }, legend: { position: 'bottom' }, tooltip: { theme: 'dark' }
  });
  window.ppChart('pp-chart-status', {
    chart: { type: 'donut', height: 280, fontFamily: 'inherit', events: { dataPointSelection: function (e, ctx, o) {
      var ids = ['approved', 'pending', 'rejected'];
      if (o && o.dataPointIndex != null && ids[o.dataPointIndex]) location.href = '/admin/events?status=' + ids[o.dataPointIndex];
    } } },
    series: d.status.series, labels: d.status.labels,
    colors: [clr('success'), clr('warning'), clr('danger')],
    legend: { position: 'bottom' }, tooltip: { theme: 'dark' },
    plotOptions: { pie: { donut: { labels: { total: { show: true, label: 'razem' } } } } }
  });
  window.ppChart('pp-chart-window', {
    chart: { type: 'bar', height: 220, fontFamily: 'inherit', toolbar: { show: false }, stacked: true },
    series: [
      { name: 'Approved', data: d.window.approved },
      { name: 'Pending', data: d.window.pending },
      { name: 'Rejected', data: d.window.rejected }
    ],
    colors: [clr('success'), clr('warning'), clr('danger')],
    plotOptions: { bar: { columnWidth: '55%' } }, dataLabels: { enabled: false },
    grid: { strokeDashArray: 4 }, xaxis: { categories: d.window.days },
    legend: { position: 'bottom' }, tooltip: { theme: 'dark' }
  });
  window.ppChart('pp-chart-seed', {
    chart: { type: 'area', height: 120, fontFamily: 'inherit', toolbar: { show: false }, sparkline: { enabled: true } },
    series: [{ name: 'Ingest', data: d.seed.ingested }],
    colors: [clr('success')], stroke: { width: 2, curve: 'smooth' }, fill: { opacity: 0.08 }, tooltip: { theme: 'dark' }
  });
};
window.ppTick = function () {
  var el = document.getElementById('pp-clock');
  if (el) el.textContent = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  var cd = document.getElementById('pp-cron-countdown');
  if (cd && window.PP_DATA && window.PP_DATA.nextCronMs) {
    var ms = window.PP_DATA.nextCronMs - Date.now();
    if (ms <= 0) cd.textContent = 'teraz';
    else cd.textContent = 'za ' + Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
  }
};
window.ppRefresh = function () {
  var btn = document.getElementById('ppRefreshBtn');
  if (btn) btn.disabled = true;
  fetch('/admin/api/overview', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (resp) {
      if (!resp || !resp.pp) throw new Error('bad payload');
      window.PP_DATA = resp.pp;
      var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = String(v); };
      var k = resp.kpis || {};
      set('kpi-users', k.users); set('kpi-active', k.active7d); set('kpi-views', k.viewsTotal);
      set('kpi-wintotal', k.winTotal); set('kpi-winapproved', k.winApproved);
      set('kpi-winpending', k.winPending); set('kpi-winrejected', k.winRejected);
      window.ppInitCharts();
      window.ppToast('Dane odświeżone.', 'success');
    })
    .catch(function () { window.ppToast('Nie udało się odświeżyć.', 'danger'); })
    .then(function () { if (btn) btn.disabled = false; });
};
document.addEventListener('DOMContentLoaded', function () { window.ppInitCharts(); window.ppTick(); });
setInterval(window.ppTick, 30000);
`;
