// Overview page: summary cards, events window, cron + last seed.

import { Hono } from 'hono';
import { cards, esc, fmtDate, fmtDur, fmtPct, pill } from '../../ui';
import { browserBudget, cronInfo } from '../../queries';
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

pageRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  const dayStart = now - 86400000;
  const today = todayWarsaw();
  const windowEnd = addDaysWarsaw(today, SEED_DAYS_AHEAD);
  const [users, posts, evToday, viewsToday, likes, shares, errs, mediaReq, lastSeed, cron, budget, windowRows] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts WHERE category=? AND event_date=?').bind('events', today).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM views WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM likes').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM shares').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM media_requests').first<{ n: number }>(),
    db.prepare('SELECT * FROM seed_batches ORDER BY created_at DESC LIMIT 1').first<Record<string, unknown>>(),
    cronInfo(c.env, db),
    c.env.BROWSER ? await browserBudget(c.env) : null,
    db.prepare(`SELECT event_date, status, COUNT(*) n FROM posts
                WHERE category='events' AND event_date BETWEEN ? AND ? GROUP BY event_date, status`)
      .bind(today, windowEnd).all<{ event_date: string; status: string; n: number }>(),
  ]);
  const ccards = cards([
    { label: 'Użytkownicy', value: users?.n ?? 0 },
    { label: 'Posty', value: posts?.n ?? 0 },
    { label: 'Eventy dziś', value: evToday?.n ?? 0, color: 'success' },
    { label: 'Views dziś', value: viewsToday?.n ?? 0 },
    { label: 'Like', value: likes?.n ?? 0 },
    { label: 'Share', value: shares?.n ?? 0, color: 'primary' },
    { label: 'Błędy dziś', value: errs?.n ?? 0, color: (errs?.n ?? 0) > 0 ? 'danger' : '' },
    { label: 'Media Requests', value: mediaReq?.n ?? 0 },
  ]);

  // Events window card: today..today+SEED_DAYS_AHEAD, per-day Approved/Pending/Rejected.
  const perDay = new Map<string, { approved: number; pending: number; rejected: number }>();
  for (const r of windowRows?.results || []) {
    const d = perDay.get(r.event_date) ?? { approved: 0, pending: 0, rejected: 0 };
    if (r.status === 'approved') d.approved += r.n;
    else if (r.status === 'pending') d.pending += r.n;
    else if (r.status === 'rejected') d.rejected += r.n;
    perDay.set(r.event_date, d);
  }
  const sums = { approved: 0, pending: 0, rejected: 0 };
  const windowRowsHtml = Array.from({ length: SEED_DAYS_AHEAD + 1 }, (_, i) => {
    const day = addDaysWarsaw(today, i);
    const d = perDay.get(day) ?? { approved: 0, pending: 0, rejected: 0 };
    sums.approved += d.approved; sums.pending += d.pending; sums.rejected += d.rejected;
    const total = d.approved + d.pending + d.rejected;
    return `<tr>
      <td class="fw-bold">${esc(dayLabel(day))}<span class="text-muted fw-normal"> · ${esc(day)}</span></td>
      <td>${total}</td>
      <td class="text-success">${d.approved}</td>
      <td class="text-warning">${d.pending}</td>
      <td class="text-danger">${d.rejected}</td></tr>`;
  }).join('');
  const windowHtml = `<div class="card mb-3"><div class="card-header"><h3 class="card-title">Eventy — okno (${SEED_DAYS_AHEAD + 1} dni)</h3></div>
    <div class="table-responsive"><table class="table table-vcenter card-table mb-0">
      <thead><tr><th>Dzień</th><th>Wszystkie</th><th class="text-success">Approved</th><th class="text-warning">Pending</th><th class="text-danger">Rejected</th></tr></thead>
      <tbody>${windowRowsHtml}<tr class="table-light">
        <td class="fw-bold">Suma</td><td>${sums.approved + sums.pending + sums.rejected}</td>
        <td class="text-success">${sums.approved}</td><td class="text-warning">${sums.pending}</td><td class="text-danger">${sums.rejected}</td></tr>
      </tbody></table></div></div>`;

  // Cron card
  let cronHtml = `<div class="card mb-3"><div class="card-header"><h3 class="card-title">Cron (planowanie)</h3></div><div class="card-body">`;
  cronHtml += `<p class="mb-1"><strong>Harmonogram:</strong> ${esc(cron.schedules.join(', '))}</p>
    <p class="mb-1 text-secondary">${esc(cron.summary)}</p>`;
  cronHtml += cron.nextRunMs
    ? `<p class="mb-1"><strong>Następny run:</strong> ${fmtDate(cron.nextRunMs)}</p>`
    : `<p class="mb-1 text-warning">Brak zaplanowanego crona.</p>`;
  cronHtml += cron.lastCronRunMs
    ? `<p class="mb-0"><strong>Ostatni cron:</strong> ${fmtDate(cron.lastCronRunMs)} ${pill('OK', 'ok')}</p>`
    : `<p class="mb-0"><strong>Ostatni cron:</strong> <span class="text-warning">jeszcze nie wystartował</span></p>`;
  cronHtml += `</div></div>`;

  // Last seed card — the most recent batch (queue pipeline's run unit) plus the
  // aggregate of its scope runs (the legacy seed_runs provider='total' row was
  // never written by the queue path, so the old card was dead).
  let seedHtml = `<div class="card mb-3"><div class="card-header"><h3 class="card-title">Ostatni seed</h3></div><div class="card-body">`;
  const batch = lastSeed as any;
  if (batch) {
    const agg = await db.prepare(
      `SELECT COALESCE(SUM(candidates),0) cands, COALESCE(SUM(ingested),0) ingested,
              COALESCE(SUM(errors),0) errors, COALESCE(SUM(duration_ms),0) dur, COALESCE(SUM(browser_ms),0) browser
       FROM seed_runs WHERE batch_id=?`
    ).bind(batch.id).first<{ cands: number; ingested: number; errors: number; dur: number; browser: number }>();
    const st = (s: string) =>
      s === 'done' ? pill('done', 'ok') :
      s === 'failed' ? pill('failed', 'err') :
      s === 'ingesting' ? pill('ingesting', 'warn') :
      s === 'fetching' ? pill('fetching', 'warn') : pill(esc(s), 'muted');
    seedHtml += `<div class="row g-3">
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Dzień</div><div class="fw-bold">${esc(batch.day)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Typ</div><div>${esc(batch.run_type)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Status</div><div>${st(batch.status)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Scope</div><div class="fw-bold">${batch.scopes_done}/${batch.scopes_total}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Ingest</div><div class="fw-bold">${agg?.ingested ?? 0}/${agg?.cands ?? 0}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Błędy</div><div class="${(agg?.errors ?? 0) ? 'text-danger' : 'text-success'}">${agg?.errors ?? 0}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Czas</div><div>${fmtDur(agg?.dur ?? 0)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Browser</div><div>${fmtDur(agg?.browser ?? 0)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Aktualizacja</div><div>${fmtDate(batch.updated_at)}</div></div>
      ${batch.reason ? `<div class="col-12"><div class="text-danger" style="font-size:12px">Powód: ${esc(batch.reason)}</div></div>` : ''}
    </div>`;
  } else seedHtml += '<p class="text-secondary mb-0">Brak uruchomień seeda.</p>';
  if (budget) {
    seedHtml += `<div class="mt-3 d-flex align-items-center" style="gap:10px">
      <span class="text-secondary">Budget Browser Run</span>
      <div class="progress flex-grow-1" style="height:8px"><div class="progress-bar ${budget.exceeded ? 'bg-danger' : 'bg-primary'}" style="width:${Math.min(100, fmtPctNum(budget.monthMs, budget.limitMs))}%"></div></div>
      <span class="${budget.exceeded ? 'text-danger fw-bold' : ''}">${fmtPct(budget.monthMs, budget.limitMs)} (${fmtDur(budget.monthMs)} / ${fmtDur(budget.limitMs)})</span>
    </div>`;
  }
  seedHtml += `</div></div>`;

  const body = `<h2 class="mb-3">Overview</h2>${ccards}${windowHtml}${cronHtml}${seedHtml}
  <div class="d-flex gap-2"><a class="btn btn-outline-secondary" href="/admin/stats">Statystyki</a><a class="btn btn-outline-secondary" href="/admin/seed">Logi seed</a></div>`;
  return renderPage(c, 'Overview', '/admin', body);
});

export function registerOverview(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
