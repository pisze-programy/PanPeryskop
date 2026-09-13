// Overview page: health strip, KPI cards, activity charts, events window, seed + cron.
// Client logic in /admin/static/js/pages/overview.js; data bootstrapped inline.

import { Hono } from 'hono';
import {
  APEXCHARTS_SRC, card, cardHeader, esc, fmtDate, icon, listGroup,
  pageHeader, pill, safeJson, staticFilePath, timeline, timelineItem,
} from '../../ui';
import { overviewData, overviewCharts } from '../../queries';
import { DAY_MS, HOUR_MS } from '../../../seed/core/constants';
import { todayWarsaw, addDaysWarsaw } from '../../../seed/core/dates';
import { SEED_DAYS_AHEAD } from '../../../seed/core/constants';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

function dayLabel(dateStr: string): string {
  const today = todayWarsaw();
  const diff = Math.round((Date.parse(`${dateStr}T00:00:00+02:00`) - Date.parse(`${today}T00:00:00+02:00`)) / DAY_MS);
  if (diff === 0) return 'Dziś';
  if (diff === 1) return 'Jutro';
  if (diff === 2) return 'Pojutrze';
  const s = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', timeZone: 'Europe/Warsaw' }).format(new Date(`${dateStr}T12:00:00+02:00`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function batchStatusPill(s: string): string {
  return s === 'done' ? pill('done', 'ok') :
    s === 'failed' ? pill('failed', 'err') :
    s === 'running' ? pill('running', 'warn') :
    s === 'created' ? pill('created', 'muted') : pill(esc(s), 'muted');
}

pageRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  const today = todayWarsaw();
  const windowEnd = addDaysWarsaw(today, SEED_DAYS_AHEAD);
  const d = await overviewData(c.env, SEED_DAYS_AHEAD);
  const charts = overviewCharts(d);
  const lastUnits = d.lastSeed.units;
  const lastRunStatus = !lastUnits ? 'created' : lastUnits.failed > 0 ? 'failed' : lastUnits.active > 0 ? 'running' : 'done';

  // ---- Health strip ----
  const totalBatches = d.batchCounts.reduce((s, b) => s + b.n, 0);
  const seedFailed = d.batchCounts.find((b) => b.status === 'failed')?.n ?? 0;
  const failures: string[] = [];
  if (seedFailed > 0) failures.push(`${seedFailed}/${totalBatches} batchy seeda <strong>failed</strong>`);
  if (d.status.pending > 0) failures.push(`${d.status.pending} event <strong>pending</strong>`);
  if (d.failedLogins7d > 0) failures.push(`${d.failedLogins7d} prób logowania do admina`);
  if (d.cron.lastCronRunMs && now - d.cron.lastCronRunMs > 30 * HOUR_MS) failures.push('cron nie uruchomił się od <strong>30 h</strong>');
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
            <div class="subheader">Ostatni seed${d.lastSeed.batch ? ` · ${esc(String(d.lastSeed.batch.day ?? ''))}` : ''}</div>
            <div class="ms-auto">${d.lastSeed.batch ? batchStatusPill(lastRunStatus) : ''}</div>
          </div>
          <div class="d-flex align-items-baseline">
            <div class="h1 mb-2 me-2">${d.lastSeed.units ? d.lastSeed.units.done : '—'}</div>
            <span class="text-secondary">unitów / ${d.lastSeed.units ? d.lastSeed.units.total : '—'}</span>
          </div>
          <div class="d-flex mb-1 text-secondary flex-wrap">
            <span class="me-3">Failed <strong class="${(d.lastSeed.units?.failed ?? 0) > 0 ? 'text-danger' : 'text-green'}">${d.lastSeed.units?.failed ?? 0}</strong></span>
            <span class="me-3">Wiersze <strong>${d.lastSeed.units?.rows ?? 0}</strong></span>
          </div>
        </div>
      </a>
    </div>
  </div>`;

  // ---- Activity chart + status doughnut ----
  const chartsRow = `<div class="row row-cards mb-3">
    <div class="col-12 col-lg-8">
      ${card({ header: cardHeader({ title: 'Aktywność · 14 dni', actions: '<span class="card-subtitle text-secondary">Views · Media · Logowania</span>' }), body: '<div id="pp-chart-activity"></div>' })}
    </div>
    <div class="col-12 col-lg-4">
      ${card({ header: cardHeader({ title: 'Statusy eventów', actions: '<a class="btn btn-link" href="/admin/events?status=pending">Moderacja</a>' }), body: '<div id="pp-chart-status"></div>' })}
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
  const windowHtml = card({
    class: 'mb-3',
    header: cardHeader({
      title: `Eventy — okno (${SEED_DAYS_AHEAD + 1} dni)`,
      actions: `<a class="btn btn-sm btn-outline-secondary" href="/admin/events?from=${esc(today)}&to=${esc(windowEnd)}">Zobacz wszystkie</a>`,
    }),
    body: '<div id="pp-chart-window"></div>',
    footer: `<div class="table-responsive"><table class="table table-vcenter card-table mb-0">
      <thead><tr><th>Dzień</th><th>Wszystkie</th><th class="text-success">Approved</th><th class="text-warning">Pending</th><th class="text-danger">Rejected</th></tr></thead>
      <tbody>${windowRowsHtml}<tr class="table-light">
        <td class="fw-bold">Suma</td><td>${sums.approved + sums.pending + sums.rejected}</td>
        <td class="text-success">${sums.approved}</td><td class="text-warning">${sums.pending}</td><td class="text-danger">${sums.rejected}</td></tr>
      </tbody></table></div>`,
  });

  // ---- Last seed card + 7-day sparkline ----
  const batch = d.lastSeed.batch as any;
  let seedItems = '';
  if (batch) {
    const donePct = lastUnits && lastUnits.total > 0 ? Math.round((lastUnits.done / lastUnits.total) * 100) : 0;
    seedItems += `<div class="list-group-item">
      <div class="row align-items-center">
        <div class="col"><strong>${esc(batch.day)}</strong> ${batchStatusPill(lastRunStatus)} ${pill(batch.run_type === 'cron' ? 'cron' : 'manual', batch.run_type === 'cron' ? 'ok' : 'muted')}</div>
        <div class="col-auto text-secondary">${fmtDate(batch.created_at)}</div>
      </div></div>
      <div class="list-group-item">
        <div class="row align-items-center">
          <div class="col">Unity (${lastUnits?.done ?? 0}/${lastUnits?.total ?? 0})</div>
          <div class="col-6"><div class="progress progress-sm"><div class="progress-bar bg-success" style="width:${donePct}%"></div></div></div>
          <div class="col-auto"><span class="text-secondary">${donePct}%</span></div>
        </div></div>
      <div class="list-group-item">
        <div class="row">
          <div class="col-3 text-secondary">Failed</div><div class="col-3 ${(lastUnits?.failed ?? 0) > 0 ? 'text-danger fw-bold' : 'text-green fw-bold'}">${lastUnits?.failed ?? 0}</div>
          <div class="col-3 text-secondary">Active</div><div class="col-3">${lastUnits?.active ?? 0}</div>
          <div class="col-3 text-secondary">Wiersze</div><div class="col-3">${lastUnits?.rows ?? 0}</div>
        </div></div>`;
  } else {
    seedItems = `<div class="list-group-item"><span class="text-secondary">Brak uruchomień seeda.</span></div>`;
  }
  const seedBadges = `<span class="badge bg-success-lt">${charts.kpis.seedDone} done</span><span class="badge bg-danger-lt">${charts.kpis.seedFailed} failed</span>`;
  const seedRow = `<div class="row row-cards mb-3">
    <div class="col-12 col-xl-8">
      ${card({ class: 'h-100', header: cardHeader({ title: 'Ostatni seed', actions: '<a class="btn btn-sm btn-outline-secondary" href="/admin/seed">Logi seed</a>' }), body: listGroup(seedItems, 'list-group-flush') })}
    </div>
    <div class="col-12 col-xl-4">
      ${card({ class: 'h-100', header: cardHeader({ title: 'Seed · ingest dziennie', actions: seedBadges }), body: '<div class="pt-0"><div id="pp-chart-seed" class="chart-sm mb-2"></div></div>' })}
    </div>
  </div>`;

  // ---- Cron card ----
  const cronHtml = card({
    class: 'mb-3',
    header: cardHeader({
      title: 'Cron (planowanie)',
      actions: '<span class="badge bg-green-lt"><span class="status-dot status-dot-animated bg-green me-1"></span>aktywny</span>',
    }),
    body: timeline(
      timelineItem({ icon: icon('clock'), label: 'Ostatni cron', value: d.cron.lastCronRunMs ? fmtDate(d.cron.lastCronRunMs) : '<span class="text-warning">jeszcze nie wystartował</span>' }) +
      timelineItem({ icon: icon('refresh'), label: 'Następny run', value: '<span id="pp-cron-countdown">—</span>', hint: `<div class="text-secondary">Harmonogram: <code>${esc(d.cron.schedules.join(', '))}</code> — ${esc(d.cron.summary)}</div>` })
    ),
  });

  // ---- Page header ----
  const header = pageHeader({
    pretitle: 'Panel administracyjny',
    title: 'Overview',
    actions: `<div class="btn-list">
      <span id="pp-clock" class="text-secondary align-middle"></span>
      <a href="/admin/events" class="btn btn-outline-secondary">Moderacja eventów</a>
      <a href="/admin/seed" class="btn btn-outline-secondary">Logi seed</a>
      <button class="btn btn-primary d-none d-sm-inline-block" id="ppRefreshBtn" onclick="ppRefresh()">Odśwież</button>
    </div>`,
  });

  const body = `${header}${healthHtml}${kpiHtml}${chartsRow}${windowHtml}${seedRow}${cronHtml}
  <script>window.PP_DATA=${safeJson(charts.pp)};</script>`;

  return renderPage(c, 'Overview', '/admin', body, { scripts: [APEXCHARTS_SRC, staticFilePath('overview')] });
});

export function registerOverview(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
