// Stats page JS (served at /admin/static/js/pages/stats.js).
// Reads inline data: window.__STATS__ + METRIC labels.
export const STATS_JS = String.raw`
(function () {
  var METRIC_LABELS = window.__METRIC_LABELS__ || {};
  var state = { metric: 'views', days: 14, view: 'area', chart: null };
  function setActive(sel, attr, value) {
    document.querySelectorAll(sel).forEach(function (b) { b.classList.toggle('active', b.dataset[attr] === String(value)); });
  }
  function busy(on) {
    document.querySelectorAll('.btn-group .btn, #stats-refresh').forEach(function (b) { b.disabled = on; });
    document.getElementById('stats-updated').textContent = on ? 'Ładowanie…' : new Date().toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function fmtDay(d) { return new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(new Date(d + 'T12:00:00+02:00')); }
  function renderChart() {
    var el = document.getElementById('chart-stats');
    if (!el || !window.ApexCharts) return;
    if (state.chart) { try { state.chart.destroy(); } catch (e) {} state.chart = null; }
    var p = window.__STATS__;
    var shortLabels = p.series.map(function (x) { return fmtDay(x.d); });
    state.chart = new window.ApexCharts(el, {
      chart: { type: state.view, height: 280, fontFamily: 'inherit', parentHeightOffset: 0, toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: true } },
      series: [{ name: METRIC_LABELS[state.metric] || state.metric, data: p.series.map(function (x) { return x.n; }) }],
      colors: ['var(--tblr-primary)'], dataLabels: { enabled: false },
      stroke: { width: 2, curve: 'smooth', lineCap: 'round' },
      fill: state.view === 'area' ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 100] } } : undefined,
      grid: { borderColor: 'var(--tblr-border-color)', strokeDashArray: 4, padding: { top: -8, right: 8, left: 8, bottom: 0 } },
      xaxis: { categories: shortLabels, axisBorder: { show: false } },
      yaxis: { min: 0, forceNiceScale: true, labels: { formatter: function (v) { return String(Math.round(v)); } } },
      tooltip: { theme: 'dark' }, legend: { show: false }
    });
    state.chart.render();
  }
  function renderCards() {
    var p = window.__STATS__;
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = String(v); };
    set('stat-sum', p.sum);
    set('stat-best', p.bestDay ? p.bestDay.n : '—');
    var bd = document.getElementById('stat-best-date');
    if (bd) bd.textContent = p.bestDay ? fmtDay(p.bestDay.d) + ' · ' + p.bestDay.d : '';
    set('stat-avg', p.avgPerDay);
    var dd = document.getElementById('stat-delta');
    if (dd) {
      if (p.deltaPct === null || p.deltaPct === 0) dd.innerHTML = '<span class="text-secondary">— 0%</span>';
      else if (p.deltaPct > 0) dd.innerHTML = '<span class="text-success">▲ ' + p.deltaPct + '%</span>';
      else dd.innerHTML = '<span class="text-danger">▼ ' + Math.abs(p.deltaPct) + '%</span>';
    }
  }
  function renderTable() {
    var p = window.__STATS__;
    var maxN = p.series.map(function (x) { return x.n; }).reduce(function (a, b) { return Math.max(a, b); }, 1);
    var rows = [], cum = 0;
    for (var i = p.series.length - 1; i >= 0; i--) {
      var x = p.series[i]; cum += x.n;
      var prevN = i - 1 >= 0 ? p.series[i - 1].n : null;
      var chg = prevN === null || prevN === 0 ? '' : x.n > prevN ? '<span class="text-success">▲ ' + Math.round(((x.n - prevN) / prevN) * 100) + '%</span>' : x.n < prevN ? '<span class="text-danger">▼ ' + Math.round(((prevN - x.n) / prevN) * 100) + '%</span>' : '<span class="text-secondary">— 0%</span>';
      var w = Math.max(0.5, (x.n / maxN) * 100);
      rows.push('<tr><td class="fw-bold">' + fmtDay(x.d) + '<span class="text-muted fw-normal"> · ' + x.d + '</span></td><td class="text-end">' + x.n + '</td><td class="text-end">' + chg + '</td><td><div class="progress progress-sm"><div class="progress-bar" style="width:' + w + '%"></div></div></td><td class="text-end">' + cum + '</td></tr>');
    }
    document.getElementById('stats-table-rows').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5">Brak danych.</td></tr>';
  }
  function render() {
    var p = window.__STATS__;
    document.getElementById('chart-title').textContent = METRIC_LABELS[state.metric] || state.metric;
    document.getElementById('chart-range').textContent = 'ostatnie ' + state.days + ' dni';
    document.getElementById('chart-sub').textContent = p.sum === 0 ? 'Brak ruchu w tym zakresie' : 'suma: ' + p.sum;
    document.getElementById('table-title').textContent = (METRIC_LABELS[state.metric] || state.metric).toLowerCase();
    renderChart(); renderCards(); renderTable();
    history.replaceState(null, '', '/admin/stats?metric=' + state.metric + '&days=' + state.days + (state.view === 'bar' ? '&view=bar' : ''));
  }
  function load() {
    busy(true);
    fetch('/admin/api/stats?metric=' + state.metric + '&days=' + state.days, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (p) { window.__STATS__ = p; render(); })
      .catch(function () { window.ppToast('Nie udało się pobrać danych.', 'danger'); })
      .then(function () { busy(false); });
  }
  document.querySelectorAll('[data-metric]').forEach(function (b) { b.addEventListener('click', function () { state.metric = b.dataset.metric; setActive('[data-metric]', 'metric', state.metric); load(); }); });
  document.querySelectorAll('[data-days]').forEach(function (b) { b.addEventListener('click', function () { state.days = +b.dataset.days; setActive('[data-days]', 'days', state.days); load(); }); });
  document.querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { state.view = b.dataset.view; setActive('[data-view]', 'view', state.view); render(); }); });
  document.getElementById('stats-refresh').addEventListener('click', load);
  document.addEventListener('DOMContentLoaded', function () { render(); });
})();
`;
