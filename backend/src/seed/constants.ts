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

// Multikino (multikino.pl) — Sitecore JSS backed by a JSON microservice. Plain
// fetch works once an anonymous session token is obtained (see multikino.ts).
export const MK_BASE = 'https://www.multikino.pl';
export const MK_API = `${MK_BASE}/api/microservice`;
export const MK_AUTH = `${MK_API}/auth/token`;
export const MK_EMBARGO = 1;

// All 38 Multikino cinemas (verified 2026-08-16). `citySlug` is the CITIES id for
// the 18 cinemas in app cities (null for the rest). scopes = all 38 when
// MK_ALL_CINEMAS is true, else only the 18 in app cities — no CITIES coupling.
export interface MkCinema {
  id: string;      // zero-padded 4-char cinemaId (e.g. "0013")
  name: string;    // cinemaName (e.g. "Warszawa Złote Tarasy")
  city: string;    // display city (e.g. "Warszawa")
  citySlug: string | null; // CITIES id when the city is in the app
  slug: string;    // whatsOnUrl city slug (e.g. "warszawa-zlote-tarasy")
}
export const MK_CINEMAS: MkCinema[] = [
  { id: '0006', name: 'Bydgoszcz', city: 'Bydgoszcz', citySlug: 'bydgoszcz', slug: 'bydgoszcz' },
  { id: '0033', name: 'Czechowice-Dziedzice', city: 'Czechowice-Dziedzice', citySlug: null, slug: 'czechowice-dziedzice' },
  { id: '0037', name: 'Elbląg Ogrody', city: 'Elbląg', citySlug: null, slug: 'elblag-ogrody' },
  { id: '0004', name: 'Gdańsk', city: 'Gdańsk', citySlug: 'gdansk', slug: 'gdansk' },
  { id: '0048', name: 'Głogów', city: 'Głogów', citySlug: null, slug: 'glogow' },
  { id: '0047', name: 'Gorzów Wielkopolski', city: 'Gorzów Wielkopolski', citySlug: null, slug: 'gorzow-wielkopolski' },
  { id: '0038', name: 'Jaworzno', city: 'Jaworzno', citySlug: null, slug: 'jaworzno' },
  { id: '0042', name: 'Kalisz', city: 'Kalisz', citySlug: null, slug: 'kalisz' },
  { id: '0035', name: 'Katowice', city: 'Katowice', citySlug: 'katowice', slug: 'katowice' },
  { id: '0029', name: 'Kielce', city: 'Kielce', citySlug: 'kielce', slug: 'kielce' },
  { id: '0041', name: 'Kłodzko', city: 'Kłodzko', citySlug: null, slug: 'klodzko' },
  { id: '0015', name: 'Koszalin', city: 'Koszalin', citySlug: 'koszalin', slug: 'koszalin' },
  { id: '0005', name: 'Kraków', city: 'Kraków', citySlug: 'krakow', slug: 'krakow' },
  { id: '0044', name: 'Leszno', city: 'Leszno', citySlug: null, slug: 'leszno' },
  { id: '0034', name: 'Lublin', city: 'Lublin', citySlug: 'lublin', slug: 'lublin' },
  { id: '0023', name: 'Łódź', city: 'Łódź', citySlug: 'lodz', slug: 'lodz' },
  { id: '0051', name: 'Mielec', city: 'Mielec', citySlug: null, slug: 'mielec' },
  { id: '0036', name: 'Olsztyn', city: 'Olsztyn', citySlug: 'olsztyn', slug: 'olsztyn' },
  { id: '0011', name: 'Poznań Stary Browar', city: 'Poznań', citySlug: 'poznan', slug: 'poznan-stary-browar' },
  { id: '0039', name: 'Pruszków', city: 'Pruszków', citySlug: null, slug: 'pruszkow' },
  { id: '0026', name: 'Radom', city: 'Radom', citySlug: null, slug: 'radom' },
  { id: '0027', name: 'Rumia', city: 'Rumia', citySlug: null, slug: 'rumia' },
  { id: '0014', name: 'Rybnik', city: 'Rybnik', citySlug: null, slug: 'rybnik' },
  { id: '0028', name: 'Rzeszów', city: 'Rzeszów', citySlug: 'rzeszow', slug: 'rzeszow' },
  { id: '0030', name: 'Słupsk', city: 'Słupsk', citySlug: null, slug: 'slupsk' },
  { id: '0007', name: 'Szczecin', city: 'Szczecin', citySlug: 'szczecin', slug: 'szczecin' },
  { id: '0043', name: 'Świdnica', city: 'Świdnica', citySlug: null, slug: 'swidnica' },
  { id: '0050', name: 'Tarnów', city: 'Tarnów', citySlug: null, slug: 'tarnow' },
  { id: '0053', name: 'Tychy Gemini Park', city: 'Tychy', citySlug: null, slug: 'tychy-gemini-park' },
  { id: '0052', name: 'Warszawa G City Reduta', city: 'Warszawa', citySlug: 'warszawa', slug: 'warszawa-g-city-reduta' },
  { id: '0024', name: 'Warszawa G City Targówek', city: 'Warszawa', citySlug: 'warszawa', slug: 'warszawa-g-city-targowek' },
  { id: '0040', name: 'Warszawa Młociny', city: 'Warszawa', citySlug: 'warszawa', slug: 'warszawa-mlociny' },
  { id: '0025', name: 'Warszawa Wola Park', city: 'Warszawa', citySlug: 'warszawa', slug: 'warszawa-wola-park' },
  { id: '0013', name: 'Warszawa Złote Tarasy', city: 'Warszawa', citySlug: 'warszawa', slug: 'warszawa-zlote-tarasy' },
  { id: '0008', name: 'Włocławek', city: 'Włocławek', citySlug: null, slug: 'wloclawek' },
  { id: '0010', name: 'Wrocław Pasaż Grunwaldzki', city: 'Wrocław', citySlug: 'wroclaw', slug: 'wroclaw-pasaz-grunwaldzki' },
  { id: '0003', name: 'Zabrze', city: 'Zabrze', citySlug: null, slug: 'zabrze' },
  { id: '0031', name: 'Zgorzelec', city: 'Zgorzelec', citySlug: null, slug: 'zgorzelec' },
];

// Include ALL 38 cinemas (also outside app cities). When false, scopes are the
// 18 cinemas whose city is in CITIES (citySlug !== null). Flip later to cover
// everything — geo comes from the SSR page either way.
export const MK_ALL_CINEMAS = false;

// Cinema scopes: which cinemas produce queue fetch messages.
export function mkScopes(): string[] {
  const list = MK_ALL_CINEMAS ? MK_CINEMAS : MK_CINEMAS.filter((c) => c.citySlug);
  return list.map((c) => c.id);
}

// Thumbnail resizing on Sitecore media URLs (mw/mh keep aspect via fit).
export const MK_THUMB_QUERY = '&mw=240&mh=350';

