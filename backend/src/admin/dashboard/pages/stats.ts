// Stats page: chart toolbar + ApexCharts + range stat cards + per-day table.
// Metric/range switch without reload via the JSON API + JSON bootstrap.

import { Hono } from 'hono';
import { cards, esc, safeJson, toastContainer, toastScript, APEXCHARTS_SRC } from '../../ui';
import { STAT_METRICS, statsPayload, StatsMetric } from '../../queries';
import { requireSession } from '../common';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();
const DAYS_OPTIONS = [7, 14, 30, 90];

function plDay(d: string): string {
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(new Date(`${d}T12:00:00+02:00`));
}

function statCardsHtml(p: { sum: number; bestDay: { d: string; n: number } | null; avgPerDay: number; deltaPct: number | null }): string {
  const delta = p.deltaPct === null || p.deltaPct === 0
    ? '<span class="text-secondary">— 0%</span>'
    : p.deltaPct > 0
      ? `<span class="text-success">▲ ${p.deltaPct}%</span>`
      : `<span class="text-danger">▼ ${Math.abs(p.deltaPct)}%</span>`;
  return `<div class="row row-cards mb-3">
    <div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Suma</div><div class="h2 mb-0" id="stat-sum">${p.sum}</div></div></div></div>
    <div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Najlepszy dzień</div>
      <div class="h2 mb-0" id="stat-best">${p.bestDay ? p.bestDay.n : '—'}</div>
      <div class="text-secondary" id="stat-best-date">${p.bestDay ? `${plDay(p.bestDay.d)} · ${p.bestDay.d}` : ''}</div></div></div></div>
    <div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Śr. / dzień</div><div class="h2 mb-0" id="stat-avg">${p.avgPerDay}</div></div></div></div>
    <div class="col-6 col-md-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">vs poprzedni okres</div><div class="h2 mb-0" id="stat-delta">${delta}</div></div></div></div>
  </div>`;
}

pageRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const metricRaw = String(q.metric || 'views');
  const metric: StatsMetric = metricRaw in STAT_METRICS ? (metricRaw as StatsMetric) : 'views';
  const daysRaw = parseInt(String(q.days || '14'), 10);
  const days = DAYS_OPTIONS.includes(daysRaw) ? daysRaw : 14;
  const view = q.view === 'bar' ? 'bar' : 'area';

  const initial = await statsPayload(db, metric, days);

  const metricBtn = (m: StatsMetric) =>
    `<button type="button" class="btn btn-outline-primary btn-sm ${metric === m ? 'active' : ''}" data-metric="${m}">${STAT_METRICS[m].label}</button>`;
  const dayBtn = (n: number) =>
    `<button type="button" class="btn btn-outline-secondary btn-sm ${days === n ? 'active' : ''}" data-days="${n}">${n}</button>`;
  const viewBtn = (v: string, ic: string, title: string) =>
    `<button type="button" class="btn btn-outline-secondary btn-sm ${view === v ? 'active' : ''}" data-view="${v}" title="${title}"><svg class="icon"><use href="#icon-${ic}"/></svg></button>`;

  const toolbar = `<div class="card mb-3"><div class="card-body d-flex flex-column flex-md-row align-items-center gap-2 flex-wrap">
    <div class="btn-group btn-group-sm flex-wrap" role="group" aria-label="Metrika">
      ${Object.keys(STAT_METRICS).map((m) => metricBtn(m as StatsMetric)).join('')}
    </div>
    <div class="btn-group btn-group-sm ms-md-auto" role="group" aria-label="Zakres dni">
      ${DAYS_OPTIONS.map((n) => dayBtn(n)).join('')}
    </div>
    <div class="btn-group btn-group-sm" role="group" aria-label="Typ wykresu">
      ${viewBtn('area', 'chart-line', 'Wykres liniowy')}${viewBtn('bar', 'chart-bar', 'Słupki')}
    </div>
    <button type="button" class="btn btn-sm btn-outline-secondary" id="stats-refresh" title="Odśwież"><svg class="icon"><use href="#icon-refresh"/></svg></button>
  </div></div>`;

  const chartCard = `<div class="card mb-3">
    <div class="card-header">
      <h3 class="card-title"><span id="chart-title">${STAT_METRICS[metric].label}</span> · <span class="text-secondary" id="chart-range">ostatnie ${days} dni</span></h3>
      <div class="card-actions"><span class="text-secondary" id="chart-sub">—</span></div>
    </div>
    <div class="card-body"><div id="chart-stats" class="position-relative"></div></div>
  </div>`;

  const totalsStrip = cards([
    { label: 'Użytkownicy', value: initial.totals.users },
    { label: 'Posty', value: initial.totals.posts },
    { label: 'Views', value: initial.totals.views },
    { label: 'Like', value: initial.totals.likes },
    { label: 'Share', value: initial.totals.shares },
    { label: 'Media Requests', value: initial.totals.mediaRequests },
    { label: 'Błędy klienta', value: initial.totals.clientErrors, color: initial.totals.clientErrors ? 'danger' : '' },
    { label: 'Seed runs', value: initial.totals.seedRuns },
  ]);

  // Initial table rows (SSR first paint; JS re-renders on switch).
  const maxN = Math.max(1, ...initial.series.map((x) => x.n));
  let cum = 0;
  const tableRows = [...initial.series].reverse().map((x) => {
    cum += x.n;
    const prevIdx = initial.series.indexOf(x) - 1;
    const prevN = prevIdx >= 0 ? initial.series[prevIdx].n : null;
    const chg = prevN === null || prevN === 0 ? '' : x.n > prevN ? `<span class="text-success">▲ ${Math.round(((x.n - prevN) / prevN) * 100)}%</span>` : x.n < prevN ? `<span class="text-danger">▼ ${Math.round(((prevN - x.n) / prevN) * 100)}%</span>` : `<span class="text-secondary">— 0%</span>`;
    const w = Math.max(0.5, (x.n / maxN) * 100);
    return `<tr>
      <td class="fw-bold">${plDay(x.d)}<span class="text-muted fw-normal"> · ${x.d}</span></td>
      <td class="text-end">${x.n}</td>
      <td class="text-end">${chg}</td>
      <td><div class="progress progress-sm"><div class="progress-bar" style="width:${w}%"></div></div></td>
      <td class="text-end">${cum}</td></tr>`;
  }).join('');
  const tableCard = `<div class="card">
    <div class="card-header"><h3 class="card-title">Dziennie · <span class="text-secondary" id="table-title">${STAT_METRICS[metric].label.toLowerCase()}</span></h3></div>
    <div class="table-responsive"><table class="table table-vcenter table-hover card-table">
      <thead><tr><th>Data</th><th class="text-end">Wartość</th><th class="text-end">Zmiana vs poprz.</th><th>Rozkład</th><th class="text-end">Suma narast.</th></tr></thead>
      <tbody id="stats-table-rows">${tableRows || '<tr><td colspan="5">Brak danych.</td></tr>'}</tbody></table></div>
  </div>`;

  const header = `<div class="page-header d-print-none mb-3">
    <div class="row align-items-center">
      <div class="col">
        <div class="page-pretitle">Analiza</div>
        <h2 class="page-title">Statystyki</h2>
      </div>
      <div class="col-auto ms-auto d-print-none"><span class="text-secondary" id="stats-updated">—</span></div>
    </div>
  </div>`;

  const body = `${header}${toolbar}${statCardsHtml(initial)}${chartCard}${totalsStrip}${tableCard}
  ${toastContainer()}
  <script>window.__STATS__=${safeJson(initial)};</script>
  <script>
  (function(){
    var state={metric:'${metric}',days:${days},view:'${view}',chart:null};
    var METRIC_LABELS=${safeJson(Object.fromEntries(Object.entries(STAT_METRICS).map(([k, v]) => [k, v.label])))};
    var DAYS=[7,14,30,90];
    function setActive(sel,attr,value){
      document.querySelectorAll(sel).forEach(function(b){b.classList.toggle('active',b.dataset[attr]===String(value));});
    }
    function busy(on){
      document.querySelectorAll('.btn-group .btn, #stats-refresh').forEach(function(b){b.disabled=on;});
      document.getElementById('stats-updated').textContent=on?'Ładowanie…':new Date().toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    }
    function fmtDay(d){return new Intl.DateTimeFormat('pl-PL',{weekday:'short'}).format(new Date(d+'T12:00:00+02:00'));}
    function renderChart(){
      var el=document.getElementById('chart-stats');
      if(!el||!window.ApexCharts) return;
      if(state.chart){try{state.chart.destroy();}catch(e){}}
      var p=window.__STATS__;
      var shortLabels=p.series.map(function(x){return fmtDay(x.d);});
      state.chart=new window.ApexCharts(el,{
        chart:{type:state.view,height:280,fontFamily:'inherit',parentHeightOffset:0,toolbar:{show:false},zoom:{enabled:false},animations:{enabled:true}},
        series:[{name:METRIC_LABELS[state.metric],data:p.series.map(function(x){return x.n;})}],
        colors:['var(--tblr-primary)'],dataLabels:{enabled:false},
        stroke:{width:2,curve:'smooth',lineCap:'round'},
        fill:state.view==='area'?{type:'gradient',gradient:{shadeIntensity:1,opacityFrom:0.35,opacityTo:0.05,stops:[0,100]}}:undefined,
        grid:{borderColor:'var(--tblr-border-color)',strokeDashArray:4,padding:{top:-8,right:8,left:8,bottom:0}},
        xaxis:{categories:shortLabels,axisBorder:{show:false}},
        yaxis:{min:0,forceNiceScale:true,labels:{formatter:function(v){return String(Math.round(v));}}},
        tooltip:{theme:'dark'},legend:{show:false},
      });
      state.chart.render();
    }
    function renderCards(){
      var p=window.__STATS__;
      var set=function(id,v){var el=document.getElementById(id); if(el) el.textContent=String(v);};
      set('stat-sum',p.sum);
      set('stat-best',p.bestDay?p.bestDay.n:'—');
      document.getElementById('stat-best-date').textContent=p.bestDay?fmtDay(p.bestDay.d)+' · '+p.bestDay.d:'';
      set('stat-avg',p.avgPerDay);
      var d=document.getElementById('stat-delta');
      if(p.deltaPct===null||p.deltaPct===0)d.innerHTML='<span class="text-secondary">— 0%</span>';
      else if(p.deltaPct>0)d.innerHTML='<span class="text-success">▲ '+p.deltaPct+'%</span>';
      else d.innerHTML='<span class="text-danger">▼ '+Math.abs(p.deltaPct)+'%</span>';
    }
    function renderTable(){
      var p=window.__STATS__, maxN=Math.max(1,p.series.map(function(x){return x.n;}).reduce(function(a,b){return Math.max(a,b);},0));
      var rows=[], cum=0;
      for(var i=p.series.length-1;i>=0;i--){
        var x=p.series[i]; cum+=x.n;
        var prevN=i-1>=0?p.series[i-1].n:null;
        var chg=prevN===null||prevN===0?'':x.n>prevN?'<span class="text-success">▲ '+Math.round(((x.n-prevN)/prevN)*100)+'%</span>':x.n<prevN?'<span class="text-danger">▼ '+Math.round(((prevN-x.n)/prevN)*100)+'%</span>':'<span class="text-secondary">— 0%</span>';
        var w=Math.max(0.5,(x.n/maxN)*100);
        rows.push('<tr><td class="fw-bold">'+fmtDay(x.d)+'<span class="text-muted fw-normal"> · '+x.d+'</span></td><td class="text-end">'+x.n+'</td><td class="text-end">'+chg+'</td><td><div class="progress progress-sm"><div class="progress-bar" style="width:'+w+'%"></div></div></td><td class="text-end">'+cum+'</td></tr>');
      }
      document.getElementById('stats-table-rows').innerHTML=rows.length?rows.join(''):'<tr><td colspan="5">Brak danych.</td></tr>';
    }
    function render(){
      var p=window.__STATS__;
      document.getElementById('chart-title').textContent=METRIC_LABELS[state.metric];
      document.getElementById('chart-range').textContent='ostatnie '+state.days+' dni';
      document.getElementById('chart-sub').textContent=p.sum===0?'Brak ruchu w tym zakresie':'suma: '+p.sum;
      document.getElementById('table-title').textContent=METRIC_LABELS[state.metric].toLowerCase();
      renderChart(); renderCards(); renderTable();
      history.replaceState(null,'','/admin/stats?metric='+state.metric+'&days='+state.days+(state.view==='bar'?'&view=bar':''));
    }
    function load(){
      busy(true);
      fetch('/admin/api/stats?metric='+state.metric+'&days='+state.days,{headers:{Accept:'application/json'}})
        .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
        .then(function(p){window.__STATS__=p; render();})
        .catch(function(){window.ppToast('Nie udało się pobrać danych.','danger');})
        .then(function(){busy(false);});
    }
    document.querySelectorAll('[data-metric]').forEach(function(b){b.addEventListener('click',function(){state.metric=b.dataset.metric;setActive('[data-metric]','metric',state.metric);load();});});
    document.querySelectorAll('[data-days]').forEach(function(b){b.addEventListener('click',function(){state.days=+b.dataset.days;setActive('[data-days]','days',state.days);load();});});
    document.querySelectorAll('[data-view]').forEach(function(b){b.addEventListener('click',function(){state.view=b.dataset.view;setActive('[data-view]','view',state.view);render();});});
    document.getElementById('stats-refresh').addEventListener('click',load);
    window.addEventListener('load',function(){render();});
  })();
  </script>
  ${toastScript()}`;

  return renderPage(c, 'Statystyki', '/admin/stats', body, { scripts: [APEXCHARTS_SRC] });
});

export function registerStats(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
