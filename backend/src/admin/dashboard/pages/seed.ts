// Seed page: batches/scopes/runs with filters (cron-driven).

import { Hono } from 'hono';
import { cards, empty, esc, fmtDate, fmtDur, fmtPct, pill } from '../../ui';
import { browserBudget, cronInfo } from '../../queries';
import { requireSession } from '../common';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

// ---------- Seed ----------
const batchStatusPill = (s: string) =>
  s === 'done' ? pill('done', 'ok') :
  s === 'failed' ? pill('failed', 'err') :
  s === 'ingesting' ? pill('ingesting', 'warn') :
  s === 'fetching' ? pill('fetching', 'warn') :
  s === 'fetch_done' ? pill('fetch_done', 'warn') : pill(esc(s), 'muted');

const scopeStatusPill = (s: string) =>
  s === 'done' ? pill('done', 'ok') :
  s === 'failed' ? pill('failed', 'err') :
  s === 'running' ? pill('running', 'warn') : pill(esc(s), 'muted');

pageRoutes.get('/seed', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const dFrom = q.dfrom ? String(q.dfrom) : null;
  const dTo = q.dto ? String(q.dto) : null;
  const bStatus = q.bstatus ? String(q.bstatus) : null;
  const provider = q.provider ? String(q.provider) : null;
  const transport = q.transport ? String(q.transport) : null;
  const runType = q.rtype ? String(q.rtype) : null;
  const since = Date.now() - 30 * 86400000;

  let bSql = 'SELECT * FROM seed_batches WHERE created_at>=?';
  const bBinds: unknown[] = [since];
  if (dFrom) { bSql += ' AND day>=?'; bBinds.push(dFrom); }
  if (dTo) { bSql += ' AND day<=?'; bBinds.push(dTo); }
  if (bStatus) { bSql += ' AND status=?'; bBinds.push(bStatus); }
  bSql += ' ORDER BY created_at DESC LIMIT 60';
  const { results: batches } = await db.prepare(bSql).bind(...bBinds).all();

  let rSql = 'SELECT * FROM seed_runs WHERE created_at>=?';
  const rBinds: unknown[] = [since];
  if (provider) { rSql += ' AND provider=?'; rBinds.push(provider); }
  if (transport) { rSql += ' AND transport=?'; rBinds.push(transport); }
  if (runType) { rSql += ' AND run_type=?'; rBinds.push(runType); }
  rSql += ' ORDER BY created_at DESC LIMIT 500';
  const { results: runs } = await db.prepare(rSql).bind(...rBinds).all();

  // Fetch each batch's scopes + runs in two IN() queries, group in JS.
  const ids = (batches as any[]).map((b) => b.id);
  const byBatch = new Map<string, any[]>();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const [sc, ru] = await Promise.all([
      db.prepare(`SELECT * FROM seed_scopes WHERE batch_id IN (${ph})`).bind(...ids).all(),
      db.prepare(`SELECT * FROM seed_runs WHERE batch_id IN (${ph})`).bind(...ids).all(),
    ]);
    for (const s of (sc.results ?? []) as any[]) { (byBatch.get(s.batch_id) ?? byBatch.set(s.batch_id, []).get(s.batch_id)!).push({ kind: 'scope', ...s }); }
    for (const r of (ru.results ?? []) as any[]) { (byBatch.get(r.batch_id) ?? byBatch.set(r.batch_id, []).get(r.batch_id)!).push({ kind: 'run', ...r }); }
  }

  const [bCount, bDone, bFailed, errSum] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM seed_batches WHERE created_at>=?').bind(since).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM seed_batches WHERE created_at>=? AND status='done'").bind(since).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM seed_batches WHERE created_at>=? AND status='failed'").bind(since).first<{ n: number }>(),
    db.prepare('SELECT COALESCE(SUM(errors),0) n FROM seed_runs WHERE created_at>=?').bind(since).first<{ n: number }>(),
  ]);
  const budget = c.env.BROWSER ? await browserBudget(c.env) : null;
  const cron = await cronInfo(c.env, db);

  const batchCards = (batches as any[]).map((b) => {
    const items = byBatch.get(b.id) ?? [];
    const scopes = items.filter((x) => x.kind === 'scope');
    const rs = items.filter((x) => x.kind === 'run');
    const scopeRows = scopes.map((s) => `<tr>
      <td class="font-monospace">${esc(s.provider)}</td><td class="font-monospace">${esc(s.scope)}</td>
      <td>${scopeStatusPill(s.status)}</td><td>${s.attempts}</td>
      <td>${s.error ? `<span class="text-danger font-monospace" title="${esc(s.error)}">${esc((s.error as string).slice(0, 50))}</span>` : '—'}</td></tr>`).join('');
    const runRows = rs.map((r) => `<tr>
      <td>${fmtDate(r.created_at)}</td><td>${esc(r.provider)}</td><td>${esc(r.transport)}</td>
      <td>${r.candidates}</td><td>${r.ingested}</td><td>${r.skipped}</td>
      <td class="${r.errors ? 'text-danger fw-bold' : 'text-success'}">${r.errors}</td>
      <td>${fmtDur(r.duration_ms)}</td><td>${fmtDur(r.browser_ms)}</td></tr>`).join('');
    const scopesBlock = `<div class="text-secondary mb-1" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em">Scopy</div>
      <div class="table-responsive mb-3"><table class="table table-sm table-vcenter">
        <thead><tr><th>Provider</th><th>Scope</th><th>Status</th><th>Próby</th><th>Błąd</th></tr></thead>
        <tbody>${scopeRows || `<tr><td colspan="5" class="text-secondary">Brak scopów.</td></tr>`}</tbody></table></div>`;
    const runsBlock = `<div class="text-secondary mb-1" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em">Uruchomienia (seed_runs)</div>
      <div class="table-responsive"><table class="table table-sm table-vcenter">
        <thead><tr><th>Czas</th><th>Provider</th><th>Transport</th><th>Cand</th><th>Ingest</th><th>Skip</th><th>Err</th><th>Czas</th><th>Browser</th></tr></thead>
        <tbody>${runRows || `<tr><td colspan="9" class="text-secondary">Brak logów (batch sprzed linkowania runów).</td></tr>`}</tbody></table></div>`;
    return `<details class="card mb-2">
      <summary class="card-header py-2" style="cursor:pointer">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span class="fw-bold">${esc(b.day)}</span>
          ${b.run_type === 'cron' ? pill('cron', 'ok') : pill('manual', 'muted')}
          ${batchStatusPill(b.status)}
          <span class="text-secondary" style="font-size:12px">Scopy ${b.scopes_done}/${b.scopes_total} · Providerzy ${b.providers_done}/${b.providers_total}</span>
          <span class="text-secondary" style="font-size:12px">${fmtDate(b.updated_at)}</span>
          ${b.reason ? `<span class="text-danger" style="font-size:12px" title="${esc(b.reason)}">${esc((b.reason as string).slice(0, 40))}</span>` : ''}
        </div>
      </summary>
      <div class="card-body">${scopesBlock}${runsBlock}</div>
    </details>`;
  }).join('');

  const runRows = (runs as any[]).map((r) => `<tr>
    <td>${fmtDate(r.created_at)}</td><td>${esc(r.day)}</td>
    <td>${r.run_type === 'cron' ? pill('cron', 'ok') : pill('manual', 'muted')}</td>
    <td>${esc(r.provider)}</td><td>${esc(r.transport)}</td>
    <td>${r.candidates}</td><td>${r.ingested}</td><td>${r.skipped}</td>
    <td class="${r.errors ? 'text-danger fw-bold' : 'text-success'}">${r.errors}</td>
    <td>${fmtDur(r.duration_ms)}</td><td>${fmtDur(r.browser_ms)}</td>
    ${r.error_detail ? `<td class="font-monospace text-danger" title="${esc(r.error_detail)}">${esc(r.error_detail.slice(0, 30))}</td>` : '<td>—</td>'}</tr>`).join('');

  let budgetHtml = '';
  if (budget) {
    budgetHtml = `<div class="alert ${budget.exceeded ? 'alert-danger' : 'alert-success'} d-flex align-items-center" style="gap:12px">
      <span>Budget Browser Run (miesiąc): <strong>${fmtPct(budget.monthMs, budget.limitMs)}</strong> (${fmtDur(budget.monthMs)} / ${fmtDur(budget.limitMs)})</span>
      ${budget.exceeded ? '<strong>PRZEKROCZONY</strong>' : ''}</div>`;
  }
  const cronHtml = `<div class="alert alert-light d-flex align-items-center" style="gap:12px;flex-wrap:wrap">
    <span><strong>Cron:</strong> ${esc(cron.schedules.join(', '))} — ${esc(cron.summary)}</span>
    ${cron.nextRunMs ? `<span class="text-secondary">Następny: <strong>${fmtDate(cron.nextRunMs)}</strong></span>` : ''}
    ${cron.lastCronRunMs ? `<span class="text-secondary">Ostatni: ${fmtDate(cron.lastCronRunMs)}</span>` : '<span class="text-warning">Cron nie wystartował</span>'}</div>`;

  const providers = ['helios', 'multikino', 'cinemacity', 'going', 'kupbilecik', 'dzisapp', 'eventylive', 'luma', 'meetup'];
  const sel = (name: string, cur: string | null, opts: string[]) =>
    `<select name="${name}" class="form-select" onchange="this.form.submit()">${opts.map((o) =>
      `<option value="${o}" ${cur === o ? 'selected' : ''}>${o || 'Wszystkie'}</option>`).join('')}</select>`;
  const filterHtml = `<form method="get" action="/admin/seed" class="row g-2 mb-3">
    <div class="col-12"><span class="text-secondary text-uppercase fw-bold" style="font-size:11px">Filtry · Batche</span></div>
    <div class="col-6 col-md-2"><label class="form-label">Dzień od</label><input name="dfrom" type="date" class="form-control" value="${esc(dFrom || '')}" onchange="this.form.submit()" /></div>
    <div class="col-6 col-md-2"><label class="form-label">Dzień do</label><input name="dto" type="date" class="form-control" value="${esc(dTo || '')}" onchange="this.form.submit()" /></div>
    <div class="col-6 col-md-2"><label class="form-label">Status</label>${sel('bstatus', bStatus, ['', 'created', 'fetching', 'fetch_done', 'ingesting', 'done', 'failed'])}</div>
    <div class="col-12"><span class="text-secondary text-uppercase fw-bold" style="font-size:11px">Filtry · Rundy (seed_runs)</span></div>
    <div class="col-6 col-md-2"><label class="form-label">Provider</label>${sel('provider', provider, ['', ...providers])}</div>
    <div class="col-6 col-md-2"><label class="form-label">Transport</label>${sel('transport', transport, ['', 'fetch', 'browser', 'mixed'])}</div>
    <div class="col-6 col-md-2"><label class="form-label">Typ</label>${sel('rtype', runType, ['', 'cron', 'manual'])}</div>
    <div class="col-12 d-flex align-items-end"><a class="btn btn-outline-secondary" href="/admin/seed">Wyczyść filtry</a></div>
  </form>`;

  const body = `<h2 class="mb-3">Seed</h2>
  <div class="alert alert-light mb-3" style="font-size:13px">
    <strong>Jak to czytać?</strong> Seed działa automatycznie (cron, bez przycisków w panelu). Każde uruchomienie tworzy jeden
    <strong>batch</strong> = pełny seed jednego dnia. W batchu <strong>scopy</strong> (jednostki fetch per provider + sekcja)
    przechodzą przez kolejkę; każdy scope loguje uruchomienie w <strong>seed_runs</strong>; pobrane eventy
    (seed_candidates) są deduplikowane i ingestowane. Rozwiń batch, żeby zobaczyć jego scopy i logi.
  </div>
  ${cronHtml}${budgetHtml}
  ${cards([
    { label: 'Batche (30 dni)', value: bCount?.n ?? 0 },
    { label: 'Zakończone', value: bDone?.n ?? 0, color: 'success' },
    { label: 'Failed', value: bFailed?.n ?? 0, color: (bFailed?.n ?? 0) ? 'danger' : '' },
    { label: 'Błędy (runs 30d)', value: errSum?.n ?? 0, color: (errSum?.n ?? 0) ? 'danger' : '' },
  ])}
  ${filterHtml}
  <div class="mb-3"><h3 class="h4">Batche (kolejki)</h3>${batchCards || `<div class="alert alert-light text-secondary">Brak batchy w oknie.</div>`}</div>
  <div class="mb-3"><h3 class="h4">Rundy (seed_runs)</h3>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Czas</th><th>Dzień</th><th>Typ</th><th>Provider</th><th>Transport</th><th>Cand</th><th>Ingest</th><th>Skip</th><th>Err</th><th>Czas</th><th>Browser</th><th>Błąd</th></tr></thead>
    <tbody>${runRows || `<tr><td colspan="12">${empty()}</td></tr>`}</tbody></table></div></div></div>`;
  return renderPage(c, 'Seed', '/admin/seed', body);
});

export function registerSeed(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
