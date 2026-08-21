// SSR admin dashboard UI using Tabler (CDN). Shared layout, navigation, helpers.
// https://github.com/tabler/tabler — MIT. No build step; CSS/JS from jsDelivr.
// Design follows Tabler: no custom styles unless Tabler offers none.
export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

export function fmtDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
export function fmtDur(ms: number): string {
  if (!ms) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}
export function fmtPct(usedMs: number, limitMs: number): string {
  if (!limitMs) return '—';
  return `${((usedMs / limitMs) * 100).toFixed(1)}%`;
}

// Relative time ("przed chwilą / 3 h temu / 2 d. temu"), else the UTC date.
export function relAgo(ms: number | null | undefined): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'przed chwilą';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min temu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h temu`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days} d. temu`;
  return fmtDate(ms);
}

// JSON embedded in an inline <script> — escape `<` so hostile strings can never
// break out of the script block.
export function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

// Tabler stroke icon wrapper (feather-compatible, from the local sprite).
export function icon(name: string, cls = 'icon'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#icon-${esc(name)}"></use></svg>`;
}

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

// Tabler 1.4 vendors ApexCharts — load it from the same host/version as the CSS.
const APEXCHARTS_SRC = 'https://cdn.jsdelivr.net/npm/@tabler/core@1.4.0/dist/libs/apexcharts/dist/apexcharts.min.js';

export interface PageAssets {
  scripts?: string[];
  css?: string[];
}

// Tabler horizontal layout: top navbar + content wrapper (no sidebar).
export function layout(title: string, active: string, body: string, assets: PageAssets = {}): string {
  const nav = NAV.map((n) => {
    const cls = n.href === active ? 'active' : '';
    return `<li class="nav-item"><a class="nav-link ${cls}" href="${n.href}">
      <span class="nav-link-icon d-none-navbar-horizontal"><svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#icon-${esc(n.icon)}"></use></svg></span>
      <span class="nav-link-title">${esc(n.label)}</span></a></li>`;
  }).join('');
  const css = (assets.css ?? []).map((u) => `<link rel="stylesheet" href="${esc(u)}">`).join('');
  const scripts = (assets.scripts ?? []).map((u) => `<script src="${esc(u)}"></script>`).join('');
  return `<!doctype html><html lang="pl"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} · PanPeryskop Admin</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/core@1.4.0/dist/css/tabler.min.css">
${css}</head><body class="bg-surface-secondary">
<svg xmlns="http://www.w3.org/2000/svg" class="d-none" id="tabler-icons">${ICONS}</svg>
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
<script src="https://cdn.jsdelivr.net/npm/@tabler/core@1.4.0/dist/js/tabler.min.js"></script>
${scripts}</body></html>`;
}

export function page(title: string, active: string, body: string, assets: PageAssets = {}): Response {
  return new Response(layout(title, active, body, assets), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// Stat cards row — Tabler "icon avatar + number + sublabel" pattern. Optional
// `href` wraps the card in a link (Tabler demo does this for dashboard KPIs).
export function cards(items: { label: string; value: string | number; color?: string; href?: string; icon?: string; sub?: string }[]): string {
  return `<div class="row row-cards mb-3">${items.map((it) => {
    const value = `<div class="h2 mb-0 ${it.color ? 'text-' + esc(it.color) : ''}">${esc(it.value)}</div>`;
    const body = it.icon
      ? `<div class="row align-items-center">
          <div class="col-auto"><span class="bg-primary-lt avatar">${icon(it.icon)}</span></div>
          <div class="col">
            <div class="text-secondary text-uppercase fw-bold fs-6">${esc(it.label)}</div>
            ${value}${it.sub ? `<div class="text-secondary fs-5">${it.sub}</div>` : ''}
          </div>
        </div>`
      : `<div class="text-secondary text-uppercase fw-bold fs-6">${esc(it.label)}</div>${value}${it.sub ? `<div class="text-secondary fs-5">${it.sub}</div>` : ''}`;
    const inner = `<div class="card card-sm"><div class="card-body">${body}</div></div>`;
    return `<div class="col-6 col-md-4 col-xl-3">${it.href ? `<a class="text-reset text-decoration-none" href="${esc(it.href)}">${inner}</a>` : inner}</div>`;
  }).join('')}</div>`;
}

// Simple inline bar chart from { label, value } series (CSS widths).
export function bars(data: { label: string; value: number }[]): string {
  const max = Math.max(1, ...data.map((d) => d.value));
  return data.map((d) => {
    const w = max > 0 ? Math.max(0.5, (d.value / max) * 100) : 0;
    return `<div class="d-flex align-items-center mb-2 gap-2">
      <span class="text-secondary">${esc(d.label)}</span>
      <div class="progress flex-grow-1 progress-sm"><div class="progress-bar" style="width:${w}%"></div></div>
      <span class="text-muted text-end">${d.value}</span>
    </div>`;
  }).join('');
}

export function pill(text: string, kind: 'ok' | 'err' | 'muted' | 'warn'): string {
  const bg = kind === 'ok' ? 'bg-success-lt' : kind === 'err' ? 'bg-danger-lt' : kind === 'warn' ? 'bg-warning-lt' : 'bg-secondary-lt';
  const color = kind === 'ok' ? 'text-success' : kind === 'err' ? 'text-danger' : kind === 'warn' ? 'text-warning' : 'text-secondary';
  return `<span class="badge ${bg} ${color}">${esc(text)}</span>`;
}

export function empty(): string {
  return `<div class="empty"><p class="empty-title text-secondary">Brak danych.</p></div>`;
}

// Tabler numbered pagination. `href(p)` builds a page link (already escaped).
export function pagination(page: number, totalPages: number, href: (p: number) => string): string {
  if (totalPages <= 1) return '';
  const prev = `<li class="page-item ${page <= 1 ? 'disabled' : ''}"><a class="page-link" href="${page > 1 ? esc(href(page - 1)) : '#'}" tabindex="-1">‹</a></li>`;
  const next = `<li class="page-item ${page >= totalPages ? 'disabled' : ''}"><a class="page-link" href="${page < totalPages ? esc(href(page + 1)) : '#'}">›</a></li>`;
  let items = '';
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 9 && p > 2 && p < totalPages - 1 && Math.abs(p - page) > 1) {
      if (p === 3 || p === totalPages - 2) items += '<li class="page-item disabled"><span class="page-link">…</span></li>';
      continue;
    }
    items += `<li class="page-item ${p === page ? 'active' : ''}"><a class="page-link" href="${esc(href(p))}">${p}</a></li>`;
  }
  return `<nav><ul class="pagination pagination-sm mb-0">${prev}${items}${next}</ul></nav>`;
}

