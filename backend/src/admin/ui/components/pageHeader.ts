import { esc } from '../../utils/esc';
import { tpl } from '../templates';

export interface PageHeaderProps {
  pretitle?: string;
  /** Raw HTML (may include badges/icons) — escape any data at the call site. */
  title: string;
  subtitle?: string;
  actions?: string;
  class?: string;
}

export function pageHeader(p: PageHeaderProps): string {
  return tpl('page-header', {
    class: p.class ?? 'mb-3',
    pretitle: p.pretitle ? esc(p.pretitle) : '',
    title: p.title,
    subtitle: p.subtitle ?? '',
    actions: p.actions ?? '',
  });
}
