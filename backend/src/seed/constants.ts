export const SEED_DEVICE_ID = 'panperyskop-seed';

// Provider base URLs + shared scraping limits. Single source of truth — provider
// modules import these instead of hardcoding origins in each file.
export const KUP_BASE = 'https://www.kupbilecik.pl';
export const KUP_LISTINGS = ['/koncerty/?q=', '/kabarety/?q=', '/standup/?q=', '/festiwal/?q='];
export const KUP_MAX_PAGES = 6;

export const DZIS_API = 'https://api.dzis.app/events';
export const DZIS_LIMIT = 1000;
export const DZIS_WEB = 'https://dzis.app/wydarzenie';

export const EVL_BASE = 'https://www.eventylive.pl';
export const EVL_LIST_BASE = `${EVL_BASE}/miasto`;
export const EVL_MAX_PAGES = 30;

export const GOING_BASE = 'https://goingapp.pl';
export const GOING_PLACE = (slug: string) => `https://api-empikbilety.prod.goingapp.eu/api/v1/place/${slug}`;

