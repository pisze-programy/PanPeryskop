// Stats page: day-series charts.

import { Hono } from 'hono';
import { bars, empty } from '../../ui';
import { daySeries } from '../../queries';
import { requireSession } from '../common';
import { renderPage } from './shared';

const pageRoutes = new Hono<{ Bindings: Env }>();

pageRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  const days = 14;
  const since = Date.now() - days * 86400000;
  const views = await daySeries(db, 'views', 'created_at', since);
  const media = await daySeries(db, 'posts', 'created_at', since);
  const logins = await daySeries(db, 'auth_events', 'created_at', since, " AND event='login'");
  const signups = await daySeries(db, 'auth_events', 'created_at', since, " AND event='register'");
  const likes = await daySeries(db, 'likes', 'created_at', since);
  const shares = await daySeries(db, 'shares', 'created_at', since);
  const toBars = (s: { d: string; n: number }[]) => bars(s.map((x) => ({ label: x.d.slice(5), value: x.n })));
  const block = (t: string, s: { d: string; n: number }[]) =>
    `<div class="card mb-3"><div class="card-header"><h3 class="card-title">${t}</h3></div><div class="card-body">${s.length ? toBars(s) : empty()}</div></div>`;
  const body = `<h2 class="mb-3">Statystyki · ${days} dni</h2>${block('Views', views)}${block('Media dodane', media)}${block('Logowania', logins)}${block('Rejestracje', signups)}${block('Like', likes)}${block('Share', shares)}`;
  return renderPage(c, 'Statystyki', '/admin/stats', body);
});

export function registerStats(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', pageRoutes);
}
