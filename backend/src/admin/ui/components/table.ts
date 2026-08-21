import { esc } from '../../utils/esc';
import { tpl } from '../templates';

export function table(o: { class?: string; header?: string; head: string; rows: string; footer?: string }): string {
  return tpl('table', {
    class: o.class ?? 'mb-3',
    header: o.header ?? '',
    head: o.head,
    rows: o.rows,
    footer: o.footer ?? '',
  });
}

// Tabler numbered pagination. `href(p)` builds a page link.
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
  return tpl('pagination', { items: prev + items + next });
}

// Count + pagination status bar (rendered above/below tables).
export function pager(count: string, page: number, totalPages: number, href: (p: number) => string, class_ = 'mb-2'): string {
  return tpl('pager', { class: class_, count, pagination: pagination(page, totalPages, href) });
}
