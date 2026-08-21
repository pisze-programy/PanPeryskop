import { esc } from '../../utils/esc';
import { icon } from '../icons';
import { tpl } from '../templates';

export function filterLabel(text: string): string {
  return `<label class="form-label">${esc(text)}</label>`;
}

export function filterSelect(o: { label: string; name: string; options: string; span?: number }): string {
  return tpl('filter-select', { label: o.label, name: o.name, options: o.options, span: o.span ?? 3 });
}

export function segmented(o: { items: string; class?: string }): string {
  return tpl('segmented', { items: o.items, class: o.class ?? '' });
}

export function segmentedLink(label: string, href: string, active: boolean, extra = ''): string {
  return `<a class="btn btn-sm ${active ? 'active' : ''}" href="${href}">${label}${extra}</a>`;
}

export function inputIconSearch(o: { name: string; value: string; placeholder: string }): string {
  return `<div class="input-icon">
    <span class="input-icon-addon">${icon('search')}</span>
    <input type="search" name="${esc(o.name)}" class="form-control" value="${esc(o.value)}" placeholder="${esc(o.placeholder)}" />
  </div>`;
}
