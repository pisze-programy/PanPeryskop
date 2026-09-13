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
      { name: 'ingested', data: d.ingest.map(function (p) { return [ts(p.d), p.ingested]; }) },
      { name: 'errors', data: d.ingest.map(function (p) { return [ts(p.d), p.errors]; }) }
    ],
    colors: ['#206bc4', '#d63939'], stroke: { width: 2, curve: 'smooth' }, fill: { opacity: 0.08 },
    dataLabels: { enabled: false }, grid: { strokeDashArray: 4 },
    xaxis: { type: 'datetime', labels: { format: 'dd.MM' } }, tooltip: { theme: 'dark' }
  });
  window.ppChart('pp-chart-runs', {
    chart: { type: 'bar', height: 300, fontFamily: 'inherit', toolbar: { show: false }, stacked: true },
    series: [
      { name: 'done', data: d.runs.done },
      { name: 'failed', data: d.runs.failed },
      { name: 'running', data: d.runs.running }
    ],
    colors: ['#2fb344', '#d63939', '#f59f00'], dataLabels: { enabled: false }, grid: { strokeDashArray: 4 },
    xaxis: { categories: d.runs.days }, tooltip: { theme: 'dark' }
  });
});
`;
