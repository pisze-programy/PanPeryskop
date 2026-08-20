// Shared SSR page helper: session gate + layout wrapper.
import { page } from '../../ui';
import { requireSession } from '../common';

async function renderPage(c: any, title: string, active: string, html: string) {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  return page(title, active, html);
}

export { renderPage };
