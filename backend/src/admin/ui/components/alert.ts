import { tpl } from '../templates';

export function alert(kind: string, content: string, class_ = 'd-flex align-items-center'): string {
  return tpl('alert', { kind, class: class_, content });
}
