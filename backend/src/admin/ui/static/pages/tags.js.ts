// Tags page JS (served at /admin/static/js/pages/tags.js).
// Reads inline data: window.ppTagData, window.ppTagIdMap.
export const TAGS_JS = String.raw`
function ppSlug(s) {
  return String(s || '').normalize('NFC').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function ppTagSlugPreview(v) {
  var hint = document.getElementById('ppTagSlugHint');
  if (!hint) return;
  var slug = ppSlug(v);
  if (!slug) { hint.textContent = ''; return; }
  hint.textContent = 'admin_tags.id = "' + slug + '"';
}
function ppTagRender() {
  var term = (document.getElementById('ppTagSearch').value || '').toLowerCase();
  var kind = document.getElementById('ppTagKind').value;
  var shown = 0;
  document.querySelectorAll('#ppTagGrid [data-tag]').forEach(function (card) {
    var tag = card.getAttribute('data-tag').toLowerCase();
    var custom = card.getAttribute('data-custom') === '1';
    var ok = (term === '' || tag.indexOf(term) !== -1) && (kind === 'all' || (kind === 'canon' && !custom) || (kind === 'custom' && custom));
    card.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  document.getElementById('ppTagEmpty').style.display = shown ? 'none' : 'block';
}
document.addEventListener('DOMContentLoaded', function () {
  if (!window.ApexCharts || !window.ppTagData) return;
  var d = window.ppTagData;
  var clr = function (c) { return 'color-mix(in srgb, transparent, var(--tblr-' + c + ') 100%)'; };
  var click = function (map) {
    return function (e, ctx, o) {
      if (!o || !o.w || !o.w.config || !o.w.config.labels) return;
      var id = map[o.w.config.labels[o.dataPointIndex]];
      if (id) location.href = '/admin/events?tag=' + encodeURIComponent(id);
    };
  };
  window.ppChart('pp-chart-tag-dist', {
    chart: { type: 'donut', fontFamily: 'inherit', height: 260, animations: { enabled: false }, events: { dataPointSelection: click(window.ppTagIdMap) } },
    series: d.dist.series, labels: d.dist.labels,
    colors: [clr('primary'), clr('success'), clr('azure'), clr('purple')],
    legend: { show: true, position: 'bottom' }, tooltip: { theme: 'dark' },
    plotOptions: { pie: { donut: { labels: { total: { show: true, label: 'razem' } } } } }
  });
  window.ppChart('pp-chart-tag-noncinema', {
    chart: { type: 'donut', fontFamily: 'inherit', height: 240, animations: { enabled: false }, events: { dataPointSelection: click(window.ppTagIdMap) } },
    series: d.nonCinema.series, labels: d.nonCinema.labels,
    colors: [clr('success'), clr('azure'), clr('purple'), clr('yellow'), clr('gray-400')],
    legend: { show: true, position: 'bottom' }, tooltip: { theme: 'dark' }
  });
});
`;
