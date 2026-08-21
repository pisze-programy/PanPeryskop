// Seed page: stat cards with progress, ApexCharts trends, provider health,
// batch timeline with collapse, paginated runs table with error drill-down.

import { Hono } from 'hono';
import { cards, empty, esc, fmtDate, fmtDur, fmtPct, pill, pagination, safeJson, toastContainer, toastScript, APEXCHARTS_SRC, icon } from '../../ui';
import { browserBudget, cronInfo } from '../../queries';
import { requireSession } from '../common';
import { fmtPctNum } from '../common';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

function batchStatusPill(s: string): string {
  return s === 'done' ? pill('done', 'ok') :
    s === 'failed' ? pill('failed', 'err') :
    s === 'ingesting' ? pill('ingesting', 'warn') :
    s === 'fetching' ? pill('fetching', 'warn') :
    s === 'fetch_done' ? pill('fetch_done', 'warn') : pill(esc(s), 'muted');
}
const scopeStatusPill = (s: string) =>
  s === 'done' ? pill('done', 'ok') :
  s === 'failed' ? pill('failed', 'err') :
  s === 'running' ? pill('running', 'warn') : pill(esc(s), 'muted');

const BATCH_STATUSES = ['created', 'fetching', 'fetch_done', 'ingesting', 'done', 'failed'];
const RUN_TYPES = ['cron', 'manual'];
const TRANSPORTS = ['fetch', 'browser', 'mixed'];

