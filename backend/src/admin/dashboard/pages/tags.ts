// Tags page: coverage, distribution charts, per-tag grid, add-tag form.

import { Hono } from 'hono';
import { cards, empty, esc, pill, safeJson, toastContainer, toastScript, APEXCHARTS_SRC, icon } from '../../ui';
import { requireSession } from '../common';
import { CANONICAL_TAG_SET, TAG_LABELS } from '../../../seed/core/tags';
import { tagCatalog } from '../../../core/tagCatalog';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

function tagSlug(label: string): string {
  return (label || '')
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('ł', 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const NON_CINEMA = "substr(p.external_id,1,instr(p.external_id,'-')-1) NOT IN ('helios','cinemacity','multikino')";

pageRoutes.get('/tags', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const msg = q.msg ? String(q.msg) : null;
  const catalog = await tagCatalog(db);

  const [total, tagged, locked, customTags, perTag, perTagSource, perTagStatus, nonCinema, multiTag] = await Promise.all([
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='events'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='events' AND tags IS NOT NULL AND tags <> '[]'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='events' AND tags_locked=1").first<{ n: number }>(),
    db.prepare('SELECT id, label, created_at FROM admin_tags ORDER BY created_at DESC').all<{ id: string; label: string; created_at: number }>(),
    db.prepare(`SELECT j.value AS tag, COUNT(*) n FROM posts p, json_each(p.tags) j
                WHERE p.category='events' AND p.tags IS NOT NULL AND p.tags <> '[]' GROUP BY j.value ORDER BY n DESC`).all<{ tag: string; n: number }>(),
    db.prepare(`SELECT j.value AS tag, substr(p.external_id,1,instr(p.external_id,'-')-1) AS source, COUNT(*) n
                FROM posts p, json_each(p.tags) j
                WHERE p.category='events' AND p.tags IS NOT NULL AND p.tags <> '[]'
                GROUP BY tag, source ORDER BY tag, n DESC`).all<{ tag: string; source: string; n: number }>(),
    db.prepare(`SELECT j.value AS tag, p.status, COUNT(*) n
                FROM posts p, json_each(p.tags) j
                WHERE p.category='events' AND p.tags IS NOT NULL AND p.tags <> '[]'
                GROUP BY tag, status ORDER BY tag, n DESC`).all<{ tag: string; status: string; n: number }>(),
    db.prepare(`SELECT j.value AS tag, COUNT(*) n FROM posts p, json_each(p.tags) j
                WHERE p.category='events' AND p.tags IS NOT NULL AND p.tags <> '[]' AND ${NON_CINEMA}
                GROUP BY j.value ORDER BY n DESC`).all<{ tag: string; n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='events' AND tags IS NOT NULL AND json_array_length(tags) > 1").first<{ n: number }>(),
  ]);

  const nTotal = total?.n ?? 0;
  const nTagged = tagged?.n ?? 0;
  const nEmpty = nTotal - nTagged;
  const counts = new Map((perTag.results ?? []).map((r) => [r.tag, r.n]));
  const sourcesByTag = new Map<string, { source: string; n: number }[]>();
  for (const r of perTagSource.results ?? []) {
    const arr = sourcesByTag.get(r.tag) ?? [];
    arr.push({ source: r.source, n: r.n });
    sourcesByTag.set(r.tag, arr);
  }
  const statusByTag = new Map<string, { status: string; n: number }[]>();
  for (const r of perTagStatus.results ?? []) {
    const arr = statusByTag.get(r.tag) ?? [];
    arr.push({ status: r.status, n: r.n });
    statusByTag.set(r.tag, arr);
  }
  const nonCinemaCounts = new Map((nonCinema.results ?? []).map((r) => [r.tag, r.n]));
  const nMulti = multiTag?.n ?? 0;
  const customRows = customTags.results ?? [];

  // ---- KPI ----
  const kpi = cards([
    { label: 'Eventy (events)', value: nTotal },
    { label: 'Z tagiem', value: nTagged, color: 'success', sub: `${nTagged && nTotal ? Math.round((nTagged / nTotal) * 100) : 0}% wszystkich` },
    { label: 'Puste', value: nEmpty, color: nEmpty ? 'warning' : '', href: '/admin/events?tag=none' },
    { label: 'Tagów (kanon)', value: CANONICAL_TAG_SET.size },
    { label: 'Tagów własnych', value: customRows.length, color: customRows.length ? 'primary' : '' },
    { label: 'Multi-tag', value: nMulti, color: nMulti ? 'primary' : '' },
  ]);

  // ---- Coverage bar ----
  const pctTagged = nTotal ? Math.round((nTagged / nTotal) * 100) : 0;
  const coverage = `<div class="card mb-3">
    <div class="card-header"><h3 class="card-title">Zasięg tagowania</h3></div>
    <div class="card-body">
      <div class="progress mb-2" style="height:1.5rem">
        <div class="progress-bar bg-success" style="width:${pctTagged}%">${pctTagged}%</div>
        <div class="progress-bar bg-warning" style="width:${100 - pctTagged}%"></div>
      </div>
      <div class="d-flex justify-content-between text-secondary fs-5">
        <span>${nTagged} z tagiem</span><span>${nEmpty} bez taga</span>
      </div>
    </div>
  </div>`;

  // ---- Chart data ----
  const filmy = counts.get('filmy') ?? 0;
  const meetup = counts.get('meetup') ?? 0;
  const muzyka = counts.get('muzyka') ?? 0;
  const rest = [...counts.entries()].filter(([t]) => !['filmy', 'meetup', 'muzyka'].includes(t)).reduce((s, [, n]) => s + n, 0);
  const tagIdMap: Record<string, string | null> = { 'Filmy': 'filmy', 'Meetup': 'meetup', 'Muzyka': 'muzyka', 'Teatr': 'teatr', 'Inne': 'inne', 'Komedia': 'komedia', 'Pozostałe': null };
  const nonCinemaSeries = ['meetup', 'muzyka', 'teatr', 'inne', 'komedia'].map((t) => nonCinemaCounts.get(t) ?? 0);
  const nonCinemaLabels = ['Meetup', 'Muzyka', 'Teatr', 'Inne', 'Komedia'];

  // ---- Add tag card ----
  const addTag = `<div class="card mb-3">
    <div class="card-header">
      <h3 class="card-title">Dodaj nowy tag</h3>
      <div class="card-actions"><span class="badge bg-secondary-lt">tylko dodawanie</span></div>
    </div>
    <div class="card-body">
      <form method="post" action="/admin/tags" class="d-flex gap-2 mb-2">
        <div class="input-group w-100">
          <input name="label" class="form-control" placeholder="np. Sport" required maxlength="40" oninput="ppTagSlugPreview(this.value)" aria-label="Nazwa nowego tagu" />
          <button class="btn btn-primary" type="submit">${icon('plus')} Dodaj</button>
        </div>
      </form>
      <div class="text-secondary fs-5 mb-3" id="ppTagSlugHint"></div>
      <div class="d-flex align-items-center gap-2 text-secondary fs-5">
        <span class="text-uppercase fw-bold fs-6">Tagi własne</span>
        <div class="tags-list" id="ppCustomTags">
          ${customRows.length ? customRows.map((t) => `<span class="tag" title="Utworzony: ${esc(new Date(t.created_at).toISOString().slice(0, 10))}">${esc(t.label)}</span>`).join('') : '<span class="text-muted">— brak —</span>'}
        </div>
      </div>
    </div>
  </div>`;

  // ---- Tag card grid ----
  const known = catalog.map((t) => ({ id: t.id, label: t.label, custom: !CANONICAL_TAG_SET.has(t.id) }));
  for (const id of counts.keys()) if (!known.some((k) => k.id === id)) known.push({ id, label: TAG_LABELS[id] ?? id, custom: true });
  const gridCards = known
    .map((t) => {
      const n = counts.get(t.id) ?? 0;
      const pct = nTagged ? Math.round((n / nTagged) * 100) : 0;
      const sources = (sourcesByTag.get(t.id) ?? []).slice(0, 3).map((s) => esc(s.source)).join(' · ');
      return `<div class="col-md-6 col-xl-4" data-tag="${esc(t.id)}" data-custom="${t.custom ? 1 : 0}">
        <div class="card card-sm">
          <div class="card-body">
            <div class="d-flex align-items-center gap-2 mb-2">
              <span class="badge bg-primary-lt text-primary">${esc(t.label)}</span>
              ${t.custom ? pill('custom', 'muted') : pill('kanon', 'ok')}
            </div>
            <div class="d-flex align-items-baseline gap-2">
              <span class="h2 mb-0">${n}</span>
              <span class="text-secondary">${pct}% z tagiem</span>
            </div>
            <div class="progress progress-sm my-2"><div class="progress-bar" style="width:${pct}%"></div></div>
            <div class="text-secondary fs-6 mb-2">${sources || '—'}</div>
            <a class="btn btn-sm btn-outline-secondary w-100" href="/admin/events?tag=${esc(t.id)}">Eventy →</a>
          </div>
        </div>
      </div>`;
    }).join('');

  const fullTableRows = known.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.label.localeCompare(b.label, 'pl'))
    .map((t) => {
      const n = counts.get(t.id) ?? 0;
      const statuses = (statusByTag.get(t.id) ?? []).map((s) =>
        `<span class="${s.status === 'approved' ? 'text-success' : s.status === 'pending' ? 'text-warning' : 'text-danger'}">${s.status}: ${s.n}</span>`).join(' · ');
      const pctTag = nTagged ? Math.round((n / nTagged) * 100) : 0;
      const pctAll = nTotal ? Math.round((n / nTotal) * 100) : 0;
      return `<tr>
        <td><span class="badge bg-primary-lt text-primary">${esc(t.label)}</span> ${t.custom ? pill('custom', 'muted') : pill('kanon', 'ok')}</td>
        <td>${n}</td><td>${pctTag}%</td><td>${pctAll}%</td><td class="text-secondary">${statuses || '—'}</td></tr>`;
    }).join('');

  const msgHtml = msg === 'added' ? `<div class="alert alert-success">Tag dodany.</div>`
    : msg === 'dup' ? `<div class="alert alert-warning">Tag już istnieje.</div>`
    : msg === 'invalid' ? `<div class="alert alert-warning">Nieprawidłowa nazwa taga.</div>` : '';

  const header = `<div class="page-header d-print-none mb-3" aria-label="Nagłówek">
    <div class="row g-2 align-items-center">
      <div class="col">
        <div class="page-pretitle">Panel · Taksonomia</div>
        <h2 class="page-title">Tagi</h2>
        <div class="text-secondary mt-1">${nTotal} eventów · ${nTagged} z tagiem (${pctTagged}%) · ${customRows.length} tagów własnych</div>
      </div>
      <div class="col-auto ms-auto d-print-none">
        <div class="btn-list">
          <a class="btn btn-outline-secondary" href="/admin/events">${icon('calendar-event')} Moderacja</a>
          <a class="btn btn-primary" href="#ppTagAdd" data-bs-toggle="collapse">${icon('plus')} Dodaj tag</a>
        </div>
      </div>
    </div>
  </div>`;

  const body = `${header}${msgHtml}
  <div class="collapse mb-3" id="ppTagAdd">${addTag.replace('<div class="card mb-3">', '<div class="card">')}</div>
  ${kpi}${coverage}
  <div class="row row-cards mb-3">
    <div class="col-12 col-lg-7">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Rozkład tagów</h3></div>
        <div class="card-body">
          <div class="row">
            <div class="col"><div id="pp-chart-tag-dist" class="position-relative"></div></div>
            <div class="col-md-auto">
              <div class="divide-y divide-y-fill">
                <div class="px-3"><div class="text-secondary"><span class="status-dot bg-primary me-1"></span>Filmy</div><div class="h2">${filmy} · ${nTagged ? Math.round((filmy / nTagged) * 100) : 0}%</div></div>
                <div class="px-3"><div class="text-secondary"><span class="status-dot bg-success me-1"></span>Meetup</div><div class="h2">${meetup}</div></div>
                <div class="px-3"><div class="text-secondary"><span class="status-dot bg-azure me-1"></span>Muzyka</div><div class="h2">${muzyka}</div></div>
                <div class="px-3"><div class="text-secondary"><span class="status-dot bg-purple me-1"></span>Pozostałe</div><div class="h2">${rest}</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-12 col-lg-5">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Tagi poza kinami</h3></div>
        <div class="card-body">
          <div id="pp-chart-tag-noncinema" class="position-relative"></div>
          <div class="text-secondary fs-5 mt-2">kina (helios/cinemacity/multikino) zawsze trafiają do <strong>filmy</strong> — ten wykres pokazuje resztę.</div>
        </div>
      </div>
    </div>
  </div>
  <div class="card mb-3" id="ppTagAddCard">
    ${addTag}
  </div>
  <div class="card mb-3">
    <div class="card-header">
      <div class="card-title">Rozkład per tag</div>
      <div class="card-actions d-flex gap-2">
        <select class="form-select form-select-sm w-auto" id="ppTagKind" onchange="ppTagRender()">
          <option value="all">Wszystkie</option><option value="canon">Kanon</option><option value="custom">Własne</option>
        </select>
        <div class="input-icon">
          <input type="search" class="form-control form-control-sm" id="ppTagSearch" placeholder="Szukaj taga…" oninput="ppTagRender()" />
          <span class="input-icon-addon">${icon('search')}</span>
        </div>
      </div>
    </div>
    <div class="card-body">
      <div class="row row-cards g-2" id="ppTagGrid">${gridCards}</div>
      <div class="text-secondary fs-5 mt-2" id="ppTagEmpty" style="display:none">Brak wyników.</div>
    </div>
    <div class="card-footer">
      <a class="btn btn-sm btn-link" data-bs-toggle="collapse" href="#ppFullTable">Pełna tabela ${icon('chevron-down')}</a>
    </div>
    <div class="collapse" id="ppFullTable">
      <div class="table-responsive"><table class="table table-vcenter card-table mb-0">
        <thead><tr><th>Tag</th><th>Eventy</th><th>% z tag</th><th>% ogółem</th><th>Statusy</th></tr></thead>
        <tbody>${fullTableRows || `<tr><td colspan="5">${empty()}</td></tr>`}</tbody></table></div>
    </div>
  </div>
  ${toastContainer()}
  <script>window.ppTagData=${safeJson({ dist: { series: [filmy, meetup, muzyka, rest], labels: ['Filmy', 'Meetup', 'Muzyka', 'Pozostałe'] }, nonCinema: { series: nonCinemaSeries, labels: nonCinemaLabels } })};window.ppTagIdMap=${safeJson(tagIdMap)};</script>
  <script>
  function ppSlug(s){ return String(s||'').normalize('NFC').toLowerCase().replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  function ppTagSlugPreview(v){
    var hint=document.getElementById('ppTagSlugHint');
    if(!hint) return;
    var slug=ppSlug(v);
    if(!slug){ hint.textContent=''; return; }
    hint.textContent='admin_tags.id = "'+slug+'"';
  }
  function ppTagRender(){
    var term=(document.getElementById('ppTagSearch').value||'').toLowerCase();
    var kind=document.getElementById('ppTagKind').value;
    var shown=0;
    document.querySelectorAll('#ppTagGrid [data-tag]').forEach(function(card){
      var tag=card.getAttribute('data-tag').toLowerCase();
      var custom=card.getAttribute('data-custom')==='1';
      var ok=(term===''||tag.indexOf(term)!==-1)&&(kind==='all'||(kind==='canon'&&!custom)||(kind==='custom'&&custom));
      card.style.display=ok?'':'none';
      if(ok) shown++;
    });
    document.getElementById('ppTagEmpty').style.display=shown?'none':'block';
  }
  window.addEventListener('load', function(){
    if(!window.ApexCharts||!window.ppTagData) return;
    var C=window.ApexCharts, d=window.ppTagData;
    var clr=function(c){return 'color-mix(in srgb, transparent, var(--tblr-'+c+') 100%)';};
    var click=function(map){
      return function(e,ctx,o){
        if(!o||!o.w||!o.w.config||!o.w.config.labels) return;
        var id=map[o.w.config.labels[o.dataPointIndex]];
        if(id) location.href='/admin/events?tag='+encodeURIComponent(id);
      };
    };
    new C(document.getElementById('pp-chart-tag-dist'),{
      chart:{type:'donut',fontFamily:'inherit',height:260,animations:{enabled:false},events:{dataPointSelection:click(window.ppTagIdMap)}},
      series:d.dist.series,labels:d.dist.labels,
      colors:[clr('primary'),clr('success'),clr('azure'),clr('purple')],
      legend:{show:true,position:'bottom'},tooltip:{theme:'dark'},
      plotOptions:{pie:{donut:{labels:{total:{show:true,label:'razem'}}}}},
    }).render();
    new C(document.getElementById('pp-chart-tag-noncinema'),{
      chart:{type:'donut',fontFamily:'inherit',height:240,animations:{enabled:false},events:{dataPointSelection:click(window.ppTagIdMap)}},
      series:d.nonCinema.series,labels:d.nonCinema.labels,
      colors:[clr('success'),clr('azure'),clr('purple'),clr('yellow'),clr('gray-400')],
      legend:{show:true,position:'bottom'},tooltip:{theme:'dark'},
    }).render();
  });
  </script>
  ${toastScript()}`;

  return renderPage(c, 'Tagi', '/admin/tags', body, { scripts: [APEXCHARTS_SRC] });
});

pageRoutes.post('/tags', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  const db = c.env.DB;
  const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
  const label = String(form.label ?? '').trim();
  const id = tagSlug(label);
  if (!label || !id) return c.redirect('/admin/tags?msg=invalid');
  if (CANONICAL_TAG_SET.has(id)) return c.redirect('/admin/tags?msg=dup');
  const exists = await db.prepare('SELECT 1 FROM admin_tags WHERE id=?').bind(id).first();
  if (exists) return c.redirect('/admin/tags?msg=dup');
  await db.prepare('INSERT INTO admin_tags (id, label, created_at) VALUES (?, ?, ?)').bind(id, label, Date.now()).run();
  return c.redirect('/admin/tags?msg=added');
});

export function registerTags(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
