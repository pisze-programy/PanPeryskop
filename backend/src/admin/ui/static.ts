// Static file registry for the admin (served at /admin/static/:path). Files are
// embedded as TS string modules — no build step, works identically in dev/prod.
import { ADMIN_CSS } from './static/admin.css';
import { ADMIN_JS } from './static/admin.js';
import { OVERVIEW_JS } from './static/pages/overview.js';
import { EVENTS_JS } from './static/pages/events.js';
import { TAGS_JS } from './static/pages/tags.js';
import { USERS_JS } from './static/pages/users.js';
import { POSTS_JS } from './static/pages/posts.js';
import { SEED_JS } from './static/pages/seed.js';
import { STATS_JS } from './static/pages/stats.js';
import { MEDIA_REQUESTS_JS } from './static/pages/media-requests.js';
import { REPORTS_JS } from './static/pages/reports.js';
import { BLACKLIST_JS } from './static/pages/blacklist.js';

const JS = 'application/javascript; charset=utf-8';
const CSS = 'text/css; charset=utf-8';

const FILES: Record<string, { type: string; body: string }> = {
  'css/admin.css': { type: CSS, body: ADMIN_CSS },
  'js/admin.js': { type: JS, body: ADMIN_JS },
  'js/pages/overview.js': { type: JS, body: OVERVIEW_JS },
  'js/pages/events.js': { type: JS, body: EVENTS_JS },
  'js/pages/tags.js': { type: JS, body: TAGS_JS },
  'js/pages/users.js': { type: JS, body: USERS_JS },
  'js/pages/posts.js': { type: JS, body: POSTS_JS },
  'js/pages/seed.js': { type: JS, body: SEED_JS },
  'js/pages/stats.js': { type: JS, body: STATS_JS },
  'js/pages/media-requests.js': { type: JS, body: MEDIA_REQUESTS_JS },
  'js/pages/reports.js': { type: JS, body: REPORTS_JS },
  'js/pages/blacklist.js': { type: JS, body: BLACKLIST_JS },
};

// Shared asset paths — layout() injects these on every page.
export const ADMIN_CSS_PATH = '/admin/static/css/admin.css';
export const ADMIN_JS_PATH = '/admin/static/js/admin.js';

export function staticFilePath(page: string): string {
  return `/admin/static/js/pages/${page}.js`;
}

// Serve a file; null when unknown (→ 404).
export function serveStatic(path: string): Response | null {
  const f = FILES[path];
  if (!f) return null;
  return new Response(f.body, {
    headers: { 'content-type': f.type, 'cache-control': 'public, max-age=3600' },
  });
}
