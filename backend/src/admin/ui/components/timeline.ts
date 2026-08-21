import { tpl } from '../templates';

export function timeline(items: string): string {
  return tpl('timeline', { items });
}

export function timelineItem(o: { icon: string; label: string; value: string; hint?: string }): string {
  return tpl('timeline-item', {
    icon: o.icon,
    label: o.label,
    value: o.value,
    hint: o.hint ?? '',
  });
}
