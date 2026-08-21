// Seed page JS (served at /admin/static/js/pages/seed.js).
// Reads inline data: window.SEED_CHARTS.
export const SEED_JS = String.raw`
document.addEventListener('DOMContentLoaded', function () {
  if (!window.ApexCharts || !window.SEED_CHARTS) return;
  var d = window.SEED_CHARTS;
  var ts = function (day) { return Date.parse(day + 'T12:00:00'); };
  window.ppChart('pp-chart-ingest', {
    chart: { type: 'area', height: 300, fontFamily: 'inherit', toolbar: { show: false }, zoom: { type: 'x' } },
    series: [
      { name: 'candidates', data: d.ingest.map(function (p) { return [ts(p.d), p.candidates]; }) },
      { name: 'ingested', data: d.ingest.map(function (p) { return [ts(p.d), p.ingested]; }) }
    ],
    colors: ['#8d99ab', '#206bc4'], stroke: { width: 2, curve: 'smooth' }, fill: { opacity: 0.08 },
    dataLabels: { enabled: false }, grid: { strokeDashArray: 4 },
    xaxis: { type: 'datetime', labels: { format: 'dd.MM' } }, tooltip: { theme: 'dark' }
  });
  window.ppChart('pp-chart-batches', {
    chart: { type: 'bar', height: 300, fontFamily: 'inherit', toolbar: { show: false }, stacked: true },
    series: [
      { name: 'done', data: d.batches.done },
      { name: 'failed', data: d.batches.failed },
      { name: 'active', data: d.batches.active }
    ],
    colors: ['#2fb344', '#d63939', '#f59f00'], dataLabels: { enabled: false }, grid: { strokeDashArray: 4 },
    xaxis: { categories: d.batches.days }, tooltip: { theme: 'dark' }
  });
  var annot = {};
  if (d.budget.limitMs) annot = { yaxis: [{ y: d.budget.limitMs, strokeColor: '#d63939', label: { text: 'limit' } }] };
  window.ppChart('pp-chart-budget', {
    chart: { type: 'bar', height: 300, fontFamily: 'inherit', toolbar: { show: false } },
    series: [{ name: 'browser ms', data: d.budget.ms }],
    colors: ['#206bc4'], dataLabels: { enabled: false }, grid: { strokeDashArray: 4 },
    xaxis: { categories: d.budget.days, labels: { format: 'dd.MM' } }, tooltip: { theme: 'dark' },
    yaxis: { labels: { formatter: function (v) { return Math.round(v / 60000) + 'min'; } } },
    annotations: annot
  });
});
`;
