// Shared SSR page helper: session gate + layout wrapper.
import { page, PageAssets } from '../../ui';
import { requireSession } from '../common';

async function renderPage(c: any, title: string, active: string, html: string, assets: PageAssets = {}) {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  return page(title, active, html, assets);
}

export { renderPage };
