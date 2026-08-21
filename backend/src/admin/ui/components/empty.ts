import { tpl } from '../templates';

export function empty(o?: { icon?: string; title?: string; subtitle?: string; action?: string }): string {
  return tpl('empty', {
    icon: o?.icon ?? '',
    title: o?.title ?? 'Brak danych.',
    subtitle: o?.subtitle ?? '',
    action: o?.action ?? '',
  });
}
