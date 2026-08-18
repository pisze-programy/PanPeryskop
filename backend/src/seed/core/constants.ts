export const SEED_DEVICE_ID = 'panperyskop-seed';

// ---------- Time units ----------
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
// Event posts become visible at 06:00 Europe/Warsaw of their day (TTL window start).
export const EVENT_VISIBLE_OFFSET_MS = 6 * HOUR_MS;

// ---------- Seed window ----------
// The app browses [today, today+SEED_DAYS_AHEAD]. EVERY provider (Worker and VPS)
// re-seeds this window daily — idempotent by external_id, so late-published
// events for today/+1/+2 still land. Single source of truth for the window.
export const SEED_DAYS_AHEAD = 3;

// ---------- provider fetch timeouts ----------
// Generous on purpose: the VPS fetches through the phone's cellular exit node,
// where a tight (10-20s) timeout drops valid responses and yields 0 candidates.
export const PROVIDER_FETCH_TIMEOUT_MS = 60_000;

// ---------- Queue pipeline limits ----------
// Cloudflare Queues sendBatch caps at 100 messages per call.
export const QUEUE_SEND_BATCH_CAP = 100;
// D1 batch() caps at 100 statements — keep chunks well under it.
export const D1_BATCH_STATEMENT_CAP = 90;
// Backoff applied when a message is retried (per-message msg.retry + config retry_delay).
export const QUEUE_RETRY_DELAY_SECONDS = 30;
// Per-invocation message concurrency cap (respects the 6-connection limit + D1 writes).
export const QUEUE_CONSUMER_CONCURRENCY = 6;

// ---------- Provider base URLs + scraping limits ----------
export const KUP_BASE = 'https://www.kupbilecik.pl';
export const KUP_LISTINGS = ['/koncerty/?q=', '/kabarety/?q=', '/standup/?q=', '/festiwal/?q='];
export const KUP_MAX_PAGES = 6;

export const DZIS_API = 'https://api.dzis.app/events';
export const DZIS_LIMIT = 1000;
// Event page URL is plural /wydarzenia/<slug> (singular /wydarzenie/ 404s).
export const DZIS_WEB = 'https://dzis.app/wydarzenia';

export const EVL_BASE = 'https://www.eventylive.pl';
export const EVL_LIST_BASE = `${EVL_BASE}/miasto`;
export const EVL_MAX_PAGES = 30;

export const GOING_BASE = 'https://goingapp.pl';
export const GOING_ALGOLIA_ORIGIN = 'https://goingapp.pl';
export const GOING_PLACE = (slug: string) => `https://api-empikbilety.prod.goingapp.eu/api/v1/place/${slug}`;
export const GOING_POSTER = (path: string, sig: string) =>
  `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,h_810,w_1080/f_jpg/q_auto:eco/v1/${path}?_a=${sig}`;
export const GOING_THUMB = (path: string, sig: string) =>
  `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,w_320,h_320/f_jpg/q_auto:eco/v1/${path}?_a=${sig}`;

export const MK_BASE = 'https://www.multikino.pl';
export const MK_API = `${MK_BASE}/api/microservice`;
export const MK_AUTH = `${MK_API}/auth/token`;
export const MK_EMBARGO = 1;
// Fallback anonymous-token cache TTL when the JWT has no usable `exp` claim.
export const MK_TOKEN_TTL_MS = 12 * HOUR_MS;

