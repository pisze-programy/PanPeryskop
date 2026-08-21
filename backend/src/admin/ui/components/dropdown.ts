import { tpl } from '../templates';

export function dropdown(o: { class?: string; title?: string; items: string }): string {
  return tpl('dropdown', { class: o.class ?? 'text-end', title: o.title ?? 'Akcje', items: o.items });
}

export function dropdownItem(o: { html: string; onclick?: string; cls?: string; href?: string }): string {
  const href = o.href ?? 'javascript:void(0)';
  const onclick = o.onclick ? ` onclick="${o.onclick}"` : '';
  return `<a class="dropdown-item ${o.cls ?? ''}" href="${href}"${onclick}>${o.html}</a>`;
}

export const dropdownDivider = '<div class="dropdown-divider"></div>';
