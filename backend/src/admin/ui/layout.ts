// Admin shell: top navbar + content wrapper. Every page gets admin.css + admin.js
// (shared runtime) + a global toast container; page-specific assets come after.
import { ICON_SPRITE } from './icons';
import { tpl } from './templates';
import { ADMIN_CSS_PATH, ADMIN_JS_PATH } from './static';

export interface PageAssets {
  scripts?: string[];
  css?: string[];
}

// Tabler 1.4 vendors ApexCharts — load it from the same host/version as the CSS.
export const APEXCHARTS_SRC = 'https://cdn.jsdelivr.net/npm/@tabler/core@1.4.0/dist/libs/apexcharts/dist/apexcharts.min.js';

export const NAV = [
  { href: '/admin', label: 'Overview', icon: 'layout-dashboard' },
  { href: '/admin/events', label: 'Eventy', icon: 'calendar-event' },
  { href: '/admin/tags', label: 'Tagi', icon: 'tags' },
  { href: '/admin/users', label: 'Użytkownicy', icon: 'users' },
  { href: '/admin/posts', label: 'Posty', icon: 'photo' },
  { href: '/admin/seed', label: 'Seed', icon: 'refresh' },
  { href: '/admin/stats', label: 'Statystyki', icon: 'chart-line' },
  { href: '/admin/errors', label: 'Błędy', icon: 'alert-triangle' },
  { href: '/admin/media-requests', label: 'Media Requests', icon: 'map-pin' },
  { href: '/admin/reports', label: 'Raporty', icon: 'flag' },
];

export function layout(title: string, active: string, body: string, assets: PageAssets = {}): string {
  const nav = NAV.map((n) => {
    const cls = n.href === active ? 'active' : '';
    return `<li class="nav-item"><a class="nav-link ${cls}" href="${n.href}">
      <span class="nav-link-icon d-none-navbar-horizontal"><svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#icon-${n.icon}"></use></svg></span>
      <span class="nav-link-title">${n.label}</span></a></li>`;
  }).join('');
  const css = (assets.css ?? []).map((u) => `<link rel="stylesheet" href="${u}">`).join('');
  const scripts = (assets.scripts ?? []).map((u) => `<script src="${u}"></script>`).join('');
  const toastZone = tpl('toast-container', {});
  return `<!doctype html><html lang="pl"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · PanPeryskop Admin</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/core@1.4.0/dist/css/tabler.min.css">
<link rel="stylesheet" href="${ADMIN_CSS_PATH}">
${css}</head><body class="bg-surface-secondary">
<svg xmlns="http://www.w3.org/2000/svg" class="d-none" id="tabler-icons">${ICON_SPRITE}</svg>
<div class="page">
  <header class="navbar navbar-expand-md navbar-light d-print-none">
    <div class="container-xl">
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-menu" aria-label="Toggle navigation"><span class="navbar-toggler-icon"></span></button>
      <h1 class="navbar-brand navbar-brand-autodark d-none-navbar-horizontal pe-0 pe-md-3">PanPeryskop <span class="text-secondary">Admin</span></h1>
      <div class="collapse navbar-collapse" id="navbar-menu">
        <div class="d-flex flex-column flex-md-row flex-fill align-items-stretch align-items-md-center">
          <ul class="navbar-nav">${nav}</ul>
          <ul class="navbar-nav ms-auto">
            <li class="nav-item"><a class="nav-link text-danger" href="/admin/logout">Wyloguj</a></li>
          </ul>
        </div>
      </div>
    </div>
  </header>
  <div class="page-wrapper">
    <div class="container-xl py-3 py-md-4">${body}</div>
  </div>
</div>
${toastZone}
<script src="https://cdn.jsdelivr.net/npm/@tabler/core@1.4.0/dist/js/tabler.min.js"></script>
<script src="${ADMIN_JS_PATH}"></script>
${scripts}</body></html>`;
}

export function page(title: string, active: string, body: string, assets: PageAssets = {}): Response {
  return new Response(layout(title, active, body, assets), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