export interface MkCinema {
  id: string;
  name: string;
  city: string;
  citySlug: string | null;
  slug: string;
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

// ---------- cinema-city.pl ----------
export const CC_TENANT = '10103';
export const CC_BASE = `https://www.cinema-city.pl/pl/data-api-service/v1/quickbook/${CC_TENANT}`;
export const CC_SITE = 'https://www.cinema-city.pl/';
export const CC_FILM_EVENTS = (cinemaId: string, day: string) => `${CC_BASE}/film-events/in-cinema/${cinemaId}/at-date/${day}`;
export const CC_FILM_URL = (filmId: string) => `${CC_SITE}filmy/${filmId}`;
export const CC_TIMEOUT_MS = PROVIDER_FETCH_TIMEOUT_MS;

export interface CcCinema {
  code: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  address: string;
}
// Static cinema catalog (parsed once from the site's apiSitesList blob). Scope
// list for the queue; geo/venue for candidates. Mirrors MK_CINEMAS.
export const CC_CINEMAS: CcCinema[] = [
  { code: '1100', name: 'Biała Podlaska', city: 'Biała Podlaska', lat: 52.03441, lng: 23.12303, address: 'ul. Brzeska 27, 21-500' },
  { code: '1088', name: 'Bielsko-Biała', city: 'Bielsko-Biała', lat: 49.8026, lng: 19.051352, address: 'ul. Leszczyńska 20, 43-300' },
  { code: '1086', name: 'Bydgoszcz', city: 'Bydgoszcz', lat: 53.125305, lng: 18.01894, address: 'ul. Jagiellońska 39-47, 85-097' },
  { code: '1092', name: 'Bytom', city: 'Bytom', lat: 50.347607, lng: 18.918924, address: 'pl. T. Kościuszki 1, 41-902' },
  { code: '1098', name: 'Cieszyn', city: 'Cieszyn', lat: 49.749653, lng: 18.637823, address: 'ul. Wojciecha Korfantego 23, 43-400' },
  { code: '1089', name: 'Częstochowa - Galeria Jurajska', city: 'Częstochowa', lat: 50.80704, lng: 19.132248, address: 'al. Wojska Polskiego 207, 42-200' },
  { code: '1075', name: 'Częstochowa - Wolność', city: 'Częstochowa', lat: 50.813187, lng: 19.117859, address: 'al. Kościuszki 5, 42-200' },
  { code: '1099', name: 'Elbląg', city: 'Elbląg', lat: 54.16652, lng: 19.4023, address: 'ul. Teatralna 5, 82-300' },
  { code: '1085', name: 'Gliwice', city: 'Gliwice', lat: 50.300583, lng: 18.681223, address: 'ul. Lipowa 1, 44-100' },
  { code: '1065', name: 'Katowice - Punkt 44', city: 'Katowice', lat: 50.26252, lng: 19.00602, address: 'ul. Gliwicka 44, 40-853' },
  { code: '1079', name: 'Katowice - Silesia', city: 'Katowice', lat: 50.270752, lng: 19.002821, address: 'ul. Chorzowska 107, 40-101' },
  { code: '1090', name: 'Kraków - Bonarka', city: 'Kraków', lat: 50.02694, lng: 19.94972, address: 'ul. Kamieńskiego 11, 30-644' },
  { code: '1076', name: 'Kraków - Galeria Kazimierz', city: 'Kraków', lat: 50.05303, lng: 19.956566, address: 'ul. Podgórska 34, 31-536' },
  { code: '1064', name: 'Kraków - Zakopianka', city: 'Kraków', lat: 50.01654, lng: 19.930508, address: 'ul. Zakopiańska 62, 30-418' },
  { code: '1094', name: 'Lublin - Felicity', city: 'Lublin', lat: 51.231422, lng: 22.613071, address: 'Al. Wincentego Witosa 32, 20-315' },
  { code: '1084', name: 'Lublin - Plaza', city: 'Lublin', lat: 51.245033, lng: 22.550875, address: 'ul. Lipowa 13, 20-020' },
  { code: '1080', name: 'Łódź Manufaktura', city: 'Łódź', lat: 51.780827, lng: 19.448492, address: 'ul. Drewnowska 58, 91-002' },
  { code: '1081', name: 'Poznań - Kinepolis', city: 'Poznań', lat: 52.373806, lng: 16.980959, address: 'ul. Bolesława Krzywoustego 72, 61-144' },
  { code: '1078', name: 'Poznań - Plaza', city: 'Poznań', lat: 52.44197, lng: 16.918924, address: 'ul. K. Drużbickiego 2, 61-693' },
  { code: '1062', name: 'Ruda Śląska', city: 'Ruda Śląska', lat: 50.275566, lng: 18.866491, address: 'ul. 1 Maja 310, 41-710' },
  { code: '1082', name: 'Rybnik', city: 'Rybnik', lat: 50.096584, lng: 18.53775, address: 'ul. Raciborska 16, 44-200' },
  { code: '1083', name: 'Sosnowiec', city: 'Sosnowiec', lat: 50.275215, lng: 19.126959, address: 'ul. Sienkiewicza 2, 41-200' },
  { code: '1095', name: 'Starogard Gdański', city: 'Starogard Gdański', lat: 53.964165, lng: 18.529493, address: 'ul. Pomorska 7, 83-200' },
  { code: '1077', name: 'Toruń - Czerwona Droga', city: 'Toruń', lat: 53.01551, lng: 18.600689, address: 'ul. Czerwona Droga 1-6, 87-100' },
  { code: '1093', name: 'Toruń - Plaza', city: 'Toruń', lat: 53.015995, lng: 18.561178, address: 'ul. Broniewskiego 90, 87-100' },
  { code: '1091', name: 'Wałbrzych', city: 'Wałbrzych', lat: 50.767063, lng: 16.265245, address: 'ul. 1 Maja 64, 58-300' },
  { code: '1074', name: 'Warszawa - Arkadia', city: 'Warszawa', lat: 52.257217, lng: 20.984465, address: 'al. Jana Pawła II 82, 00-175' },
  { code: '1061', name: 'Warszawa - Bemowo', city: 'Warszawa', lat: 52.26571, lng: 20.932743, address: 'ul. Powstańców Śląskich 126a, 01-466' },
  { code: '1096', name: 'Warszawa - Białołęka Galeria Północna', city: 'Warszawa', lat: 52.318344, lng: 20.964226, address: 'ul. Światowida 17, 03-144' },
  { code: '1069', name: 'Warszawa - Janki', city: 'Janki', lat: 52.135708, lng: 20.892134, address: 'ul. Mszczonowska 3, 05-090' },
  { code: '1070', name: 'Warszawa - Mokotów', city: 'Warszawa', lat: 52.17884, lng: 21.00342, address: 'ul. Wołoska 12, 02-675' },
  { code: '1068', name: 'Warszawa - Promenada', city: 'Warszawa', lat: 52.2316, lng: 21.106195, address: 'ul. Ostrobramska 75c, 04-175' },
  { code: '1060', name: 'Warszawa - Sadyba', city: 'Warszawa', lat: 52.187485, lng: 21.061102, address: 'ul. Powsińska 31, 02-903' },
  { code: '1067', name: 'Wrocław - Korona', city: 'Wrocław', lat: 51.142323, lng: 17.08925, address: 'ul. Krzywoustego 126 C, 51-421' },
  { code: '1097', name: 'Wrocław - Wroclavia', city: 'Wrocław', lat: 51.096714, lng: 17.034151, address: 'Sucha 1, 50-086' },
  { code: '1087', name: 'Zielona Góra', city: 'Zielona Góra', lat: 51.936207, lng: 15.511678, address: 'ul. Wrocławska 17, 65-427' },
];
export function ccScopes(): string[] {
  return CC_CINEMAS.map((c) => c.code);
}

// ---------- helios.pl ----------
export const HELIOS_BASE = 'https://www.helios.pl';
export const HELIOS_API = 'https://api.helios.pl/api/v1';
export const HELIOS_CINEMAS_URL = `${HELIOS_API}/cinemas`;
export const HELIOS_SCREENINGS = (cinemaId: number) => `${HELIOS_API}/cinemas/${cinemaId}/screenings`;
export const HELIOS_FILM = (cinema: HeliosCinema, filmSlug: string, filmId: number) =>
  `${HELIOS_BASE}/${cinema.citySlug}/${cinema.slug}/filmy/${filmSlug}-${filmId}`;
export const HELIOS_TIMEOUT_MS = 20_000;

// ---------- VPS executor (residential-egress seed runtime) ----------
// Tunable knobs for the VPS "sposób wykonania" — see executors/vps/index.ts.
export const VPS_IPV4_PROXY_HOST = '127.0.0.1';
export const VPS_IPV4_PROXY_PORT = 1057;
export const VPS_WINDOW_START_HOUR = 5; // Europe/Warsaw — outside this window a kick is a no-op
export const VPS_WINDOW_END_HOUR = 22;
export const VPS_EXIT_IPHONE = 'iphone-14-pro-max'; // primary residential exit node
export const VPS_EXIT_MAC = 'macos'; // fallback exit node
export const VPS_MAX_ATTEMPTS = 3;
export const VPS_BACKOFF_MS = [0, 300_000, 600_000]; // after attempt 1 and 2
export const VPS_EXIT_PROBE_TIMEOUT_MS = 20_000;
export const VPS_EXIT_SWITCH_WAIT_MS = 2_000;

// ---------- luma.com ----------
export const LUMA_API = 'https://api.luma.com/discover';
export const LUMA_EVENT_WEB = 'https://lu.ma';
export const LUMA_LIMIT = 50; // server caps the page size at 50
// Warsaw is the only launched PL "place"; other cities are fetched by bbox.
export const LUMA_PLACE_WARSAW = 'discplace-PTcuEQVHuySJe8N';
// Bbox radius (degrees) around each non-Warsaw city center (±0.3° ≈ 33 km,
// covers the metro area incl. suburbs like Sopot for Gdańsk).
export const LUMA_BBOX_RADIUS = 0.3;

// ---------- meetup.com ----------
export const MEETUP_GQL = 'https://www.meetup.com/gql2';
export const MEETUP_RADIUS = 40; // km — city + surroundings; pins show by coords
export const MEETUP_FIRST = 200; // page size for the custom recommendedEvents query

export interface HeliosCinema {
  id: number;
  name: string;
  city: string;
  citySlug: string;
  slug: string;
  lat: number;
  lng: number;
  address: string;
}
// Static cinema catalog (parsed once from api.helios.pl/api/v1/cinemas; citySlug
// verified against the site's home-page scope URLs). Mirrors MK_CINEMAS.
export const HELIOS_CINEMAS: HeliosCinema[] = [
  { id: 6, name: 'Bełchatów Helios', city: 'Bełchatów', citySlug: 'belchatow', slug: 'kino-helios', lat: 51.35339, lng: 19.376086, address: 'ul. Kolejowa 6' },
  { id: 43, name: 'Białystok Helios Jurowiecka', city: 'Białystok', citySlug: 'bialystok', slug: 'kino-helios-jurowiecka', lat: 53.136558, lng: 23.162576, address: 'ul. Jurowiecka 1' },
  { id: 37, name: 'Białystok Helios Alfa', city: 'Białystok', citySlug: 'bialystok', slug: 'kino-helios-alfa', lat: 53.125749, lng: 23.169145, address: 'ul. Świętojańska 15' },
  { id: 10, name: 'Białystok Helios Biała', city: 'Białystok', citySlug: 'bialystok', slug: 'kino-helios-biala', lat: 53.122457, lng: 23.177418, address: 'ul. Czesława Miłosza 2' },
  { id: 36, name: 'Bielsko-Biała Helios', city: 'Bielsko-Biała', citySlug: 'bielsko-biala', slug: 'kino-helios', lat: 49.827349, lng: 19.049722, address: 'ul. Mostowa 5' },
  { id: 9, name: 'Bydgoszcz Helios', city: 'Bydgoszcz', citySlug: 'bydgoszcz', slug: 'kino-helios', lat: 53.125868, lng: 18.067264, address: 'ul. Fordońska 141' },
  { id: 24, name: 'Dąbrowa Górnicza Helios', city: 'Dąbrowa Górnicza', citySlug: 'dabrowa-gornicza', slug: 'kino-helios', lat: 50.327165, lng: 19.183798, address: 'ul. Jana III Sobieskiego 6' },
  { id: 18, name: 'Gdańsk Helios Metropolia', city: 'Gdańsk', citySlug: 'gdansk', slug: 'kino-helios-metropolia', lat: 54.383003, lng: 18.605256, address: 'ul. Kilińskiego 4' },
  { id: 13, name: 'Gdańsk Helios Forum', city: 'Gdańsk', citySlug: 'gdansk', slug: 'kino-helios-forum', lat: 54.349381, lng: 18.643519, address: 'Targ Sienny 7' },
  { id: 23, name: 'Gdynia Helios', city: 'Gdynia', citySlug: 'gdynia', slug: 'kino-helios', lat: 54.504902, lng: 18.532143, address: 'ul. Kazimierza Górskiego 2' },
  { id: 42, name: 'Gniezno Helios', city: 'Gniezno', citySlug: 'gniezno', slug: 'kino-helios', lat: 52.560964, lng: 17.612513, address: 'ul. Pałucka 2' },
  { id: 46, name: 'Gorzów Wielkopolski Helios', city: 'Gorzów Wielkopolski', citySlug: 'gorzow-wielkopolski', slug: 'kino-helios', lat: 52.73114, lng: 15.224744, address: 'al. Konstytucji 3-go Maja 102' },
  { id: 19, name: 'Grudziądz Helios', city: 'Grudziądz', citySlug: 'grudziadz', slug: 'kino-helios', lat: 53.484428, lng: 18.747582, address: 'ul. Chełmińska 4' },
  { id: 16, name: 'Jelenia Góra Helios', city: 'Jelenia Góra', citySlug: 'jelenia-gora', slug: 'kino-helios', lat: 50.922308, lng: 15.763399, address: 'al. Jana Pawła II 51' },
  { id: 29, name: 'Kalisz Helios', city: 'Kalisz', citySlug: 'kalisz', slug: 'kino-helios', lat: 51.744527, lng: 18.070502, address: 'ul. Górnośląska 82' },
  { id: 2, name: 'Katowice Helios', city: 'Katowice', citySlug: 'katowice', slug: 'kino-helios', lat: 50.223904, lng: 18.987786, address: 'ul. Kościuszki 229' },
  { id: 48, name: 'Kędzierzyn-Koźle Helios', city: 'Kędzierzyn-Koźle', citySlug: 'kedzierzyn-kozle', slug: 'kino-helios', lat: 50.342219, lng: 18.191086, address: 'Al. Armii Krajowej 38' },
  { id: 40, name: 'Kielce Helios', city: 'Kielce', citySlug: 'kielce', slug: 'kino-helios', lat: 50.880437, lng: 20.647754, address: 'ul. Świętokrzyska 20' },
  { id: 31, name: 'Konin Helios', city: 'Konin', citySlug: 'konin', slug: 'kino-helios', lat: 52.23848, lng: 18.259979, address: 'ul. Paderewskiego 8' },
  { id: 54, name: 'Koszalin Helios', city: 'Koszalin', citySlug: 'koszalin', slug: 'kino-helios-galeria-emka', lat: 54.207717, lng: 16.185954, address: 'ul. Jana Pawła II 20' },
  { id: 34, name: 'Krosno Helios', city: 'Krosno', citySlug: 'krosno', slug: 'kino-helios', lat: 49.677475, lng: 21.776047, address: 'ul. Bieszczadzka 29' },
  { id: 15, name: 'Legionowo Helios', city: 'Legionowo', citySlug: 'legionowo', slug: 'kino-helios', lat: 52.396568, lng: 20.932827, address: 'Józefa Piłsudskiego 31C' },
  { id: 5, name: 'Legnica Helios', city: 'Legnica', citySlug: 'legnica', slug: 'kino-helios', lat: 51.210865, lng: 16.163681, address: 'ul. Najświętszej Marii Panny 9' },
  { id: 27, name: 'Lubin Helios', city: 'Lubin', citySlug: 'lubin', slug: 'kino-helios', lat: 51.394022, lng: 16.205798, address: 'ul. Generała Władysława Sikorskiego 20' },
  { id: 7, name: 'Łódź Helios', city: 'Łódź', citySlug: 'lodz', slug: 'kino-helios', lat: 51.749311, lng: 19.448353, address: 'Al. Politechniki 1' },
  { id: 53, name: 'Łomża Helios', city: 'Łomża', citySlug: 'lomza', slug: 'kino-helios', lat: 53.172971, lng: 22.066986, address: 'al. Legionów 46' },
  { id: 3, name: 'Nowy Sącz Helios', city: 'Nowy Sącz', citySlug: 'nowy-sacz', slug: 'kino-helios', lat: 49.624136, lng: 20.706627, address: 'ul. Lwowska 80' },
  { id: 33, name: 'Olsztyn Helios', city: 'Olsztyn', citySlug: 'olsztyn', slug: 'kino-helios', lat: 53.777262, lng: 20.483205, address: 'Al. Piłsudskiego 16' },
  { id: 1, name: 'Opole Helios Solaris', city: 'Opole', citySlug: 'opole', slug: 'kino-helios-solaris', lat: 50.670482, lng: 17.926158, address: 'Pl. Kopernika 17' },
  { id: 51, name: 'Opole Helios Karolinka', city: 'Opole', citySlug: 'opole', slug: 'kino-helios-karolinka', lat: 50.681788, lng: 17.884332, address: 'ul. Wrocławska 152/154' },
  { id: 52, name: 'Ostrów Wielkopolski Helios', city: 'Ostrów Wielkopolski', citySlug: 'ostrow-wielkopolski', slug: 'kino-helios', lat: 51.659615, lng: 17.84865, address: 'ul. Kaliska 120' },
  { id: 39, name: 'Pabianice Helios', city: 'Pabianice', citySlug: 'pabianice', slug: 'kino-helios', lat: 51.660829, lng: 19.358537, address: 'ul. Grobelna 8' },
  { id: 44, name: 'Piła Helios', city: 'Piła', citySlug: 'pila', slug: 'kino-helios', lat: 53.158757, lng: 16.75688, address: 'al. Powstańców Wlkp. 99' },
  { id: 28, name: 'Piotrków Trybunalski Helios', city: 'Piotrków Trybunalski', citySlug: 'piotrkow-trybunalski', slug: 'kino-helios', lat: 51.41121, lng: 19.667236, address: 'ul. Słowackiego 123' },
  { id: 22, name: 'Płock Helios', city: 'Płock', citySlug: 'plock', slug: 'kino-helios', lat: 52.534998, lng: 19.75708, address: 'ul. Wyszogrodzka 144' },
  { id: 25, name: 'Poznań Helios', city: 'Poznań', citySlug: 'poznan', slug: 'kino-helios', lat: 52.397362, lng: 16.956183, address: 'ul. Pleszewska 1' },
  { id: 17, name: 'Przemyśl Helios', city: 'Przemyśl', citySlug: 'przemysl', slug: 'kino-helios', lat: 49.790658, lng: 22.781051, address: 'ul. Wojciecha Brudzewskiego 1' },
  { id: 11, name: 'Radom Helios', city: 'Radom', citySlug: 'radom', slug: 'kino-helios', lat: 51.390611, lng: 21.151959, address: 'ul. Poniatowskiego 5' },
  { id: 49, name: 'Rzeszów Galeria Rzeszów', city: 'Rzeszów', citySlug: 'rzeszow', slug: 'kino-helios-galeria', lat: 50.041957, lng: 21.998118, address: 'Al. Piłsudskiego 44' },
  { id: 32, name: 'Siedlce Helios', city: 'Siedlce', citySlug: 'siedlce', slug: 'kino-helios', lat: 52.16792, lng: 22.269607, address: 'ul. Piłsudskiego 74' },
  { id: 21, name: 'Sosnowiec Helios', city: 'Sosnowiec', citySlug: 'sosnowiec', slug: 'kino-helios', lat: 50.275576, lng: 19.131947, address: 'ul. Modrzejowska 32b' },
  { id: 12, name: 'Stalowa Wola Helios', city: 'Stalowa Wola', citySlug: 'stalowa-wola', slug: 'kino-helios', lat: 50.58448, lng: 22.064197, address: 'ul. Chopina 42' },
  { id: 4, name: 'Starachowice Helios', city: 'Starachowice', citySlug: 'starachowice', slug: 'kino-helios', lat: 51.035752, lng: 21.087319, address: 'Ks. Kardynała S. Wyszyńskiego 14' },
  { id: 45, name: 'Szczecin Helios CHR Kupiec', city: 'Szczecin', citySlug: 'szczecin', slug: 'kino-helios-chr-kupiec', lat: 53.426736, lng: 14.542279, address: 'ul. Bolesława Krzywoustego 9/10' },
  { id: 47, name: 'Szczecin Helios Outlet Park', city: 'Szczecin', citySlug: 'szczecin', slug: 'helios-outlet-park', lat: 53.38144, lng: 14.67068, address: 'ul. A. Struga 42' },
  { id: 30, name: 'Tczew Helios', city: 'Tczew', citySlug: 'tczew', slug: 'kino-helios', lat: 54.096199, lng: 18.786965, address: 'ul. Pomorska 1' },
  { id: 38, name: 'Tomaszów Mazowiecki Helios', city: 'Tomaszów Mazowiecki', citySlug: 'tomaszow-mazowiecki', slug: 'kino-helios', lat: 51.534865, lng: 20.007052, address: 'ul. Warszawska 1' },
  { id: 26, name: 'Warszawa Helios Blue City', city: 'Warszawa', citySlug: 'warszawa', slug: 'kino-helios-blue-city', lat: 52.212657, lng: 20.955732, address: 'Aleje Jerozolimskie 179' },
  { id: 14, name: 'Wołomin Helios', city: 'Wołomin', citySlug: 'wolomin', slug: 'kino-helios', lat: 52.356279, lng: 21.256595, address: 'ul. Geodetów 2' },
  { id: 41, name: 'Wrocław Helios Magnolia', city: 'Wrocław', citySlug: 'wroclaw', slug: 'kino-helios-magnolia', lat: 51.11818, lng: 16.98719, address: 'ul. Legnicka 58' },
  { id: 8, name: 'Wrocław Helios Aleja Bielany', city: 'Wrocław', citySlug: 'wroclaw', slug: 'kino-helios-aleja-bielany', lat: 51.048879, lng: 16.960007, address: 'ul. Czekoladowa 7-9, Bielany Wrocławskie' },
  { id: 50, name: 'Żory Helios', city: 'Żory', citySlug: 'zory', slug: 'kino-helios', lat: 50.045279, lng: 18.703084, address: 'ul. Katowicka 10' },
];
export function heliosScopes(): string[] {
  return HELIOS_CINEMAS.map((c) => String(c.id));
}
