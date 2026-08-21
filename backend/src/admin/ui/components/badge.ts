import { esc } from '../../utils/esc';
import { tpl } from '../templates';

export function pill(text: string, kind: 'ok' | 'err' | 'muted' | 'warn'): string {
  const bg = kind === 'ok' ? 'bg-success-lt' : kind === 'err' ? 'bg-danger-lt' : kind === 'warn' ? 'bg-warning-lt' : 'bg-secondary-lt';
  const color = kind === 'ok' ? 'text-success' : kind === 'err' ? 'text-danger' : kind === 'warn' ? 'text-warning' : 'text-secondary';
  return `<span class="badge ${bg} ${color}">${esc(text)}</span>`;
}

export function badge(text: string, cls: string): string {
  return tpl('badge', { class: cls, text: esc(text) });
}
