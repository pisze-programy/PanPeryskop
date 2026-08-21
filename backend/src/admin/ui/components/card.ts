import { esc } from '../../utils/esc';
import { icon } from '../icons';
import { tpl } from '../templates';

export function cardHeader(o: { title: string; actions?: string }): string {
  return tpl('card-header', { title: o.title, actions: o.actions ?? '' });
}

export function card(o: { class?: string; header?: string; body?: string; footer?: string }): string {
  return tpl('card', {
    class: o.class ?? '',
    header: o.header ?? '',
    body: o.body ?? '',
    footer: o.footer ?? '',
  });
}

export interface StatCardItem {
  label: string;
  value: string | number;
  color?: string;
  href?: string;
  icon?: string;
  sub?: string;
}

// Simpler: build the card body directly without the template's fixed layout.
function statCardBody(it: StatCardItem): string {
  const valueCls = it.color ? `text-${it.color}` : '';
  const sub = it.sub ? `<div class="text-secondary fs-5">${it.sub}</div>` : '';
  const text = `<div class="text-secondary text-uppercase fw-bold fs-6">${esc(it.label)}</div>
    <div class="h2 mb-0 ${valueCls}">${esc(it.value)}</div>${sub}`;
  return it.icon
    ? `<div class="row align-items-center">
        <div class="col-auto"><span class="bg-primary-lt avatar">${icon(it.icon)}</span></div>
        <div class="col">${text}</div>
      </div>`
    : text;
}

export function statCard(it: StatCardItem): string {
  const inner = `<div class="card card-sm"><div class="card-body">${statCardBody(it)}</div></div>`;
  const cell = it.href ? `<a class="text-reset text-decoration-none" href="${esc(it.href)}">${inner}</a>` : inner;
  return `<div class="col-6 col-md-4 col-xl-3">${cell}</div>`;
}

export function cards(items: StatCardItem[]): string {
  return `<div class="row row-cards mb-3">${items.map(statCard).join('')}</div>`;
}
