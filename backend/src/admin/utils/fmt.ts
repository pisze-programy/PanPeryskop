// Date/number formatting + identity helpers shared across admin pages.

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

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// Short pl weekday label for a YYYY-MM-DD string.
export function plDay(d: string): string {
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(new Date(`${d}T12:00:00+02:00`));
}

// Deterministic avatar background from a hash of the id (Tabler has no auto colors).
export function colorFor(s: string): string {
  const palette = ['bg-primary-lt', 'bg-success-lt', 'bg-warning-lt', 'bg-danger-lt', 'bg-azure-lt', 'bg-purple-lt', 'bg-pink-lt', 'bg-teal-lt'];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function initials(name: string | null | undefined): string {
  const n = (name || '').trim();
  if (!n) return '?';
  return n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
