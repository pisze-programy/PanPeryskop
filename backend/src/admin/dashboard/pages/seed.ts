// Seed page: stat cards with progress, ApexCharts trends, provider health,
// batch timeline with collapse, paginated runs table with error drill-down.
// Client logic in /admin/static/js/pages/seed.js; chart data bootstrapped inline.

import { Hono } from 'hono';
import {
  APEXCHARTS_SRC, card, cardHeader, empty, esc, fmtDate, fmtDur, fmtPct, icon, pageHeader,
  pagination, pill, safeJson, staticFilePath,
} from '../../ui';
import { browserBudget, cronInfo } from '../../queries';
import { requireSession, fmtPctNum } from '../common';
import { PROVIDER_CONFIGS } from '../../../seed/providers/registry';
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
  const startOfMonth = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);

  const [bAgg, rAgg, budget, cron, stuck] = await Promise.all([
    db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(status='done'),0) done, COALESCE(SUM(status='failed'),0) failed
                FROM seed_batches WHERE created_at>=?`).bind(since).first<{ total: number; done: number; failed: number }>(),
    db.prepare(`SELECT COALESCE(SUM(ingested),0) ingested, COALESCE(SUM(errors),0) errors, COALESCE(AVG(duration_ms),0) avg_ms
                FROM seed_runs WHERE created_at>=? AND provider<>'total'`).bind(since).first<{ ingested: number; errors: number; avg_ms: number }>(),
    c.env.BROWSER ? browserBudget(c.env) : null,
    cronInfo(c.env, db),
    db.prepare(`SELECT day, status, updated_at, reason FROM seed_batches
                WHERE status NOT IN ('done','failed') AND updated_at < ? ORDER BY updated_at ASC LIMIT 20`)
      .bind(Date.now() - 2 * 3_600_000).all<{ day: string; status: string; updated_at: number; reason: string | null }>(),
  ]);

  // All providers (both executors) with their executor label — the seed page shows
  // the full picture, not just the Worker queue that writes seed_runs.
  const ALL_PROVIDERS = PROVIDER_CONFIGS.map((p) => ({
    id: p.id,
    executor: p.executors.vps ? 'VPS' : p.executors.worker ? 'Worker' : 'poza',
    label: `${p.id}${p.executors.vps ? ' (VPS)' : ''}`,
  }));
  const WORKER_PROVIDER_LABELS = ALL_PROVIDERS.filter((p) => p.executor === 'Worker').map((p) => p.id).join(', ');
  const VPS_PROVIDER_LABELS = ALL_PROVIDERS.filter((p) => p.executor === 'VPS').map((p) => p.id).join(', ');

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

  const providerHealth = await db.prepare(`SELECT provider,
      COUNT(*) runs, COALESCE(SUM(candidates),0) candidates, COALESCE(SUM(ingested),0) ingested,
      COALESCE(SUM(errors),0) errors, COALESCE(AVG(duration_ms),0) avg_ms, COALESCE(SUM(browser_ms),0) browser_ms
    FROM seed_runs WHERE created_at>=? AND provider<>'total' GROUP BY provider ORDER BY ingested DESC`).bind(since).all<{ provider: string; runs: number; candidates: number; ingested: number; errors: number; avg_ms: number; browser_ms: number }>();
  const maxIngest = Math.max(1, ...(providerHealth.results ?? []).map((p) => p.ingested));

  let bSql = 'SELECT * FROM seed_batches WHERE created_at>=?';
  const bBinds: unknown[] = [since];
  if (dFrom) { bSql += ' AND day>=?'; bBinds.push(dFrom); }
  if (dTo) { bSql += ' AND day<=?'; bBinds.push(dTo); }
  if (bStatus) { bSql += ' AND status=?'; bBinds.push(bStatus); }
  bSql += ' ORDER BY created_at DESC LIMIT 60';
  const batches = (await db.prepare(bSql).bind(...bBinds).all<any>()).results ?? [];
  const byBatch = new Map<string, any[]>();
  const ids = batches.map((b) => b.id);
  const doneProviders = new Map<string, number>();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const [sc, ru, dp] = await Promise.all([
      db.prepare(`SELECT * FROM seed_scopes WHERE batch_id IN (${ph})`).bind(...ids).all<any>(),
      db.prepare(`SELECT * FROM seed_runs WHERE batch_id IN (${ph})`).bind(...ids).all<any>(),
      db.prepare(`SELECT batch_id, COUNT(DISTINCT provider) n FROM seed_scopes WHERE status='done' AND batch_id IN (${ph}) GROUP BY batch_id`).bind(...ids).all<{ batch_id: string; n: number }>(),
    ]);
    for (const r of (dp.results ?? [])) doneProviders.set(r.batch_id, r.n);
    for (const s of (sc.results ?? [])) { (byBatch.get(s.batch_id) ?? byBatch.set(s.batch_id, []).get(s.batch_id)!).push({ kind: 'scope', ...s }); }
    for (const r of (ru.results ?? [])) { (byBatch.get(r.batch_id) ?? byBatch.set(r.batch_id, []).get(r.batch_id)!).push({ kind: 'run', ...r }); }
  }

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

  // ---- Header + status strip ----
  const header = pageHeader({
    pretitle: 'Dashboard',
    title: 'Seed',
    actions: `<a class="btn btn-outline-secondary btn-sm" href="/admin/seed">${icon('refresh')} Odśwież</a>`,
  });
  const statusStrip = `<div class="alert alert-light d-flex align-items-center gap-3 flex-wrap mb-2">
    <span><strong>Cron:</strong> ${esc(cron.schedules.join(', '))} — ${esc(cron.summary)}</span>
    ${cron.nextRunMs ? `<span class="text-secondary">Następny: <strong>${fmtDate(cron.nextRunMs)}</strong></span>` : ''}
    ${cron.lastCronRunMs ? `<span class="text-secondary">Ostatni: ${fmtDate(cron.lastCronRunMs)}</span>` : '<span class="text-warning">Cron nie wystartował</span>'}
  </div>
  <div class="alert alert-important alert-dismissible mb-3">
    <div class="d-flex">
      <div>${icon('alert-triangle', 'icon me-2')}<strong>Jak to czytać?</strong> Każde uruchomienie tworzy jeden <strong>batch</strong> = pełny seed dnia; w batchu <strong>scopy</strong> przechodzą przez kolejkę i logują uruchomienia w <strong>seed_runs</strong>. Batche na tej stronie pokazują tylko pipeline <strong>Workera</strong>: ${esc(WORKER_PROVIDER_LABELS)}. Multikino, Cinemacity, Luma i Meetup działają na osobnym <strong>VPS-executorze</strong> (osobny proces, ingest przez seed-ingest) — nie tworzą batchy i nie logują seed_runs, dlatego nie ma ich w tych statystykach.</div>
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
  const chartRow = `<div class="row row-cards mb-3">
    <div class="col-12 col-lg-8">${card({ header: cardHeader({ title: 'Ingested / dzień' }), body: '<div id="pp-chart-ingest"></div>' })}</div>
    <div class="col-12 col-lg-4">${card({ header: cardHeader({ title: 'Batche / dzień' }), body: '<div id="pp-chart-batches"></div>' })}</div>
  </div>
  <div class="row row-cards mb-3">
    <div class="col-12 col-lg-6">${card({
      header: cardHeader({ title: 'Browser budget / dzień', actions: `<span class="text-secondary fs-5">limit ${budget ? fmtDur(budget.limitMs) : '—'}</span>` }),
      body: '<div id="pp-chart-budget"></div>',
    })}</div>
    <div class="col-12 col-lg-6">${card({
      class: 'h-100',
      header: cardHeader({ title: 'Zakleszczone batche' }),
      body: (stuck.results ?? []).length
        ? `<div class="list-group list-group-flush">${(stuck.results ?? []).map((s) => `
            <div class="list-group-item d-flex align-items-center justify-content-between">
              <span><strong>${esc(s.day)}</strong> ${batchStatusPill(s.status)} ${esc(fmtDate(s.updated_at))}</span>
              ${s.reason ? `<span class="text-danger fs-6" title="${esc(s.reason)}">${esc(String(s.reason).slice(0, 40))}</span>` : ''}
            </div>`).join('')}</div>`
        : `<div class="alert alert-success mb-0 d-flex align-items-center">${icon('check')} <span class="ms-2">Brak zakleszczonych batchy.</span></div>`,
    })}</div>
  </div>`;

  // ---- Filters ----
  const sel = (name: string, cur: string | null, opts: { value: string; label: string }[]) =>
    `<select name="${name}" class="form-select" onchange="this.form.submit()"><option value="" ${!cur ? 'selected' : ''}>Wszystkie</option>${opts.map((o) =>
      `<option value="${esc(o.value)}" ${cur === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  const filterBar = `<form method="get" action="/admin/seed" class="card mb-3"><div class="card-body">
    <div class="row g-2 align-items-end">
      <div class="col-6 col-md-2"><label class="form-label">Dzień od</label><input name="dfrom" type="date" class="form-control" value="${esc(dFrom || '')}" onchange="this.form.submit()" /></div>
      <div class="col-6 col-md-2"><label class="form-label">Dzień do</label><input name="dto" type="date" class="form-control" value="${esc(dTo || '')}" onchange="this.form.submit()" /></div>
      <div class="col-6 col-md-2"><label class="form-label">Status</label>${sel('bstatus', bStatus, ['', ...BATCH_STATUSES].map((s) => ({ value: s, label: s || 'Wszystkie' })))}</div>
      <div class="col-6 col-md-2"><label class="form-label">Provider</label>${sel('provider', provider, ALL_PROVIDERS.map((p) => ({ value: p.id, label: p.label })))}</div>
      <div class="col-6 col-md-2"><label class="form-label">Transport</label>${sel('transport', transport, TRANSPORTS.map((s) => ({ value: s, label: s })))}</div>
      <div class="col-6 col-md-2"><label class="form-label">Typ</label>${sel('rtype', runType, RUN_TYPES.map((s) => ({ value: s, label: s })))}</div>
      <div class="col-12 d-flex align-items-center gap-3">
        <label class="form-check"><input class="form-check-input" type="checkbox" name="errsonly" value="1" ${errsOnly ? 'checked' : ''} onchange="this.form.submit()"> Tylko błędy</label>
        <button class="btn btn-primary ms-auto" type="submit">Zastosuj</button>
        <a class="btn btn-outline-secondary" href="/admin/seed">Wyczyść filtry</a>
      </div>
    </div>
  </div></form>`;

  // ---- Provider health ----
  const healthByProvider = new Map((providerHealth.results ?? []).map((p) => [p.provider, p]));
  const provRows = ALL_PROVIDERS.map((p) => {
    const h = healthByProvider.get(p.id);
    const runs = h?.runs ?? 0;
    const errPct = runs ? Math.round(((h?.errors ?? 0) / runs) * 100) : 0;
    const vps = p.executor === 'VPS';
    return `<tr>
      <td class="font-monospace">${esc(p.id)}</td>
      <td>${p.executor === 'Worker' ? pill('worker', 'ok') : p.executor === 'VPS' ? pill('VPS', 'muted') : pill('poza', 'muted')}</td>
      <td>${runs}</td><td>${h?.candidates ?? 0}</td><td>${h?.ingested ?? 0}</td>
      <td class="${(h?.errors ?? 0) > 0 ? 'text-danger fw-bold' : ''}">${h?.errors ?? 0}</td>
      <td style="min-width:120px"><div class="progress progress-sm"><div class="progress-bar bg-danger" style="width:${Math.max(0.5, errPct)}%"></div></div></td>
      <td>${h ? fmtDur(h.avg_ms) : '—'}</td><td>${h ? fmtDur(h.browser_ms) : '—'}</td>
      <td>${vps && !runs ? '<span class="text-secondary fs-6">poza Workerem (seed-ingest)</span>' : `<div class="progress progress-sm" style="min-width:80px"><div class="progress-bar" style="width:${Math.round(((h?.ingested ?? 0) / maxIngest) * 100)}%"></div></div>`}</td>
    </tr>`;
  }).join('');
  const providerCard = card({
    class: 'mb-3',
    header: cardHeader({ title: 'Zdrowie providerów' }),
    body: `<div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Provider</th><th>Executor</th><th>Runs</th><th>Cand</th><th>Ingest</th><th>Err</th><th>Err%</th><th>Śr. czas</th><th>Browser</th><th>Rel. ingest</th></tr></thead>
      <tbody>${provRows || `<tr><td colspan="10" class="text-secondary">Brak providerów.</td></tr>`}</tbody></table></div>
      <div class="text-secondary fs-5 mt-2">Multikino, Cinemacity, Luma i Meetup działają na VPS-executorze (osobny proces, ingest przez seed-ingest) — nie logują do seed_runs, więc tutaj pokazują się z zerami.</div>`,
  });

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
    const provDone = doneProviders.get(b.id) ?? 0;
    const provTotal = b.providers_total ?? 0;
    return `<div class="list-group-item">
      <div class="row align-items-center">
        <div class="col-auto"><span class="status-dot ${b.status === 'done' ? 'status-green' : b.status === 'failed' ? 'status-red' : 'status-yellow'}"></span></div>
        <div class="col">
          <div class="fw-bold">${esc(b.day)}</div>
          <div class="text-secondary">${b.scopes_done}/${b.scopes_total} scopów · ${provDone}/${provTotal} providerów · aktualizacja ${fmtDate(b.updated_at)}${b.reason ? ` · <span class="text-danger" title="${esc(b.reason)}">${esc(String(b.reason).slice(0, 80))}</span>` : ''}</div>
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
  const batchCard = card({
    class: 'mb-3',
    header: cardHeader({ title: 'Batche (kolejki)' }),
    body: `<div class="list-group list-group-flush list-group-hoverable">${batchCards || `<div class="list-group-item text-secondary">Brak batchy w oknie.</div>`}</div>`,
  });

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
  const runsCard = card({
    class: 'mb-3',
    header: cardHeader({ title: 'Rundy (seed_runs)', actions: `<span class="badge bg-secondary-lt">${runTotal}</span>` }),
    body: `<div class="table-responsive"><table class="table table-vcenter card-table">
      <thead><tr><th>Czas</th><th>Dzień</th><th>Typ</th><th>Provider</th><th>Transport</th><th>Cand</th><th>Ingest</th><th>Skip</th><th>Err</th><th>Czas</th><th>Browser</th></tr></thead>
      <tbody>${runRowsHtml || `<tr><td colspan="11">${empty()}</td></tr>`}
      ${runRows.length ? `<tr class="table-light">
        <td colspan="6" class="fw-bold text-end">Suma (strona)</td>
        <td class="fw-bold">${sumIngest}</td><td class="fw-bold">${sumSkip}</td><td class="fw-bold ${sumErr ? 'text-danger' : ''}">${sumErr}</td><td colspan="2"></td></tr>` : ''}</tbody></table></div>`,
    footer: `<div class="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
      <span class="text-secondary">${runTotal} runów · strona ${page} / ${runPages}</span>
      ${pagination(page, runPages, runHref)}
    </div>`,
  });

  const body = `${header}${statusStrip}${statsRow}${chartRow}${filterBar}${providerCard}${batchCard}${runsCard}
  <script>window.SEED_CHARTS=${safeJson({
    ingest: ingestSeries.results ?? [],
    batches: { days: (batchSeries.results ?? []).map((b) => b.d), done: (batchSeries.results ?? []).map((b) => b.done), failed: (batchSeries.results ?? []).map((b) => b.failed), active },
    budget: { days: (budgetSeries.results ?? []).map((b) => b.d), ms: (budgetSeries.results ?? []).map((b) => b.ms), limitMs: budget?.limitMs ?? null },
  })};</script>`;

  return renderPage(c, 'Seed', '/admin/seed', body, { scripts: [APEXCHARTS_SRC, staticFilePath('seed')] });
});

export function registerSeed(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