// Fixed toast zone + a small global toast factory (Tabler/Bootstrap 5, auto-hide).
export function toastContainer(): string {
  return `<div class="toast-container position-fixed bottom-0 end-0 p-3" id="ppToastWrap" style="z-index:1055"></div>`;
}
export function toastScript(): string {
  return `<script>
  window.ppToast = function (msg, kind) {
    var wrap = document.getElementById('ppToastWrap');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast align-items-center text-bg-' + (kind === 'danger' ? 'danger' : 'success') + ' border-0';
    el.innerHTML = '<div class="d-flex"><div class="toast-body">' + msg + '</div>' +
      '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
    wrap.appendChild(el);
    var B = window.tabler || window.bootstrap;
    var t = B && B.Toast ? B.Toast.getOrCreateInstance(el) : null;
    if (t) t.show();
    setTimeout(function () { if (t) t.hide(); }, 3500);
  };
  </script>`;
}

export { APEXCHARTS_SRC };

// Tabler icon sprite subset (feather-compatible stroke icons).
const ICONS = `
<symbol id="icon-layout-dashboard" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></symbol>
<symbol id="icon-calendar-event" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="4" y1="11" x2="20" y2="11"/><rect x="8" y="15" width="4" height="4" rx="1"/></symbol>
<symbol id="icon-users" viewBox="0 0 24 24"><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M17 8a4 4 0 1 1 0 8"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></symbol>
<symbol id="icon-photo" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5L5 21"/></symbol>
<symbol id="icon-refresh" viewBox="0 0 24 24"><path d="M20 11A8 8 0 0 0 4.6 7.2"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 15.4 3.8"/><path d="M20 20v-4h-4"/></symbol>
<symbol id="icon-chart-line" viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15l4-6 4 3 5-8"/></symbol>
<symbol id="icon-alert-triangle" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></symbol>
<symbol id="icon-map-pin" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></symbol>
<symbol id="icon-tags" viewBox="0 0 24 24"><path d="M3 7v4a1 1 0 0 0 .3.7l9 9a1 1 0 0 0 1.4 0l4-4a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-.7-.3H4a1 1 0 0 0-1 1z"/><circle cx="7.5" cy="7.5" r="1.5"/></symbol>
<symbol id="icon-flag" viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 4h14l-2 4l2 4H5"/></symbol>
<symbol id="icon-shield-check" viewBox="0 0 24 24"><path d="M12 3l8 3v5c0 5-3.5 8-8 10c-4.5-2-8-5-8-10V6z"/><path d="M9 12l2 2l4-4"/></symbol>
<symbol id="icon-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></symbol>
<symbol id="icon-more-horizontal" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></symbol>
<symbol id="icon-ban" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></symbol>
<symbol id="icon-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></symbol>
<symbol id="icon-x" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></symbol>
<symbol id="icon-lock" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></symbol>
<symbol id="icon-external-link" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></symbol>
<symbol id="icon-heart" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></symbol>
<symbol id="icon-eye" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></symbol>
<symbol id="icon-share" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></symbol>
<symbol id="icon-download" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></symbol>
<symbol id="icon-chevron-down" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></symbol>
<symbol id="icon-chevron-up" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></symbol>
<symbol id="icon-chevron-right" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></symbol>
<symbol id="icon-chart-bar" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></symbol>
<symbol id="icon-plus" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></symbol>
<symbol id="icon-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></symbol>
<symbol id="icon-trending-up" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></symbol>
<symbol id="icon-trending-down" viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></symbol>
`;
