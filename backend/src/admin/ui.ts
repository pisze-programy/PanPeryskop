// SSR admin dashboard UI using Tabler (CDN). Shared layout, navigation, helpers.
// https://github.com/tabler/tabler — MIT. No build step; CSS/JS from jsDelivr.
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

export const NAV = [
  { href: '/admin', label: 'Overview', icon: 'layout-dashboard' },
  { href: '/admin/events', label: 'Eventy', icon: 'calendar-event' },
  { href: '/admin/users', label: 'Użytkownicy', icon: 'users' },
  { href: '/admin/posts', label: 'Posty', icon: 'photo' },
  { href: '/admin/seed', label: 'Seed', icon: 'refresh' },
  { href: '/admin/stats', label: 'Statystyki', icon: 'chart-line' },
  { href: '/admin/errors', label: 'Błędy', icon: 'alert-triangle' },
  { href: '/admin/media-requests', label: 'Media Requests', icon: 'map-pin' },
];

export function layout(title: string, active: string, body: string): string {
  const nav = NAV.map((n) => {
    const cls = n.href === active ? 'active' : '';
    return `<li class="nav-item"><a class="nav-link ${cls}" href="${n.href}">
      <span class="nav-link-icon d-md-none d-lg-inline-block"><svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#icon-${esc(n.icon)}"></use></svg></span>
      <span class="nav-link-title">${esc(n.label)}</span></a></li>`;
  }).join('');
  return `<!doctype html><html lang="pl"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} · PanPeryskop Admin</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/core@1.4.0/dist/css/tabler.min.css">
<style>
body{background:var(--tblr-bg-surface-secondary)}
.page{margin:0 auto;max-width:1400px}
.tblr-body{min-height:100vh}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" id="tabler-icons">${ICONS}</svg>
<div class="tblr-body page">
<div class="row g-0" style="min-height:100vh">
  <aside class="col-12 col-lg-3 col-xl-2 border-end">
    <div class="p-3"><h1 class="h3 mb-0">PanPeryskop <span class="text-secondary">Admin</span></h1></div>
    <ul class="nav nav-pills nav-vertical flex-column">${nav}</ul>
    <div class="p-3"><a class="text-danger text-decoration-none" href="/admin/logout">Wyloguj</a></div>
  </aside>
  <main class="col-12 col-lg-9 col-xl-10 p-3 p-md-4">${body}</main>
</div></div>
<script src="https://cdn.jsdelivr.net/npm/@tabler/core@1.4.0/dist/js/tabler.min.js"></script>
</body></html>`;
}

export function page(title: string, active: string, body: string): Response {
  return new Response(layout(title, active, body), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export function cards(items: { label: string; value: string | number; color?: string }[]): string {
  return `<div class="row g-3 mb-3">${items.map((it) => `
    <div class="col-6 col-md-4 col-xl-3">
      <div class="card card-sm"><div class="card-body">
        <div class="text-secondary text-uppercase fw-bold" style="font-size:11px">${esc(it.label)}</div>
        <div class="h2 mb-0 ${it.color ? 'text-' + esc(it.color) : ''}">${esc(it.value)}</div>
      </div></div>
    </div>`).join('')}</div>`;
}

// Simple inline bar chart from { label, value } series (CSS widths).
export function bars(data: { label: string; value: number }[]): string {
  const max = Math.max(1, ...data.map((d) => d.value));
  return data.map((d) => {
    const w = max > 0 ? Math.max(0.5, (d.value / max) * 100) : 0;
    return `<div class="d-flex align-items-center mb-1" style="gap:8px">
      <span class="text-secondary" style="width:70px;flex-shrink:0">${esc(d.label)}</span>
      <div class="progress flex-grow-1" style="height:8px"><div class="progress-bar" style="width:${w}%"></div></div>
      <span class="text-muted" style="width:44px;text-align:right">${d.value}</span>
    </div>`;
  }).join('');
}

export function pill(text: string, kind: 'ok' | 'err' | 'muted' | 'warn'): string {
  const bg = kind === 'ok' ? 'bg-success-lt' : kind === 'err' ? 'bg-danger-lt' : kind === 'warn' ? 'bg-warning-lt' : 'bg-secondary-lt';
  const color = kind === 'ok' ? 'text-success' : kind === 'err' ? 'text-danger' : kind === 'warn' ? 'text-warning' : 'text-secondary';
  return `<span class="badge ${bg} ${color}">${esc(text)}</span>`;
}

export function empty(): string {
  return `<div class="alert alert-light text-secondary">Brak danych.</div>`;
}

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
`;
