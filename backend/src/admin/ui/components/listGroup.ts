import { tpl } from '../templates';

export function listGroup(items: string, class_ = 'list-group-flush'): string {
  return tpl('list-group', { class: class_, items });
}
