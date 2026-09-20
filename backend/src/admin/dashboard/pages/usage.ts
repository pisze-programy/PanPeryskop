import { CONFIG } from '../../../config/index';
// Usage page: anonymous totals only — link clicks by kind, top targets, daily
// clicks. No per-user data exists, so nothing here can identify a person.

import { Hono } from 'hono';
import { bars, card, cardHeader, cards, esc, pageHeader } from '../../ui';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

const KIND_LABELS: Record<string, string> = {
  flight: 'Lot',
  bus: 'Bus',
  place: 'Atrakcja',
  event: 'Wydarzenie',
  stay: 'Nocleg',
};

pageRoutes.get('/usage', async (c) => {
  const db = c.env.DB;
  const days = 30;
  const since = Date.now() - days * CONFIG.time.dayMs;

  const [total, last24, byKind, topHosts, byDay] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM click_events').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM click_events WHERE created_at >= ?').bind(Date.now() - CONFIG.time.dayMs).first<{ n: number }>(),
    db.prepare('SELECT kind, COUNT(*) n FROM click_events WHERE created_at >= ? GROUP BY kind ORDER BY n DESC').bind(since).all<{ kind: string; n: number }>(),
    db.prepare('SELECT target_host, COUNT(*) n FROM click_events WHERE created_at >= ? GROUP BY target_host ORDER BY n DESC LIMIT 15').bind(since).all<{ target_host: string; n: number }>(),
    db.prepare(`SELECT date(created_at/1000,'unixepoch','+2 hours') d, COUNT(*) n
                FROM click_events WHERE created_at >= ? GROUP BY d ORDER BY d`).bind(since).all<{ d: string; n: number }>(),
  ]);

  const statRow = cards([
    { label: 'Kliknięcia · razem', value: total?.n ?? 0, icon: 'cursor-text' },
    { label: 'Kliknięcia · 24 h', value: last24?.n ?? 0, icon: 'clock' },
    { label: `Kliknięcia · ${days} dni`, value: (byKind.results ?? []).reduce((s, r) => s + r.n, 0), icon: 'chart-line' },
  ]);

  const kindCard = card({
    header: cardHeader({ title: 'Kliknięcia wg typu' }),
    body: bars((byKind.results ?? []).map((r) => ({ label: KIND_LABELS[r.kind] ?? r.kind, value: r.n }))) || '<div class="text-secondary">Brak danych.</div>',
  });

  const hostRows = (topHosts.results ?? []).map((h) =>
    `<tr><td>${esc(h.target_host)}</td><td class="text-end">${h.n}</td></tr>`
  ).join('');
  const hostCard = card({
    header: cardHeader({ title: 'Najczęstsze cele' }),
    body: hostRows
      ? `<div class="table-responsive"><table class="table table-sm table-vcenter"><thead><tr><th>Host</th><th class="text-end">Kliknięcia</th></tr></thead><tbody>${hostRows}</tbody></table></div>`
      : '<div class="text-secondary">Brak danych.</div>',
  });

  const dayCard = card({
    header: cardHeader({ title: `Kliknięcia dziennie · ${days} dni` }),
    body: bars((byDay.results ?? []).map((r) => ({ label: r.d, value: r.n }))) || '<div class="text-secondary">Brak danych.</div>',
  });

  const html = `
    ${pageHeader({ pretitle: 'Analityka', title: 'Użycie', subtitle: 'Anonimowe sumy — bez identyfikacji użytkownika.' })}
    ${statRow}
    <div class="row row-cards">
      <div class="col-md-6">${kindCard}</div>
      <div class="col-md-6">${dayCard}</div>
      <div class="col-12">${hostCard}</div>
    </div>`;
  return renderPage(c, 'Użycie', 'usage', html);
});

export function registerUsage(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
