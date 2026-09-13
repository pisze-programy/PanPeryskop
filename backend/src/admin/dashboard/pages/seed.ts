// Seed page: run health read straight from the v2 work-list — seed_batches
// (run identity) joined to seed_units (per-scope state) and seed_raw (per-event
// ingest). The old seed_runs / scope counters belonged to the retired pipeline.
// Client chart logic in /admin/static/js/pages/seed.js; data bootstrapped inline.
import { Hono } from 'hono';
import {
  APEXCHARTS_SRC, card, cardHeader, empty, esc, fmtDate, icon,
  pageHeader, pill, safeJson, staticFilePath,
} from '../../ui';
import { cronInfo } from '../../queries';
import {
  seedRuns, runStatusCounts, runStatusSeries, unitsForRuns, providerUnitHealth, seedIngestSeries,
} from '../../queries/seed';
import { DAY_MS } from '../../../seed/core/constants';
import { PROVIDER_CONFIGS } from '../../../seed/providers/registry';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

const runStatusPill = (s: string) =>
  s === 'done' ? pill('done', 'ok') :
  s === 'failed' ? pill('failed', 'err') :
  s === 'running' ? pill('running', 'warn') : pill(esc(s), 'muted');
const unitStatusPill = (s: string) =>
  s === 'done' ? pill('done', 'ok') :
  s === 'failed' ? pill('failed', 'err') :
  s === 'claimed' ? pill('claimed', 'warn') : pill(esc(s), 'muted');

const RUN_STATUSES = ['created', 'running', 'done', 'failed'];

