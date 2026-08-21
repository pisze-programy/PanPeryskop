// Overview page: health strip, KPI cards, activity charts, events window, seed + cron.

import { Hono } from 'hono';
import {
  esc, fmtDate, fmtDur, fmtPct, pill, relAgo, safeJson, icon,
  toastContainer, toastScript, APEXCHARTS_SRC,
} from '../../ui';
import { overviewData, overviewCharts } from '../../queries';
import { fmtPctNum } from '../common';
import { todayWarsaw, addDaysWarsaw } from '../../../seed/core/dates';
import { SEED_DAYS_AHEAD } from '../../../seed/core/constants';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

// Relative day label mirroring the app's story clock: Dziś / Jutro / Pojutrze,
// otherwise the full weekday name (e.g. "Środa").
function dayLabel(dateStr: string): string {
  const today = todayWarsaw();
  const diff = Math.round((Date.parse(`${dateStr}T00:00:00+02:00`) - Date.parse(`${today}T00:00:00+02:00`)) / 86400000);
  if (diff === 0) return 'Dziś';
  if (diff === 1) return 'Jutro';
  if (diff === 2) return 'Pojutrze';
  const s = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', timeZone: 'Europe/Warsaw' }).format(new Date(`${dateStr}T12:00:00+02:00`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function batchStatusPill(s: string): string {
  return s === 'done' ? pill('done', 'ok') :
    s === 'failed' ? pill('failed', 'err') :
    s === 'ingesting' || s === 'fetching' || s === 'fetch_done' ? pill(s, 'warn') :
    pill(esc(s), 'muted');
}

pageRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  const today = todayWarsaw();
  const windowEnd = addDaysWarsaw(today, SEED_DAYS_AHEAD);
  const d = await overviewData(c.env, SEED_DAYS_AHEAD);
  const charts = overviewCharts(d);

  // ---- Health alert strip ----
  const totalBatches = d.batchCounts.reduce((s, b) => s + b.n, 0);
  const seedFailed = d.batchCounts.find((b) => b.status === 'failed')?.n ?? 0;
  const failures: string[] = [];
  if (seedFailed > 0) failures.push(`${seedFailed}/${totalBatches} batchy seeda <strong>failed</strong>`);
  if (d.status.pending > 0) failures.push(`${d.status.pending} event <strong>pending</strong>`);
  if (d.failedLogins7d > 0) failures.push(`${d.failedLogins7d} prób logowania do admina`);
  if (d.budget?.exceeded) failures.push('budget Browser <strong>przekroczony</strong>');
  if (d.cron.lastCronRunMs && now - d.cron.lastCronRunMs > 30 * 3_600_000) failures.push('cron nie uruchomił się od <strong>30 h</strong>');
  const healthHtml = failures.length
    ? `<div class="alert alert-danger mb-3" role="alert">
        <div class="d-flex gap-3">
          <div>${icon('alert-triangle', 'icon alert-icon')}</div>
          <div>
            <h4 class="alert-title">Wymaga uwagi</h4>
            <div class="text-secondary">${failures.map((f) => `<span class="status-dot bg-danger me-1"></span>${f}`).join(' · ')}</div>
          </div>
        </div></div>`
    : `<div class="alert alert-success mb-3 d-flex align-items-center" role="alert">
        ${icon('shield-check', 'icon me-2')}
        <div>Wszystko w porządku — <strong>0 błędów klienta</strong> · <strong>0 otwartych raportów</strong> · <strong>0 zbanowanych urządzeń</strong></div></div>`;

  // ---- KPI cards ----
  const activeShare = d.users > 0 ? Math.round((d.active7d / d.users) * 100) : 0;
  const activeCls = activeShare > 50 ? 'bg-success' : 'bg-danger';
  const viewsDelta = charts.kpis.viewsDelta;
  const kpiHtml = `<div class="row row-cards row-deck mb-3">
    <div class="col-12 col-md-6 col-xl-3">
      <a class="card card-sm text-reset text-decoration-none" href="/admin/users">
        <div class="card-body">
          <div class="subheader">Użytkownicy</div>
          <div class="h1 mb-3" id="kpi-users">${d.users}</div>
          <div class="d-flex mb-2">
            <div class="me-auto">Aktywni 7 dni</div>
            <div><span class="text-red" id="kpi-active">${d.active7d}</span> / ${d.users}</div>
          </div>
          <div class="progress progress-sm"><div class="progress-bar ${activeCls}" style="width:${activeShare}%"></div></div>
        </div>
      </a>
    </div>
    <div class="col-12 col-md-6 col-xl-3">
      <a class="card card-sm text-reset text-decoration-none" href="/admin/stats">
        <div class="card-body">
          <div class="d-flex align-items-center">
            <div class="subheader">Views · 14 dni</div>
            <div class="ms-auto lh-1">${viewsDelta === null ? '<span class="text-secondary">—</span>' : `<span class="${viewsDelta >= 0 ? 'text-green' : 'text-red'}">${viewsDelta >= 0 ? '▲' : '▼'} ${Math.abs(viewsDelta)}%</span>`}</div>
          </div>
          <div class="d-flex align-items-baseline"><div class="h1 mb-3 me-2" id="kpi-views">${charts.kpis.viewsTotal}</div></div>
        </div>
        <div id="pp-spark-views" class="chart-sm"></div>
      </a>
    </div>
    <div class="col-12 col-md-6 col-xl-3">
      <a class="card card-sm text-reset text-decoration-none" href="/admin/events?from=${today}&to=${windowEnd}">
        <div class="card-body">
          <div class="subheader">Eventy · okno ${SEED_DAYS_AHEAD + 1} dni</div>
          <div class="h1 mb-2" id="kpi-wintotal">${charts.kpis.winTotal}</div>
          <div class="d-flex mb-1 text-secondary flex-wrap">
            <span class="me-3"><span class="status-dot bg-green me-1"></span><span id="kpi-winapproved">${charts.kpis.winApproved}</span> approved</span>
            <span class="me-3"><span class="status-dot bg-yellow me-1"></span><span id="kpi-winpending">${charts.kpis.winPending}</span> pending</span>
            <span><span class="status-dot bg-red me-1"></span><span id="kpi-winrejected">${charts.kpis.winRejected}</span> rejected</span>
          </div>
        </div>
      </a>
    </div>
    <div class="col-12 col-md-6 col-xl-3">
      <a class="card card-sm text-reset text-decoration-none" href="/admin/seed">
        <div class="card-body">
          <div class="d-flex align-items-center mb-2">
            <div class="subheader">Ostatni seed${d.lastSeed.batch ? ` · ${esc(String((d.lastSeed.batch as any).day ?? ''))}` : ''}</div>
            <div class="ms-auto">${d.lastSeed.batch ? batchStatusPill(String((d.lastSeed.batch as any).status ?? '')) : ''}</div>
          </div>
          <div class="d-flex align-items-baseline">
            <div class="h1 mb-2 me-2">${d.lastSeed.runs ? d.lastSeed.runs.ingested : '—'}</div>
            <span class="text-secondary">ingest / ${d.lastSeed.runs ? d.lastSeed.runs.cands : '—'} cand</span>
          </div>
          <div class="d-flex mb-1 text-secondary flex-wrap">
            <span class="me-3">Błędy <strong class="${(d.lastSeed.runs?.errors ?? 0) > 0 ? 'text-danger' : 'text-green'}">${d.lastSeed.runs?.errors ?? 0}</strong></span>
            <span class="me-3">Czas <strong>${d.lastSeed.runs ? fmtDur(d.lastSeed.runs.dur) : '—'}</strong></span>
          </div>
        </div>
      </a>
    </div>
  </div>`;

  // ---- Activity chart + status doughnut ----
  const chartsRow = `<div class="row row-cards mb-3">
    <div class="col-12 col-lg-8">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Aktywność · 14 dni</h3>
          <div class="card-subtitle text-secondary">Views · Media · Logowania</div>
        </div>
        <div class="card-body"><div id="pp-chart-activity"></div></div>
      </div>
    </div>
    <div class="col-12 col-lg-4">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Statusy eventów</h3>
          <div class="card-actions"><a class="btn btn-link" href="/admin/events?status=pending">Moderacja</a></div>
        </div>
        <div class="card-body"><div id="pp-chart-status"></div></div>
      </div>
    </div>
  </div>`;

  // ---- Events window: stacked bar + per-day table ----
  const sums = { approved: 0, pending: 0, rejected: 0 };
  const windowRowsHtml = d.window.map((w) => {
    sums.approved += w.approved; sums.pending += w.pending; sums.rejected += w.rejected;
    const total = w.approved + w.pending + w.rejected;
    return `<tr>
      <td class="fw-bold">${esc(dayLabel(w.day))}<span class="text-muted fw-normal"> · ${esc(w.day)}</span></td>
      <td><a href="/admin/events?from=${esc(w.day)}&to=${esc(w.day)}">${total}</a></td>
      <td class="text-success">${w.approved}</td>
      <td class="text-warning">${w.pending}</td>
      <td class="text-danger">${w.rejected}</td></tr>`;
  }).join('');
  const windowHtml = `<div class="card mb-3">
    <div class="card-header">
      <h3 class="card-title">Eventy — okno (${SEED_DAYS_AHEAD + 1} dni)</h3>
      <div class="card-actions"><a class="btn btn-sm btn-outline-secondary" href="/admin/events?from=${esc(today)}&to=${esc(windowEnd)}">Zobacz wszystkie</a></div>
    </div>
    <div class="card-body"><div id="pp-chart-window"></div></div>
    <div class="table-responsive"><table class="table table-vcenter card-table mb-0">
      <thead><tr><th>Dzień</th><th>Wszystkie</th><th class="text-success">Approved</th><th class="text-warning">Pending</th><th class="text-danger">Rejected</th></tr></thead>
      <tbody>${windowRowsHtml}<tr class="table-light">
        <td class="fw-bold">Suma</td><td>${sums.approved + sums.pending + sums.rejected}</td>
        <td class="text-success">${sums.approved}</td><td class="text-warning">${sums.pending}</td><td class="text-danger">${sums.rejected}</td></tr>
      </tbody></table></div></div>`;

  // ---- Last seed card + 7-day sparkline ----
  const batch = d.lastSeed.batch as any;
  let seedBody = `<div class="list-group list-group-hoverable">`;
  if (batch) {
    const r = d.lastSeed.runs;
    const ingestPct = r && r.cands > 0 ? Math.round((r.ingested / r.cands) * 100) : 0;
    const scopePct = batch.scopes_total > 0 ? Math.round((batch.scopes_done / batch.scopes_total) * 100) : 0;
    seedBody += `<div class="list-group-item">
      <div class="row align-items-center">
        <div class="col"><strong>${esc(batch.day)}</strong> ${batchStatusPill(batch.status)} ${pill(batch.run_type === 'cron' ? 'cron' : 'manual', batch.run_type === 'cron' ? 'ok' : 'muted')}</div>
        <div class="col-auto text-secondary">zakończono ${relAgo(batch.updated_at)}</div>
      </div></div>
      <div class="list-group-item">
        <div class="row align-items-center">
          <div class="col">Scopy (${batch.scopes_done}/${batch.scopes_total})</div>
          <div class="col-6"><div class="progress progress-sm"><div class="progress-bar bg-success" style="width:${scopePct}%"></div></div></div>
          <div class="col-auto"><span class="text-secondary">${scopePct}%</span></div>
        </div></div>
      <div class="list-group-item">
        <div class="row align-items-center">
          <div class="col">Ingest (${r?.ingested ?? 0}/${r?.cands ?? 0})</div>
          <div class="col-6"><div class="progress progress-sm"><div class="progress-bar bg-primary" style="width:${ingestPct}%"></div></div></div>
          <div class="col-auto"><span class="text-secondary">${ingestPct}%</span></div>
        </div></div>
      <div class="list-group-item">
        <div class="row">
          <div class="col-3 text-secondary">Błędy</div><div class="col-3 ${(r?.errors ?? 0) > 0 ? 'text-danger fw-bold' : 'text-green fw-bold'}">${r?.errors ?? 0}</div>
          <div class="col-3 text-secondary">Browser</div><div class="col-3">${r ? fmtDur(r.browser) : '—'}</div>
          <div class="col-3 text-secondary">Aktualizacja</div><div class="col-3">${fmtDate(batch.updated_at)}</div>
        </div></div>`;
    if (batch.reason) seedBody += `<div class="list-group-item"><div class="alert alert-danger mb-0 py-2">Powód: <span class="text-red">${esc(String(batch.reason))}</span></div></div>`;
  } else {
    seedBody += `<div class="list-group-item"><span class="text-secondary">Brak uruchomień seeda.</span></div>`;
  }
  seedBody += `</div>`;
  let budgetFooter = '';
  if (d.budget) {
    const pct = fmtPctNum(d.budget.monthMs, d.budget.limitMs);
    budgetFooter = `<div class="card-footer">
      <div class="d-flex align-items-center">
        <span class="text-secondary me-2">Budget Browser Run</span>
        <div class="progress flex-grow-1 progress-sm me-2"><div class="progress-bar ${d.budget.exceeded ? 'bg-danger' : 'bg-primary'}" style="width:${Math.min(100, pct)}%"></div></div>
        <span class="${d.budget.exceeded ? 'text-danger fw-bold' : ''}">${fmtPct(d.budget.monthMs, d.budget.limitMs)} (${fmtDur(d.budget.monthMs)} / ${fmtDur(d.budget.limitMs)})</span>
      </div></div>`;
  }
  const batchRows = d.batchCounts.length
    ? `<div class="card-body pt-0"><div id="pp-chart-seed" class="chart-sm mb-2"></div></div>`
    : '';
  const seedBadges = `<span class="badge bg-success-lt">${charts.kpis.seedDone} done</span><span class="badge bg-danger-lt">${charts.kpis.seedFailed} failed</span>`;
  const seedRow = `<div class="row row-cards mb-3">
    <div class="col-12 col-xl-8">
      <div class="card h-100">
        <div class="card-header"><h3 class="card-title">Ostatni seed</h3>
          <div class="card-actions"><a class="btn btn-sm btn-outline-secondary" href="/admin/seed">Logi seed</a></div></div>
        <div class="card-body">${seedBody}</div>
        ${budgetFooter}
      </div>
    </div>
    <div class="col-12 col-xl-4">
      <div class="card h-100">
        <div class="card-header"><h3 class="card-title">Seed · ingest dziennie</h3>
          <div class="card-actions">${seedBadges}</div></div>
        ${batchRows}
      </div>
    </div>
  </div>`;

  // ---- Cron card ----
  const cronHtml = `<div class="card mb-3">
    <div class="card-header">
      <h3 class="card-title">Cron (planowanie)</h3>
      <div class="card-actions"><span class="badge bg-green-lt"><span class="status-dot status-dot-animated bg-green me-1"></span>aktywny</span></div>
    </div>
    <div class="card-body">
      <div class="timeline">
        <div class="timeline-item">
          <div class="timeline-icon">${icon('clock')}</div>
          <div class="timeline-content">
            <div class="text-secondary">Ostatni cron</div>
            <div class="fw-bold">${d.cron.lastCronRunMs ? fmtDate(d.cron.lastCronRunMs) : '<span class="text-warning">jeszcze nie wystartował</span>'}</div>
          </div>
        </div>
        <div class="timeline-item">
          <div class="timeline-icon">${icon('refresh')}</div>
          <div class="timeline-content">
            <div class="text-secondary">Następny run</div>
            <div class="fw-bold"><span id="pp-cron-countdown">—</span></div>
            <div class="text-secondary">Harmonogram: <code>${esc(d.cron.schedules.join(', '))}</code> — ${esc(d.cron.summary)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  // ---- Page header ----
  const header = `<div class="page-header d-print-none mb-3">
    <div class="row align-items-center">
      <div class="col-auto">
        <div class="page-pretitle">Panel administracyjny</div>
        <h1 class="page-title">Overview</h1>
      </div>
      <div class="col-auto ms-auto d-print-none">
        <div class="btn-list">
          <span id="pp-clock" class="text-secondary align-middle"></span>
          <a href="/admin/events" class="btn btn-outline-secondary">Moderacja eventów</a>
          <a href="/admin/seed" class="btn btn-outline-secondary">Logi seed</a>
          <button class="btn btn-primary d-none d-sm-inline-block" id="ppRefreshBtn" onclick="ppRefresh()">Odśwież</button>
        </div>
      </div>
    </div>
  </div>`;

  const pp = charts.pp;
  const body = `${header}${healthHtml}${kpiHtml}${chartsRow}${windowHtml}${seedRow}${cronHtml}
  ${toastContainer()}
  <script>window.PP_DATA=${safeJson(pp)};</script>
  <script>
  window.ppCharts = {};
  function ppDestroyCharts(){ Object.keys(window.ppCharts).forEach(function(k){ try{ window.ppCharts[k].destroy(); }catch(e){} }); window.ppCharts={}; }
  function ppInitCharts(){
    if (!window.ApexCharts || !window.PP_DATA) return;
    ppDestroyCharts();
    var C = window.ApexCharts, d = window.PP_DATA;
    var clr = function (c) { return 'var(--tblr-' + c + ')'; };
    window.ppCharts['pp-chart-activity'] = new C(document.getElementById('pp-chart-activity'), {
      chart: { type: 'area', height: 280, fontFamily: 'inherit', toolbar: { show: false } },
      series: [
        { name: 'Views', data: d.activity.views },
        { name: 'Media', data: d.activity.media },
        { name: 'Logowania', data: d.activity.logins },
      ],
      colors: [clr('primary'), clr('success'), clr('warning')],
      stroke: { width: 2, curve: 'smooth' }, fill: { opacity: 0.06 },
      dataLabels: { enabled: false }, grid: { strokeDashArray: 4 },
      xaxis: { categories: d.activity.days }, legend: { position: 'bottom' }, tooltip: { theme: 'dark' },
    }).render();
    window.ppCharts['pp-chart-status'] = new C(document.getElementById('pp-chart-status'), {
      chart: { type: 'donut', height: 280, fontFamily: 'inherit', events: { dataPointSelection: function (e, ctx, o) {
        var ids = ['approved', 'pending', 'rejected'];
        if (o && o.dataPointIndex != null && ids[o.dataPointIndex]) location.href = '/admin/events?status=' + ids[o.dataPointIndex];
      } } },
      series: d.status.series, labels: d.status.labels,
      colors: [clr('success'), clr('warning'), clr('danger')],
      legend: { position: 'bottom' }, tooltip: { theme: 'dark' },
      plotOptions: { pie: { donut: { labels: { total: { show: true, label: 'razem' } } } } },
    }).render();
    window.ppCharts['pp-chart-window'] = new C(document.getElementById('pp-chart-window'), {
      chart: { type: 'bar', height: 220, fontFamily: 'inherit', toolbar: { show: false }, stacked: true },
      series: [
        { name: 'Approved', data: d.window.approved },
        { name: 'Pending', data: d.window.pending },
        { name: 'Rejected', data: d.window.rejected },
      ],
      colors: [clr('success'), clr('warning'), clr('danger')],
      plotOptions: { bar: { columnWidth: '55%' } }, dataLabels: { enabled: false },
      grid: { strokeDashArray: 4 }, xaxis: { categories: d.window.days },
      legend: { position: 'bottom' }, tooltip: { theme: 'dark' },
    }).render();
    window.ppCharts['pp-chart-seed'] = new C(document.getElementById('pp-chart-seed'), {
      chart: { type: 'area', height: 120, fontFamily: 'inherit', toolbar: { show: false }, sparkline: { enabled: true } },
      series: [{ name: 'Ingest', data: d.seed.ingested }],
      colors: [clr('success')], stroke: { width: 2, curve: 'smooth' }, fill: { opacity: 0.08 }, tooltip: { theme: 'dark' },
    }).render();
  }
  function ppTick(){
    var el = document.getElementById('pp-clock');
    if (el) el.textContent = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    var cd = document.getElementById('pp-cron-countdown');
    if (cd && window.PP_DATA && window.PP_DATA.nextCronMs) {
      var ms = window.PP_DATA.nextCronMs - Date.now();
      if (ms <= 0) cd.textContent = 'teraz';
      else cd.textContent = 'za ' + Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
    }
  }
  function ppRefresh(){
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
  }
  window.addEventListener('load', function () { ppInitCharts(); ppTick(); });
  setInterval(ppTick, 30000);
  </script>
  ${toastScript()}`;

  return renderPage(c, 'Overview', '/admin', body, { scripts: [APEXCHARTS_SRC] });
});

export function registerOverview(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
