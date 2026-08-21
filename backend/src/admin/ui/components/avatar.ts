import { esc } from '../../utils/esc';
import { colorFor, initials } from '../../utils/fmt';
import { tpl } from '../templates';

export function avatar(o: { class?: string; content: string }): string {
  return tpl('avatar', { class: o.class ?? '', content: o.content });
}

// Initials avatar with a deterministic color (when no image).
export function initialsAvatar(name: string | null | undefined, id: string, cls = 'avatar-sm'): string {
  return avatar({ class: `${cls} ${colorFor(id)}`, content: esc(initials(name)) });
}

// Thumbnail avatar with the standard onerror fallback.
export function thumbAvatar(url: string, cls = 'avatar-sm rounded', imgCls = ''): string {
  return `<span class="avatar ${cls}"><img src="${esc(url)}" alt="" loading="lazy"${imgCls ? ` class="${esc(imgCls)}"` : ''} onerror="this.closest('.avatar').classList.add('bg-secondary-lt')" /></span>`;
}