pageRoutes.get('/seed', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const dFrom = q.dfrom ? String(q.dfrom) : null;
  const dTo = q.dto ? String(q.dto) : null;
  const bStatus = q.bstatus ? String(q.bstatus) : null;
  const since = Date.now() - 30 * DAY_MS;

  const [allRuns, statusCounts, ingestSeries, runSeries, providerHealth, cron] = await Promise.all([
    seedRuns(db, since, 60),
    runStatusCounts(db, since),
    seedIngestSeries(db, since),
    runStatusSeries(db, since),
    providerUnitHealth(db, since),
    cronInfo(c.env, db),
  ]);

  const runs = allRuns.filter((r) =>
    (!dFrom || r.day >= dFrom) && (!dTo || r.day <= dTo) && (!bStatus || r.status === bStatus));
  const units = await unitsForRuns(db, runs.map((r) => r.id));
  const unitsByRun = new Map<string, Record<string, unknown>[]>();
  for (const u of units) {
    const key = String(u.batch_id);
    const arr = unitsByRun.get(key) ?? [];
    arr.push(u);
    unitsByRun.set(key, arr);
  }

  const nStatus = (s: string) => statusCounts.find((x) => x.status === s)?.n ?? 0;
  const runTotal = statusCounts.reduce((a, b) => a + b.n, 0);
  const runDone = nStatus('done');
  const runFailed = nStatus('failed');
  const runActive = nStatus('running') + nStatus('created');
  const donePct = runTotal ? Math.round((runDone / runTotal) * 100) : 0;
  const failPct = runTotal ? Math.round((runFailed / runTotal) * 100) : 0;
  const actPct = runTotal ? Math.max(0, 100 - donePct - failPct) : 0;
  const ingestedTotal = ingestSeries.reduce((a, b) => a + b.ingested, 0);
  const errorsTotal = ingestSeries.reduce((a, b) => a + b.errors, 0);

  const header = pageHeader({
    pretitle: 'Dashboard',
    title: 'Seed',
    actions: `<a class="btn btn-outline-secondary btn-sm" href="/admin/seed">${icon('refresh')} Odśwież</a>`,
  });
  const statusStrip = `<div class="alert alert-light d-flex align-items-center gap-3 flex-wrap mb-2">
    <span><strong>Cron:</strong> ${esc(cron.schedules.join(', '))} — ${esc(cron.summary)}</span>
    ${cron.nextRunMs ? `<span class="text-secondary">Następny: <strong>${fmtDate(cron.nextRunMs)}</strong></span>` : ''}
    ${cron.lastCronRunMs ? `<span class="text-secondary">Ostatni: ${fmtDate(cron.lastCronRunMs)}</span>` : '<span class="text-warning">Cron nie wystartował</span>'}
  </div>`;
  const howTo = `<div class="alert alert-important alert-dismissible mb-3">
    <div class="d-flex">
      <div>${icon('alert-triangle', 'icon me-2')}<strong>Jak to czytać?</strong> Jedno uruchomienie = jeden <strong>run</strong> (<code>seed_batches</code>). Stan liczymy na żywo z <strong>unitów</strong> (<code>seed_units</code>): <em>done</em> / <em>failed</em> / <em>pending</em> / <em>claimed</em>. Ingest i błędy pochodzą z <code>seed_raw</code>. Wszystkie providery (Worker i VPS) są w tych samych statystykach.</div>
      <a class="btn-close" data-bs-dismiss="alert" aria-label="Zamknij"></a>
    </div>
  </div>`;

  const statsRow = `<div class="row row-cards mb-3">
    <div class="col-6 col-md-4 col-xl-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Runy (30d)</div>
      <div class="h2 mb-1">${runTotal}</div>
      <div class="progress progress-sm">
        <div class="progress-bar bg-success" style="width:${donePct}%"></div>
        <div class="progress-bar bg-danger" style="width:${failPct}%"></div>
        <div class="progress-bar bg-warning" style="width:${actPct}%"></div>
      </div>
      <div class="text-secondary fs-5 mt-1">${runDone} done · ${runFailed} failed · ${runActive} active</div>
    </div></div></div>
    <div class="col-6 col-md-4 col-xl-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Zakończone</div>
      <div class="h2 mb-1 text-success">${runDone} <span class="fs-5 text-muted">· ${donePct}%</span></div>
      <div class="progress progress-sm"><div class="progress-bar bg-success" style="width:${donePct}%"></div></div>
      <div class="text-secondary fs-5 mt-1">${runDone}/${runTotal} (success)</div>
    </div></div></div>
    <div class="col-6 col-md-4 col-xl-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Ingest (30d)</div>
      <div class="h2 mb-1">${ingestedTotal}</div>
      <div class="text-secondary fs-5">eventów zapisanych</div>
    </div></div></div>
    <div class="col-6 col-md-4 col-xl-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Błędy (30d)</div>
      <div class="h2 mb-1 ${errorsTotal > 0 ? 'text-danger' : ''}">${errorsTotal}</div>
      <div class="text-secondary fs-5">wiersze error/failure</div>
    </div></div></div>
  </div>`;

  const chartRow = `<div class="row row-cards mb-3">
    <div class="col-12 col-lg-8">${card({ header: cardHeader({ title: 'Ingest / dzień' }), body: '<div id="pp-chart-ingest"></div>' })}</div>
    <div class="col-12 col-lg-4">${card({ header: cardHeader({ title: 'Runy / dzień' }), body: '<div id="pp-chart-runs"></div>' })}</div>
  </div>`;

  const sel = (name: string, cur: string | null, opts: { value: string; label: string }[]) =>
    `<select name="${name}" class="form-select" onchange="this.form.submit()"><option value="" ${!cur ? 'selected' : ''}>Wszystkie</option>${opts.map((o) =>
      `<option value="${esc(o.value)}" ${cur === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  const filterBar = `<form method="get" action="/admin/seed" class="card mb-3"><div class="card-body">
    <div class="row g-2 align-items-end">
      <div class="col-6 col-md-3"><label class="form-label">Dzień od</label><input name="dfrom" type="date" class="form-control" value="${esc(dFrom || '')}" onchange="this.form.submit()" /></div>
      <div class="col-6 col-md-3"><label class="form-label">Dzień do</label><input name="dto" type="date" class="form-control" value="${esc(dTo || '')}" onchange="this.form.submit()" /></div>
      <div class="col-6 col-md-3"><label class="form-label">Status</label>${sel('bstatus', bStatus, RUN_STATUSES.map((s) => ({ value: s, label: s })))}</div>
      <div class="col-6 col-md-3 d-flex gap-2"><button class="btn btn-primary ms-auto" type="submit">Zastosuj</button><a class="btn btn-outline-secondary" href="/admin/seed">Wyczyść</a></div>
    </div>
  </div></form>`;

  const healthByProvider = new Map(providerHealth.map((p) => [String(p.provider), p]));
  const maxRows = Math.max(1, ...providerHealth.map((p) => Number(p.rows)));
  const provRows = PROVIDER_CONFIGS.map((p) => {
    const h = healthByProvider.get(p.id);
    const executor = p.executors.vps ? 'VPS' : p.executors.worker ? 'Worker' : 'poza';
    const units = Number(h?.units ?? 0);
    const done = Number(h?.done ?? 0);
    const failed = Number(h?.failed ?? 0);
    const rows = Number(h?.rows ?? 0);
    return `<tr>
      <td class="font-monospace">${esc(p.id)}</td>
      <td>${executor === 'Worker' ? pill('worker', 'ok') : executor === 'VPS' ? pill('VPS', 'muted') : pill('poza', 'muted')}</td>
      <td>${units}</td><td>${done}</td>
      <td class="${failed > 0 ? 'text-danger fw-bold' : ''}">${failed}</td>
      <td>${rows}</td>
      <td style="min-width:100px"><div class="progress progress-sm"><div class="progress-bar" style="width:${Math.round((rows / maxRows) * 100)}%"></div></div></td>
    </tr>`;
  }).join('');
  const providerCard = card({
    class: 'mb-3',
    header: cardHeader({ title: 'Zdrowie providerów (30d)' }),
    body: `<div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Provider</th><th>Executor</th><th>Unity</th><th>Done</th><th>Failed</th><th>Wiersze</th><th>Rel.</th></tr></thead>
      <tbody>${provRows || `<tr><td colspan="7" class="text-secondary">Brak providerów.</td></tr>`}</tbody></table></div>`,
  });

  const runCards = runs.map((b) => {
    const us = unitsByRun.get(b.id) ?? [];
    const donePctRun = b.total > 0 ? Math.round((b.done / b.total) * 100) : 0;
    const unitRows = us.map((u) => `<tr>
      <td>${esc(String(u.day))}</td><td class="font-monospace">${esc(String(u.provider))}</td>
      <td class="font-monospace">${esc(String(u.slice))}</td><td>${esc(String(u.executor))}</td>
      <td>${unitStatusPill(String(u.status))}</td><td>${u.attempts}</td><td>${u.rows_written}</td>
      <td>${u.error ? `<span class="text-danger font-monospace text-break">${esc(String(u.error))}</span>` : '—'}</td></tr>`).join('');
    return `<div class="list-group-item">
      <div class="row align-items-center">
        <div class="col-auto"><span class="status-dot ${b.status === 'done' ? 'status-green' : b.status === 'failed' ? 'status-red' : 'status-yellow'}"></span></div>
        <div class="col">
          <div class="fw-bold">${esc(b.day)}</div>
          <div class="text-secondary">${b.done}/${b.total} unitów · ${b.failed} failed · ${b.active} active · aktualizacja ${fmtDate(b.updated_at)}${b.last_error ? ` · <span class="text-danger" title="${esc(b.last_error)}">${esc(String(b.last_error).slice(0, 80))}</span>` : ''}</div>
        </div>
        <div class="col-auto">${runStatusPill(b.status)}${pill(b.run_type === 'cron' ? 'cron' : 'manual', b.run_type === 'cron' ? 'ok' : 'muted')}</div>
        <div class="col-3"><div class="progress progress-sm"><div class="progress-bar bg-success" style="width:${donePctRun}%"></div></div></div>
        <div class="col-auto"><a class="btn btn-sm btn-link" data-bs-toggle="collapse" href="#run-${esc(b.id)}">Rozwiń ${icon('chevron-down')}</a></div>
      </div>
      <div class="collapse mt-2" id="run-${esc(b.id)}">
        <div class="text-secondary mb-1 fs-5 text-uppercase">Unity</div>
        <div class="table-responsive"><table class="table table-sm table-vcenter">
          <thead><tr><th>Dzień</th><th>Provider</th><th>Scope</th><th>Executor</th><th>Status</th><th>Próby</th><th>Wiersze</th><th>Błąd</th></tr></thead>
          <tbody>${unitRows || `<tr><td colspan="8" class="text-secondary">Brak unitów w tym runie.</td></tr>`}</tbody></table></div>
      </div>
    </div>`;
  }).join('');
  const runCard = card({
    class: 'mb-3',
    header: cardHeader({ title: 'Runy' }),
    body: `<div class="list-group list-group-flush list-group-hoverable">${runCards || `<div class="list-group-item text-secondary">Brak runów w oknie.</div>`}</div>`,
  });

  const body = `${header}${statusStrip}${howTo}${statsRow}${chartRow}${filterBar}${providerCard}${runCard}
  <script>window.SEED_CHARTS=${safeJson({
    ingest: ingestSeries,
    runs: {
      days: runSeries.map((r) => r.d),
      done: runSeries.map((r) => r.done),
      failed: runSeries.map((r) => r.failed),
      running: runSeries.map((r) => r.running),
    },
  })};</script>`;

  return renderPage(c, 'Seed', '/admin/seed', body, { scripts: [APEXCHARTS_SRC, staticFilePath('seed')] });
});

export function registerSeed(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