pageRoutes.get('/seed', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const dFrom = q.dfrom ? String(q.dfrom) : null;
  const dTo = q.dto ? String(q.dto) : null;
  const bStatus = q.bstatus ? String(q.bstatus) : null;
  const provider = q.provider ? String(q.provider) : null;
  const transport = q.transport ? String(q.transport) : null;
  const runType = q.rtype ? String(q.rtype) : null;
  const errsOnly = q.errsonly === '1';
  const limitRaw = parseInt(String(q.limit || '25'), 10);
  const RUN_PAGE_SIZE = [25, 50, 100].includes(limitRaw) ? limitRaw : 25;
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);

  const since = Date.now() - 30 * 86_400_000;
  const startOfMonth = (() => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  })();

  // ---- Stat aggregates (30d, excluding legacy provider='total' rows) ----
  const [bAgg, rAgg, providers, budget, cron, stuck] = await Promise.all([
    db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(status='done'),0) done, COALESCE(SUM(status='failed'),0) failed
                FROM seed_batches WHERE created_at>=?`).bind(since).first<{ total: number; done: number; failed: number }>(),
    db.prepare(`SELECT COALESCE(SUM(ingested),0) ingested, COALESCE(SUM(errors),0) errors, COALESCE(AVG(duration_ms),0) avg_ms
                FROM seed_runs WHERE created_at>=? AND provider<>'total'`).bind(since).first<{ ingested: number; errors: number; avg_ms: number }>(),
    db.prepare('SELECT DISTINCT provider FROM seed_runs WHERE created_at>=? AND provider<>? ORDER BY provider').bind(since, 'total').all<{ provider: string }>(),
    c.env.BROWSER ? browserBudget(c.env) : null,
    cronInfo(c.env, db),
    db.prepare(`SELECT day, status, updated_at, reason FROM seed_batches
                WHERE status NOT IN ('done','failed') AND updated_at < ? ORDER BY updated_at ASC LIMIT 20`)
      .bind(Date.now() - 2 * 3_600_000).all<{ day: string; status: string; updated_at: number; reason: string | null }>(),
  ]);

  // ---- Chart series ----
  const [ingestSeries, batchSeries, budgetSeries] = await Promise.all([
    db.prepare(`SELECT date(created_at/1000,'unixepoch','+2 hours') d,
                COALESCE(SUM(candidates),0) candidates, COALESCE(SUM(ingested),0) ingested, COALESCE(SUM(errors),0) errors
                FROM seed_runs WHERE created_at>=? AND provider<>'total' GROUP BY d ORDER BY d`).bind(since).all<{ d: string; candidates: number; ingested: number; errors: number }>(),
    db.prepare(`SELECT date(created_at/1000,'unixepoch','+2 hours') d, COUNT(*) n,
                COALESCE(SUM(status='done'),0) done, COALESCE(SUM(status='failed'),0) failed
                FROM seed_batches WHERE created_at>=? GROUP BY d ORDER BY d`).bind(since).all<{ d: string; n: number; done: number; failed: number }>(),
    db.prepare(`SELECT date(created_at/1000,'unixepoch','+2 hours') d, COALESCE(SUM(browser_ms),0) ms
                FROM seed_runs WHERE created_at>=? AND provider<>'total' GROUP BY d ORDER BY d`).bind(startOfMonth).all<{ d: string; ms: number }>(),
  ]);
  const active = (batchSeries.results ?? []).map((b) => b.n - b.done - b.failed);

  // ---- Provider health ----
  const providerHealth = await db.prepare(`SELECT provider,
      COUNT(*) runs, COALESCE(SUM(candidates),0) candidates, COALESCE(SUM(ingested),0) ingested,
      COALESCE(SUM(errors),0) errors, COALESCE(AVG(duration_ms),0) avg_ms, COALESCE(SUM(browser_ms),0) browser_ms
    FROM seed_runs WHERE created_at>=? AND provider<>'total' GROUP BY provider ORDER BY ingested DESC`).bind(since).all<{ provider: string; runs: number; candidates: number; ingested: number; errors: number; avg_ms: number; browser_ms: number }>();
  const maxIngest = Math.max(1, ...(providerHealth.results ?? []).map((p) => p.ingested));

  // ---- Batches (filtered) + scopes/runs IN ----
  let bSql = 'SELECT * FROM seed_batches WHERE created_at>=?';
  const bBinds: unknown[] = [since];
  if (dFrom) { bSql += ' AND day>=?'; bBinds.push(dFrom); }
  if (dTo) { bSql += ' AND day<=?'; bBinds.push(dTo); }
  if (bStatus) { bSql += ' AND status=?'; bBinds.push(bStatus); }
  bSql += ' ORDER BY created_at DESC LIMIT 60';
  const batches = (await db.prepare(bSql).bind(...bBinds).all<any>()).results ?? [];
  const byBatch = new Map<string, any[]>();
  const ids = batches.map((b) => b.id);
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const [sc, ru] = await Promise.all([
      db.prepare(`SELECT * FROM seed_scopes WHERE batch_id IN (${ph})`).bind(...ids).all<any>(),
      db.prepare(`SELECT * FROM seed_runs WHERE batch_id IN (${ph})`).bind(...ids).all<any>(),
    ]);
    for (const s of (sc.results ?? [])) { (byBatch.get(s.batch_id) ?? byBatch.set(s.batch_id, []).get(s.batch_id)!).push({ kind: 'scope', ...s }); }
    for (const r of (ru.results ?? [])) { (byBatch.get(r.batch_id) ?? byBatch.set(r.batch_id, []).get(r.batch_id)!).push({ kind: 'run', ...r }); }
  }

  // ---- Runs table (paginated, filtered) ----
  let rWhere = 'r.created_at>=? AND r.provider<>?';
  const rBinds: unknown[] = [since, 'total'];
  if (dFrom) { rWhere += ' AND r.day>=?'; rBinds.push(dFrom); }
  if (dTo) { rWhere += ' AND r.day<=?'; rBinds.push(dTo); }
  if (provider) { rWhere += ' AND r.provider=?'; rBinds.push(provider); }
  if (transport) { rWhere += ' AND r.transport=?'; rBinds.push(transport); }
  if (runType) { rWhere += ' AND r.run_type=?'; rBinds.push(runType); }
  if (errsOnly) { rWhere += ' AND r.errors>0'; }
  const cntRow = await db.prepare(`SELECT COUNT(*) n FROM seed_runs r WHERE ${rWhere}`).bind(...rBinds).first<{ n: number }>();
  const runTotal = cntRow?.n ?? 0;
  const runPages = Math.max(1, Math.ceil(runTotal / RUN_PAGE_SIZE));
  const runRows = (await db.prepare(`SELECT r.*, b.day AS batch_day FROM seed_runs r LEFT JOIN seed_batches b ON b.id=r.batch_id
    WHERE ${rWhere} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).bind(...rBinds, RUN_PAGE_SIZE, (page - 1) * RUN_PAGE_SIZE).all<any>()).results ?? [];

  // ---- Page header ----
  const header = `<div class="page-header d-print-none mb-3">
    <div class="row g-2 align-items-center">
      <div class="col">
        <div class="page-pretitle">Dashboard</div>
        <h2 class="page-title">Seed</h2>
      </div>
      <div class="col-auto ms-auto">
        <a class="btn btn-outline-secondary btn-sm" href="/admin/seed">${icon('refresh')} Odśwież</a>
      </div>
    </div>
  </div>`;

  // ---- Status strip ----
  const statusStrip = `<div class="alert alert-light d-flex align-items-center gap-3 flex-wrap mb-2">
    <span><strong>Cron:</strong> ${esc(cron.schedules.join(', '))} — ${esc(cron.summary)}</span>
    ${cron.nextRunMs ? `<span class="text-secondary">Następny: <strong>${fmtDate(cron.nextRunMs)}</strong></span>` : ''}
    ${cron.lastCronRunMs ? `<span class="text-secondary">Ostatni: ${fmtDate(cron.lastCronRunMs)}</span>` : '<span class="text-warning">Cron nie wystartował</span>'}
  </div>
  <div class="alert alert-important alert-dismissible mb-3">
    <div class="d-flex">
      <div>${icon('alert-triangle', 'icon me-2')}<strong>Jak to czytać?</strong> Każde uruchomienie tworzy jeden <strong>batch</strong> = pełny seed dnia; w batchu <strong>scopy</strong> przechodzą przez kolejkę i logują uruchomienia w <strong>seed_runs</strong>.</div>
      <a class="btn-close" data-bs-dismiss="alert" aria-label="Zamknij"></a>
    </div>
  </div>`;

  // ---- Stat cards ----
  const bTotal = bAgg?.total ?? 0;
  const bDone = bAgg?.done ?? 0;
  const bFailed = bAgg?.failed ?? 0;
  const bActive = bTotal - bDone - bFailed;
  const donePct = bTotal ? Math.round((bDone / bTotal) * 100) : 0;
  const failPct = bTotal ? Math.round((bFailed / bTotal) * 100) : 0;
  const actPct = bTotal ? Math.max(0, 100 - donePct - failPct) : 0;
  const budgetHtml = budget
    ? `<div class="col-6 col-md-4 col-xl-3"><div class="card card-sm"><div class="card-body">
        <div class="text-secondary text-uppercase fw-bold fs-6">Browser budget</div>
        <div class="h2 mb-1 ${budget.exceeded ? 'text-danger' : ''}">${fmtPct(budget.monthMs, budget.limitMs)}</div>
        <div class="progress progress-sm">
          <div class="progress-bar ${budget.exceeded ? 'bg-danger' : 'bg-primary'}" style="width:${Math.min(100, fmtPctNum(budget.monthMs, budget.limitMs))}%"></div>
        </div>
        <div class="text-secondary fs-5 mt-1">${fmtDur(budget.monthMs)} / ${fmtDur(budget.limitMs)}${budget.exceeded ? ' · <strong class="text-danger">PRZEKROCZONY</strong>' : ''}</div>
      </div></div></div>`
    : '';
  const statsRow = `<div class="row row-cards mb-3">
    <div class="col-6 col-md-4 col-xl-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Batche (30d)</div>
      <div class="h2 mb-1">${bTotal}</div>
      <div class="progress progress-sm">
        <div class="progress-bar bg-success" style="width:${donePct}%"></div>
        <div class="progress-bar bg-danger" style="width:${failPct}%"></div>
        <div class="progress-bar bg-warning" style="width:${actPct}%"></div>
      </div>
      <div class="text-secondary fs-5 mt-1">${bDone} done · ${bFailed} failed · ${bActive} active</div>
    </div></div></div>
    <div class="col-6 col-md-4 col-xl-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Zakończone</div>
      <div class="h2 mb-1 text-success">${bDone} <span class="fs-5 text-muted">· ${donePct}%</span></div>
      <div class="progress progress-sm"><div class="progress-bar bg-success" style="width:${donePct}%"></div></div>
      <div class="text-secondary fs-5 mt-1">${bDone}/${bTotal} (success)</div>
    </div></div></div>
    <div class="col-6 col-md-4 col-xl-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Przetworzono (ingested 30d)</div>
      <div class="h2 mb-1">${rAgg?.ingested ?? 0}</div>
      <div class="text-secondary fs-5">candidates w tej samej serii</div>
    </div></div></div>
    <div class="col-6 col-md-4 col-xl-3"><div class="card card-sm"><div class="card-body">
      <div class="text-secondary text-uppercase fw-bold fs-6">Błędy (30d)</div>
      <div class="h2 mb-1 ${(rAgg?.errors ?? 0) > 0 ? 'text-danger' : ''}">${rAgg?.errors ?? 0}</div>
      <div class="text-secondary fs-5">Śr. czas: ${fmtDur(rAgg?.avg_ms ?? 0)} / run</div>
    </div></div></div>
    ${budgetHtml}
  </div>`;

  // ---- Charts ----
  const chartRow1 = `<div class="row row-cards mb-3">
    <div class="col-12 col-lg-8">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Ingested / dzień</h3></div>
        <div class="card-body"><div id="pp-chart-ingest"></div></div>
      </div>
    </div>
    <div class="col-12 col-lg-4">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Batche / dzień</h3></div>
        <div class="card-body"><div id="pp-chart-batches"></div></div>
      </div>
    </div>
  </div>
  <div class="row row-cards mb-3">
    <div class="col-12 col-lg-6">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Browser budget / dzień</h3>
          <div class="card-actions"><span class="text-secondary fs-5">limit ${budget ? fmtDur(budget.limitMs) : '—'}</span></div></div>
        <div class="card-body"><div id="pp-chart-budget"></div></div>
      </div>
    </div>
    <div class="col-12 col-lg-6">
      <div class="card h-100">
        <div class="card-header"><h3 class="card-title">Zakleszczone batche</h3></div>
        <div class="card-body">
          ${(stuck.results ?? []).length
            ? `<div class="list-group list-group-flush">${(stuck.results ?? []).map((s) => `
                <div class="list-group-item d-flex align-items-center justify-content-between">
                  <span><strong>${esc(s.day)}</strong> ${batchStatusPill(s.status)} ${esc(fmtDate(s.updated_at))}</span>
                  ${s.reason ? `<span class="text-danger fs-6" title="${esc(s.reason)}">${esc(String(s.reason).slice(0, 40))}</span>` : ''}
                </div>`).join('')}</div>`
            : `<div class="alert alert-success mb-0 d-flex align-items-center">${icon('check')} <span class="ms-2">Brak zakleszczonych batchy.</span></div>`}
        </div>
      </div>
    </div>
  </div>`;

  // ---- Filters ----
  const sel = (name: string, cur: string | null, opts: string[]) =>
    `<select name="${name}" class="form-select" onchange="this.form.submit()">${opts.map((o) =>
      `<option value="${o}" ${cur === o ? 'selected' : ''}>${o || 'Wszystkie'}</option>`).join('')}</select>`;
  const filterBar = `<form method="get" action="/admin/seed" class="card mb-3"><div class="card-body">
    <div class="row g-2 align-items-end">
      <div class="col-6 col-md-2"><label class="form-label">Dzień od</label><input name="dfrom" type="date" class="form-control" value="${esc(dFrom || '')}" onchange="this.form.submit()" /></div>
      <div class="col-6 col-md-2"><label class="form-label">Dzień do</label><input name="dto" type="date" class="form-control" value="${esc(dTo || '')}" onchange="this.form.submit()" /></div>
      <div class="col-6 col-md-2"><label class="form-label">Status</label>${sel('bstatus', bStatus, ['', ...BATCH_STATUSES])}</div>
      <div class="col-6 col-md-2"><label class="form-label">Provider</label>${sel('provider', provider, ['', ...(providers.results ?? []).map((p) => p.provider)])}</div>
      <div class="col-6 col-md-2"><label class="form-label">Transport</label>${sel('transport', transport, ['', ...TRANSPORTS])}</div>
      <div class="col-6 col-md-2"><label class="form-label">Typ</label>${sel('rtype', runType, ['', ...RUN_TYPES])}</div>
      <div class="col-12 d-flex align-items-center gap-3">
        <label class="form-check"><input class="form-check-input" type="checkbox" name="errsonly" value="1" ${errsOnly ? 'checked' : ''} onchange="this.form.submit()"> Tylko błędy</label>
        <button class="btn btn-primary ms-auto" type="submit">Zastosuj</button>
        <a class="btn btn-outline-secondary" href="/admin/seed">Wyczyść filtry</a>
      </div>
    </div>
  </div></form>`;

  // ---- Provider health ----
  const provRows = (providerHealth.results ?? []).map((p) => {
    const errPct = p.runs ? Math.round((p.errors / p.runs) * 100) : 0;
    return `<tr>
      <td class="font-monospace">${esc(p.provider)}</td>
      <td>${p.runs}</td><td>${p.candidates}</td><td>${p.ingested}</td>
      <td class="text-danger fw-bold">${p.errors}</td>
      <td style="min-width:120px"><div class="progress progress-sm">
        <div class="progress-bar bg-danger" style="width:${Math.max(0.5, errPct)}%"></div></div></td>
      <td>${fmtDur(p.avg_ms)}</td><td>${fmtDur(p.browser_ms)}</td>
      <td><div class="progress progress-sm" style="min-width:80px">
        <div class="progress-bar" style="width:${Math.round((p.ingested / maxIngest) * 100)}%"></div></div></td>
    </tr>`;
  }).join('');
  const providerCard = `<div class="card mb-3">
    <div class="card-header"><h3 class="card-title">Zdrowie providerów</h3></div>
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Provider</th><th>Runs</th><th>Cand</th><th>Ingest</th><th>Err</th><th>Err%</th><th>Śr. czas</th><th>Browser</th><th>Rel. ingest</th></tr></thead>
      <tbody>${provRows || `<tr><td colspan="9" class="text-secondary">Brak runów w oknie.</td></tr>`}</tbody></table></div>
  </div>`;

  // ---- Batch timeline (collapse) ----
  const batchCards = batches.map((b) => {
    const items = byBatch.get(b.id) ?? [];
    const scopes = items.filter((x) => x.kind === 'scope');
    const rs = items.filter((x) => x.kind === 'run');
    const scopeRows = scopes.map((s) => `<tr>
      <td class="font-monospace">${esc(s.provider)}</td><td class="font-monospace">${esc(s.scope)}</td>
      <td>${scopeStatusPill(s.status)}</td><td>${s.attempts}</td>
      <td>${s.error ? `<span class="text-danger font-monospace text-break">${esc(String(s.error))}</span>` : '—'}</td></tr>`).join('');
    const runRows = rs.map((r) => `<tr>
      <td>${fmtDate(r.created_at)}</td><td>${esc(r.provider)}</td><td>${esc(r.transport)}</td>
      <td>${r.candidates}</td><td>${r.ingested}</td><td>${r.skipped}</td>
      <td class="${r.errors ? 'text-danger fw-bold' : 'text-success'}">${r.errors}</td>
      <td>${fmtDur(r.duration_ms)}</td><td>${fmtDur(r.browser_ms)}</td></tr>`).join('');
    const donePct = b.scopes_total > 0 ? Math.round((b.scopes_done / b.scopes_total) * 100) : 0;
    return `<div class="list-group-item">
      <div class="row align-items-center">
        <div class="col-auto"><span class="status-dot ${b.status === 'done' ? 'status-green' : b.status === 'failed' ? 'status-red' : 'status-yellow'}"></span></div>
        <div class="col">
          <div class="fw-bold">${esc(b.day)}</div>
          <div class="text-secondary">${b.scopes_done}/${b.scopes_total} scopów · ${b.providers_done}/${b.providers_total} providerów · aktualizacja ${fmtDate(b.updated_at)}${b.reason ? ` · <span class="text-danger" title="${esc(b.reason)}">${esc(String(b.reason).slice(0, 80))}</span>` : ''}</div>
        </div>
        <div class="col-auto">${batchStatusPill(b.status)}${b.run_type === 'cron' ? pill('cron', 'ok') : pill('manual', 'muted')}</div>
        <div class="col-3"><div class="progress progress-sm"><div class="progress-bar bg-success" style="width:${donePct}%"></div></div></div>
        <div class="col-auto"><a class="btn btn-sm btn-link" data-bs-toggle="collapse" href="#batch-${esc(b.id)}">Rozwiń ${icon('chevron-down')}</a></div>
      </div>
      <div class="collapse mt-2" id="batch-${esc(b.id)}">
        <div class="text-secondary mb-1 fs-5 text-uppercase">Scopy</div>
        <div class="table-responsive mb-3"><table class="table table-sm table-vcenter">
          <thead><tr><th>Provider</th><th>Scope</th><th>Status</th><th>Próby</th><th>Błąd</th></tr></thead>
          <tbody>${scopeRows || `<tr><td colspan="5" class="text-secondary">Brak scopów.</td></tr>`}</tbody></table></div>
        <div class="text-secondary mb-1 fs-5 text-uppercase">Uruchomienia</div>
        <div class="table-responsive"><table class="table table-sm table-vcenter">
          <thead><tr><th>Czas</th><th>Provider</th><th>Transport</th><th>Cand</th><th>Ingest</th><th>Skip</th><th>Err</th><th>Czas</th><th>Browser</th></tr></thead>
          <tbody>${runRows || `<tr><td colspan="9" class="text-secondary">Brak logów (batch sprzed linkowania runów).</td></tr>`}</tbody></table></div>
      </div>
    </div>`;
  }).join('');
  const batchCard = `<div class="card mb-3">
    <div class="card-header"><h3 class="card-title">Batche (kolejki)</h3></div>
    <div class="list-group list-group-flush list-group-hoverable">${batchCards || `<div class="list-group-item text-secondary">Brak batchy w oknie.</div>`}</div>
  </div>`;

  // ---- Runs table with totals footer ----
  const runHref = (p: number) => {
    const qs = new URLSearchParams();
    if (dFrom) qs.set('dfrom', dFrom); if (dTo) qs.set('dto', dTo);
    if (bStatus) qs.set('bstatus', bStatus); if (provider) qs.set('provider', provider);
    if (transport) qs.set('transport', transport); if (runType) qs.set('rtype', runType);
    if (errsOnly) qs.set('errsonly', '1'); qs.set('limit', String(RUN_PAGE_SIZE));
    qs.set('page', String(p));
    return `/admin/seed?${qs}`;
  };
  let sumIngest = 0, sumSkip = 0, sumErr = 0;
  const runRowsHtml = runRows.map((r) => {
    sumIngest += r.ingested || 0; sumSkip += r.skipped || 0; sumErr += r.errors || 0;
    const errCell = (r.errors ?? 0) > 0
      ? `<a class="text-danger fw-bold" data-bs-toggle="collapse" href="#err-${esc(r.id)}">${r.errors}</a>`
      : `<span class="text-success">${r.errors ?? 0}</span>`;
    return `<tr>
      <td>${fmtDate(r.created_at)}</td><td>${esc(r.day || r.batch_day || '')}</td>
      <td>${r.run_type === 'cron' ? pill('cron', 'ok') : pill('manual', 'muted')}</td>
      <td>${esc(r.provider)}</td><td>${esc(r.transport)}</td>
      <td>${r.candidates}</td><td>${r.ingested}</td><td>${r.skipped}</td>
      <td>${errCell}</td><td>${fmtDur(r.duration_ms)}</td><td>${fmtDur(r.browser_ms)}</td></tr>
    ${(r.errors ?? 0) > 0 && r.error_detail ? `<tr class="collapse" id="err-${esc(r.id)}"><td colspan="11" class="bg-surface-secondary"><pre class="m-0 font-monospace text-break">${esc(String(r.error_detail))}</pre></td></tr>` : ''}`;
  }).join('');
  const runsCard = `<div class="card mb-3">
    <div class="card-header"><h3 class="card-title">Rundy (seed_runs)</h3>
      <div class="card-actions"><span class="badge bg-secondary-lt">${runTotal}</span></div></div>
    <div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Czas</th><th>Dzień</th><th>Typ</th><th>Provider</th><th>Transport</th><th>Cand</th><th>Ingest</th><th>Skip</th><th>Err</th><th>Czas</th><th>Browser</th></tr></thead>
      <tbody>${runRowsHtml || `<tr><td colspan="11">${empty()}</td></tr>`}
      ${runRows.length ? `<tr class="table-light">
        <td colspan="6" class="fw-bold text-end">Suma (strona)</td>
        <td class="fw-bold">${sumIngest}</td><td class="fw-bold">${sumSkip}</td><td class="fw-bold ${sumErr ? 'text-danger' : ''}">${sumErr}</td><td colspan="2"></td></tr>` : ''}</tbody></table></div>
    <div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
      <span class="text-secondary">${runTotal} runów · strona ${page} / ${runPages}</span>
      ${pagination(page, runPages, runHref)}
    </div>
  </div>`;

  const body = `${header}${statusStrip}${statsRow}${chartRow1}${filterBar}${providerCard}${batchCard}${runsCard}
  ${toastContainer()}
  <script>window.SEED_CHARTS=${safeJson({
    ingest: ingestSeries.results ?? [],
    batches: { days: (batchSeries.results ?? []).map((b) => b.d), done: (batchSeries.results ?? []).map((b) => b.done), failed: (batchSeries.results ?? []).map((b) => b.failed), active },
    budget: { days: (budgetSeries.results ?? []).map((b) => b.d), ms: (budgetSeries.results ?? []).map((b) => b.ms), limitMs: budget?.limitMs ?? null },
  })};</script>
  <script>
  window.addEventListener('load', function(){
    if(!window.ApexCharts||!window.SEED_CHARTS) return;
    var C=window.ApexCharts, d=window.SEED_CHARTS;
    var ts=function(day){return Date.parse(day+'T12:00:00');};
    new C(document.getElementById('pp-chart-ingest'),{
      chart:{type:'area',height:300,fontFamily:'inherit',toolbar:{show:false},zoom:{type:'x'}},
      series:[
        {name:'candidates',data:d.ingest.map(function(p){return [ts(p.d),p.candidates];})},
        {name:'ingested',data:d.ingest.map(function(p){return [ts(p.d),p.ingested];})},
      ],
      colors:['#8d99ab','#206bc4'],stroke:{width:2,curve:'smooth'},fill:{opacity:0.08},
      dataLabels:{enabled:false},grid:{strokeDashArray:4},
      xaxis:{type:'datetime',labels:{format:'dd.MM'}},
      tooltip:{theme:'dark'},
    }).render();
    new C(document.getElementById('pp-chart-batches'),{
      chart:{type:'bar',height:300,fontFamily:'inherit',toolbar:{show:false},stacked:true},
      series:[
        {name:'done',data:d.batches.done},
        {name:'failed',data:d.batches.failed},
        {name:'active',data:d.batches.active},
      ],
      colors:['#2fb344','#d63939','#f59f00'],dataLabels:{enabled:false},grid:{strokeDashArray:4},
      xaxis:{categories:d.batches.days},tooltip:{theme:'dark'},
    }).render();
    new C(document.getElementById('pp-chart-budget'),{
      chart:{type:'bar',height:300,fontFamily:'inherit',toolbar:{show:false}},
      series:[{name:'browser ms',data:d.budget.ms}],
      colors:['#206bc4'],dataLabels:{enabled:false},grid:{strokeDashArray:4},
      xaxis:{categories:d.budget.days,labels:{format:'dd.MM'}},tooltip:{theme:'dark'},
      yaxis:{labels:{formatter:function(v){return Math.round(v/60000)+'min';}}},
      annotations:d.budget.limitMs?{yaxis:[{y:d.budget.limitMs,strokeColor:'#d63939',label:{text:'limit'}}]}:{},
    }).render();
  });
  </script>
  ${toastScript()}`;

  return renderPage(c, 'Seed', '/admin/seed', body, { scripts: [APEXCHARTS_SRC] });
});

export function registerSeed(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
