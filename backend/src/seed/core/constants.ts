export const SEED_DEVICE_ID = 'panperyskop-seed';

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
// Event posts become visible at 06:00 Europe/Warsaw of their day (TTL window start).
export const EVENT_VISIBLE_OFFSET_MS = 6 * HOUR_MS;
// An event/showtime stays visible for this long after its start (the "+1h filter").
export const EVENT_GRACE_MS = HOUR_MS;
// Showtime marker for an UNKNOWN start time ("00:00") — all-day events (marathons,
// tours, feeds that omit the hour) carry it and are never time-filtered.
export const UNKNOWN_TIME = '00:00';

// The app browses [today, today+SEED_DAYS_AHEAD]. The seed REFILLS the whole
// window every SEED_INTERVAL_DAYS (cadence) instead of rolling daily — idempotent
// by external_id, so late-published events for the whole window still land.
// Single source of truth for the window.
export const SEED_DAYS_AHEAD = 5;
/** Days between full-window refills. Aligned with the app's browse window and the
 *  ~3-day freshness most providers hold; warms (kupbilecik/awin) follow it. */
export const SEED_INTERVAL_DAYS = 3;
/** A refill covers [today..today+SEED_REFILL_AHEAD] — SEED_DAYS_AHEAD plus the
 *  days until the next refill, so the app window [today..+SEED_DAYS_AHEAD] is
 *  ALWAYS a subset of the last refill's horizon (no empty slider days between
 *  refills). */
export const SEED_REFILL_AHEAD = SEED_DAYS_AHEAD + SEED_INTERVAL_DAYS - 1;

// Generous on purpose: the VPS fetches through the phone's cellular exit node,
// where a tight (10-20s) timeout drops valid responses and yields 0 candidates.
export const PROVIDER_FETCH_TIMEOUT_MS = 60_000;

// Cloudflare Queues sendBatch caps at 100 messages per call.
export const QUEUE_SEND_BATCH_CAP = 100;
// D1 batch() caps at 100 statements — keep chunks well under it.
export const D1_BATCH_STATEMENT_CAP = 90;
// Backoff applied when a message is retried (per-message msg.retry + config retry_delay).
export const QUEUE_RETRY_DELAY_SECONDS = 30;
// Per-invocation message concurrency cap (respects the 6-connection limit + D1 writes).
export const QUEUE_CONSUMER_CONCURRENCY = 6;

export const GOING_BASE = 'https://goingapp.pl';
export const GOING_ALGOLIA_ORIGIN = 'https://goingapp.pl';
export const GOING_PLACE = (slug: string) => `https://api-empikbilety.prod.goingapp.eu/api/v1/place/${slug}`;
export const GOING_POSTER = (path: string, sig: string) =>
  `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,h_810,w_1080/f_jpg/q_auto:eco/v1/${path}?_a=${sig}`;
export const GOING_THUMB = (path: string, sig: string) =>
  `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,w_320,h_320/f_jpg/q_auto:eco/v1/${path}?_a=${sig}`;

export const MP_BASE = 'https://www.maratonypolskie.pl';
export const MP_LIST = `${MP_BASE}/mp_index.php`;

export const GYG_BASE = 'https://api.getyourguide.com';
export const GYG_WEB = 'https://www.getyourguide.com';
export const GYG_RADIUS_KM = 15;
export const GYG_LIMIT = 30;
// Picture url from the API contains a [format_id] placeholder — replace with a
// real size id (see the partner-api-spec wiki for the full list).
export const GYG_IMG_FORMAT = '-410-270';

export const MK_BASE = 'https://www.multikino.pl';
export const MK_API = `${MK_BASE}/api/microservice`;
export const MK_AUTH = `${MK_API}/auth/token`;
export const MK_EMBARGO = 1;
// Fallback anonymous-token cache TTL when the JWT has no usable `exp` claim.
export const MK_TOKEN_TTL_MS = 12 * HOUR_MS;

interface Cinema {
  id: string;
  name: string;
  city: string;
  enabled: boolean;
  urlCitySlug?: string;
  urlCinemaSlug?: string;
  lat?: number;
  lng?: number;
}
export const MK_CINEMAS: Cinema[] = [
  { id: '0006', name: 'Bydgoszcz', city: 'Bydgoszcz', urlCinemaSlug: 'bydgoszcz', enabled: true, lat: 53.126401, lng: 17.984632 },
  { id: '0033', name: 'Czechowice-Dziedzice', city: 'Czechowice-Dziedzice', urlCinemaSlug: 'czechowice-dziedzice', enabled: false },
  { id: '0037', name: 'Elbląg Ogrody', city: 'Elbląg', urlCinemaSlug: 'elblag-ogrody', enabled: false },
  { id: '0004', name: 'Gdańsk', city: 'Gdańsk', urlCinemaSlug: 'gdansk', enabled: true, lat: 54.372120, lng: 18.627058 },
  { id: '0048', name: 'Głogów', city: 'Głogów', urlCinemaSlug: 'glogow', enabled: false },
  { id: '0047', name: 'Gorzów Wielkopolski', city: 'Gorzów Wielkopolski', urlCinemaSlug: 'gorzow-wielkopolski', enabled: false },
  { id: '0038', name: 'Jaworzno', city: 'Jaworzno', urlCinemaSlug: 'jaworzno', enabled: false },
  { id: '0042', name: 'Kalisz', city: 'Kalisz', urlCinemaSlug: 'kalisz', enabled: false },
  { id: '0035', name: 'Katowice', city: 'Katowice', urlCinemaSlug: 'katowice', enabled: true, lat: 50.258738, lng: 19.016754 },
  { id: '0029', name: 'Kielce', city: 'Kielce', urlCinemaSlug: 'kielce', enabled: true, lat: 50.875735, lng: 20.634915 },
  { id: '0041', name: 'Kłodzko', city: 'Kłodzko', urlCinemaSlug: 'klodzko', enabled: false },
  { id: '0015', name: 'Koszalin', city: 'Koszalin', urlCinemaSlug: 'koszalin', enabled: true, lat: 54.176844, lng: 16.200956 },
  { id: '0005', name: 'Kraków', city: 'Kraków', urlCinemaSlug: 'krakow', enabled: true, lat: 50.088937, lng: 19.984296 },
  { id: '0044', name: 'Leszno', city: 'Leszno', urlCinemaSlug: 'leszno', enabled: false },
  { id: '0034', name: 'Lublin', city: 'Lublin', urlCinemaSlug: 'lublin', enabled: true, lat: 51.267236, lng: 22.573271 },
  { id: '0023', name: 'Łódź', city: 'Łódź', urlCinemaSlug: 'lodz', enabled: true, lat: 51.759002, lng: 19.461654 },
  { id: '0051', name: 'Mielec', city: 'Mielec', urlCinemaSlug: 'mielec', enabled: false },
  { id: '0036', name: 'Olsztyn', city: 'Olsztyn', urlCinemaSlug: 'olsztyn', enabled: true, lat: 53.753960, lng: 20.485498 },
  { id: '0011', name: 'Poznań Stary Browar', city: 'Poznań', urlCinemaSlug: 'poznan-stary-browar', enabled: true, lat: 52.410000, lng: 16.909853 },
  { id: '0039', name: 'Pruszków', city: 'Pruszków', urlCinemaSlug: 'pruszkow', enabled: false },
  { id: '0026', name: 'Radom', city: 'Radom', urlCinemaSlug: 'radom', enabled: false },
  { id: '0027', name: 'Rumia', city: 'Rumia', urlCinemaSlug: 'rumia', enabled: false },
  { id: '0014', name: 'Rybnik', city: 'Rybnik', urlCinemaSlug: 'rybnik', enabled: false },
  { id: '0028', name: 'Rzeszów', city: 'Rzeszów', urlCinemaSlug: 'rzeszow', enabled: true, lat: 50.026732, lng: 22.018215 },
  { id: '0030', name: 'Słupsk', city: 'Słupsk', urlCinemaSlug: 'slupsk', enabled: false },
  { id: '0007', name: 'Szczecin', city: 'Szczecin', urlCinemaSlug: 'szczecin', enabled: true, lat: 53.433909, lng: 14.555895 },
  { id: '0043', name: 'Świdnica', city: 'Świdnica', urlCinemaSlug: 'swidnica', enabled: false },
  { id: '0050', name: 'Tarnów', city: 'Tarnów', urlCinemaSlug: 'tarnow', enabled: false },
  { id: '0053', name: 'Tychy Gemini Park', city: 'Tychy', urlCinemaSlug: 'tychy-gemini-park', enabled: false },
  { id: '0052', name: 'Warszawa G City Reduta', city: 'Warszawa', urlCinemaSlug: 'warszawa-g-city-reduta', enabled: true, lat: 52.227955, lng: 21.002846 },
  { id: '0024', name: 'Warszawa G City Targówek', city: 'Warszawa', urlCinemaSlug: 'warszawa-g-city-targowek', enabled: true, lat: 52.302571, lng: 21.057607 },
  { id: '0040', name: 'Warszawa Młociny', city: 'Warszawa', urlCinemaSlug: 'warszawa-mlociny', enabled: true, lat: 52.295012, lng: 20.930919 },
  { id: '0025', name: 'Warszawa Wola Park', city: 'Warszawa', urlCinemaSlug: 'warszawa-wola-park', enabled: true, lat: 52.241754, lng: 20.932806 },
  { id: '0013', name: 'Warszawa Złote Tarasy', city: 'Warszawa', urlCinemaSlug: 'warszawa-zlote-tarasy', enabled: true, lat: 52.229518, lng: 21.001904 },
  { id: '0008', name: 'Włocławek', city: 'Włocławek', urlCinemaSlug: 'wloclawek', enabled: false },
  { id: '0010', name: 'Wrocław Pasaż Grunwaldzki', city: 'Wrocław', urlCinemaSlug: 'wroclaw-pasaz-grunwaldzki', enabled: true, lat: 51.112050, lng: 17.059561 },
  { id: '0003', name: 'Zabrze', city: 'Zabrze', urlCinemaSlug: 'zabrze', enabled: false },
  { id: '0031', name: 'Zgorzelec', city: 'Zgorzelec', urlCinemaSlug: 'zgorzelec', enabled: false },
];
export function mkCinemaById(id: string): Cinema | undefined {
  return MK_CINEMAS.find((c) => c.id === id);
}

// Cinema scopes: which cinemas produce queue fetch messages.
export function mkScopes(): string[] {
  return MK_CINEMAS.filter((c) => c.enabled).map((c) => c.id);
}

// Thumbnail resizing on Sitecore media URLs (mw/mh keep aspect via fit).
export const MK_THUMB_QUERY = '&mw=240&mh=350';

export const CC_TENANT = '10103';
export const CC_BASE = `https://www.cinema-city.pl/pl/data-api-service/v1/quickbook/${CC_TENANT}`;
export const CC_SITE = 'https://www.cinema-city.pl/';
export const CC_FILM_EVENTS = (cinemaId: string, day: string) => `${CC_BASE}/film-events/in-cinema/${cinemaId}/at-date/${day}`;
export const CC_FILM_URL = (filmId: string) => `${CC_SITE}filmy/${filmId}`;
export const CC_TIMEOUT_MS = PROVIDER_FETCH_TIMEOUT_MS;

// Static cinema catalog (parsed once from the site's apiSitesList blob). Scope
// list for the queue; geo/venue for candidates. Mirrors MK_CINEMAS.
export const CC_CINEMAS: Cinema[] = [
  { id: '1100', name: 'Biała Podlaska', city: 'Biała Podlaska', lat: 52.03441, lng: 23.12303, enabled: true },
  { id: '1088', name: 'Bielsko-Biała', city: 'Bielsko-Biała', lat: 49.8026, lng: 19.051352, enabled: true },
  { id: '1086', name: 'Bydgoszcz', city: 'Bydgoszcz', lat: 53.125305, lng: 18.01894, enabled: true },
  { id: '1092', name: 'Bytom', city: 'Bytom', lat: 50.347607, lng: 18.918924, enabled: true },
  { id: '1098', name: 'Cieszyn', city: 'Cieszyn', lat: 49.749653, lng: 18.637823, enabled: true },
  { id: '1089', name: 'Częstochowa - Galeria Jurajska', city: 'Częstochowa', lat: 50.80704, lng: 19.132248, enabled: true },
  { id: '1075', name: 'Częstochowa - Wolność', city: 'Częstochowa', lat: 50.813187, lng: 19.117859, enabled: true },
  { id: '1099', name: 'Elbląg', city: 'Elbląg', lat: 54.16652, lng: 19.4023, enabled: true },
  { id: '1085', name: 'Gliwice', city: 'Gliwice', lat: 50.300583, lng: 18.681223, enabled: true },
  { id: '1065', name: 'Katowice - Punkt 44', city: 'Katowice', lat: 50.26252, lng: 19.00602, enabled: true },
  { id: '1079', name: 'Katowice - Silesia', city: 'Katowice', lat: 50.270752, lng: 19.002821, enabled: true },
  { id: '1090', name: 'Kraków - Bonarka', city: 'Kraków', lat: 50.02694, lng: 19.94972, enabled: true },
  { id: '1076', name: 'Kraków - Galeria Kazimierz', city: 'Kraków', lat: 50.05303, lng: 19.956566, enabled: true },
  { id: '1064', name: 'Kraków - Zakopianka', city: 'Kraków', lat: 50.01654, lng: 19.930508, enabled: true },
  { id: '1094', name: 'Lublin - Felicity', city: 'Lublin', lat: 51.231422, lng: 22.613071, enabled: true },
  { id: '1084', name: 'Lublin - Plaza', city: 'Lublin', lat: 51.245033, lng: 22.550875, enabled: true },
  { id: '1080', name: 'Łódź Manufaktura', city: 'Łódź', lat: 51.780827, lng: 19.448492, enabled: true },
  { id: '1081', name: 'Poznań - Kinepolis', city: 'Poznań', lat: 52.373806, lng: 16.980959, enabled: true },
  { id: '1078', name: 'Poznań - Plaza', city: 'Poznań', lat: 52.44197, lng: 16.918924, enabled: true },
  { id: '1062', name: 'Ruda Śląska', city: 'Ruda Śląska', lat: 50.275566, lng: 18.866491, enabled: true },
  { id: '1082', name: 'Rybnik', city: 'Rybnik', lat: 50.096584, lng: 18.53775, enabled: true },
  { id: '1083', name: 'Sosnowiec', city: 'Sosnowiec', lat: 50.275215, lng: 19.126959, enabled: true },
  { id: '1095', name: 'Starogard Gdański', city: 'Starogard Gdański', lat: 53.964165, lng: 18.529493, enabled: true },
  { id: '1077', name: 'Toruń - Czerwona Droga', city: 'Toruń', lat: 53.01551, lng: 18.600689, enabled: true },
  { id: '1093', name: 'Toruń - Plaza', city: 'Toruń', lat: 53.015995, lng: 18.561178, enabled: true },
  { id: '1091', name: 'Wałbrzych', city: 'Wałbrzych', lat: 50.767063, lng: 16.265245, enabled: true },
  { id: '1074', name: 'Warszawa - Arkadia', city: 'Warszawa', lat: 52.257217, lng: 20.984465, enabled: true },
  { id: '1061', name: 'Warszawa - Bemowo', city: 'Warszawa', lat: 52.26571, lng: 20.932743, enabled: true },
  { id: '1096', name: 'Warszawa - Białołęka Galeria Północna', city: 'Warszawa', lat: 52.318344, lng: 20.964226, enabled: true },
  { id: '1069', name: 'Warszawa - Janki', city: 'Janki', lat: 52.135708, lng: 20.892134, enabled: true },
  { id: '1070', name: 'Warszawa - Mokotów', city: 'Warszawa', lat: 52.17884, lng: 21.00342, enabled: true },
  { id: '1068', name: 'Warszawa - Promenada', city: 'Warszawa', lat: 52.2316, lng: 21.106195, enabled: true },
  { id: '1060', name: 'Warszawa - Sadyba', city: 'Warszawa', lat: 52.187485, lng: 21.061102, enabled: true },
  { id: '1067', name: 'Wrocław - Korona', city: 'Wrocław', lat: 51.142323, lng: 17.08925, enabled: true },
  { id: '1097', name: 'Wrocław - Wroclavia', city: 'Wrocław', lat: 51.096714, lng: 17.034151, enabled: true },
  { id: '1087', name: 'Zielona Góra', city: 'Zielona Góra', lat: 51.936207, lng: 15.511678, enabled: true },
];
export function ccScopes(): string[] {
  return CC_CINEMAS.map((c) => c.id);
}

export const HELIOS_BASE = 'https://www.helios.pl';
export const HELIOS_API = 'https://api.helios.pl/api/v1';
export const HELIOS_SCREENINGS = (cinemaId: number) => `${HELIOS_API}/cinemas/${cinemaId}/screenings`;
export const HELIOS_FILM = (cinema: Cinema, filmSlug: string, filmId: number) =>
  `${HELIOS_BASE}/${cinema.urlCitySlug}/${cinema.urlCinemaSlug}/filmy/${filmSlug}-${filmId}`;
export const HELIOS_TIMEOUT_MS = 20_000;

export const VPS_IPV4_PROXY_HOST = '127.0.0.1';
export const VPS_IPV4_PROXY_PORT = 1057;
export const VPS_WINDOW_START_HOUR = 5; // Europe/Warsaw — outside this window a kick is a no-op
export const VPS_WINDOW_END_HOUR = 22;
export const VPS_EXIT_IPHONE = 'iphone-14-pro-max'; // primary residential exit node
export const VPS_EXIT_MAC = 'macos'; // fallback exit node
export const VPS_EXIT_PROBE_TIMEOUT_MS = 20_000;
export const VPS_EXIT_SWITCH_WAIT_MS = 2_000;
// Resource gate — the VPS is a 256 MB shared box. Before each scope the seed
// reads /proc; if memory or load is too tight it PAUSES (checkpoint saved) and
// the next 30-min kick resumes. Good citizen: small chunks in free moments.
export const VPS_MIN_MEMAVAILABLE_MB = 80;
export const VPS_MAX_LOAD1 = 2.0;
// Scope concurrency — with a ROTATING residential proxy each scope fetch egresses
// from a FRESH IP, so parallel scopes don't trip per-IP rate limits (which forced
// the old sequential 30-min pass). Bounded so the 256 MB box never stacks many
// in-flight media buffers. Override via env on the box (VPS_CONCURRENCY).
export const VPS_CONCURRENCY = Number(process.env.VPS_CONCURRENCY || 8);

export const LUMA_API = 'https://api.luma.com/discover';
export const LUMA_EVENT_WEB = 'https://lu.ma';
export const LUMA_LIMIT = 50; // server caps the page size at 50
// Warsaw is the only launched PL "place"; other cities are fetched by bbox.
export const LUMA_PLACE_WARSAW = 'discplace-PTcuEQVHuySJe8N';
// Bbox radius (degrees) around each non-Warsaw city center (±0.3° ≈ 33 km,
// covers the metro area incl. suburbs like Sopot for Gdańsk).
export const LUMA_BBOX_RADIUS = 0.3;

export const MEETUP_GQL = 'https://www.meetup.com/gql2';
export const MEETUP_RADIUS = 40; // km — city + surroundings; pins show by coords
export const MEETUP_FIRST = 200; // page size for the custom recommendedEvents query

// Static cinema catalog (parsed once from api.helios.pl/api/v1/cinemas; citySlug
// verified against the site's home-page scope URLs). Mirrors MK_CINEMAS.
export const HELIOS_CINEMAS: Cinema[] = [
  { id: '6', name: 'Bełchatów Helios', city: 'Bełchatów', urlCitySlug: 'belchatow', urlCinemaSlug: 'kino-helios', lat: 51.35339, lng: 19.376086, enabled: true },
  { id: '43', name: 'Białystok Helios Jurowiecka', city: 'Białystok', urlCitySlug: 'bialystok', urlCinemaSlug: 'kino-helios-jurowiecka', lat: 53.136558, lng: 23.162576, enabled: true },
  { id: '37', name: 'Białystok Helios Alfa', city: 'Białystok', urlCitySlug: 'bialystok', urlCinemaSlug: 'kino-helios-alfa', lat: 53.125749, lng: 23.169145, enabled: true },
  { id: '10', name: 'Białystok Helios Biała', city: 'Białystok', urlCitySlug: 'bialystok', urlCinemaSlug: 'kino-helios-biala', lat: 53.122457, lng: 23.177418, enabled: true },
  { id: '36', name: 'Bielsko-Biała Helios', city: 'Bielsko-Biała', urlCitySlug: 'bielsko-biala', urlCinemaSlug: 'kino-helios', lat: 49.827349, lng: 19.049722, enabled: true },
  { id: '9', name: 'Bydgoszcz Helios', city: 'Bydgoszcz', urlCitySlug: 'bydgoszcz', urlCinemaSlug: 'kino-helios', lat: 53.125868, lng: 18.067264, enabled: true },
  { id: '24', name: 'Dąbrowa Górnicza Helios', city: 'Dąbrowa Górnicza', urlCitySlug: 'dabrowa-gornicza', urlCinemaSlug: 'kino-helios', lat: 50.327165, lng: 19.183798, enabled: true },
  { id: '18', name: 'Gdańsk Helios Metropolia', city: 'Gdańsk', urlCitySlug: 'gdansk', urlCinemaSlug: 'kino-helios-metropolia', lat: 54.383003, lng: 18.605256, enabled: true },
  { id: '13', name: 'Gdańsk Helios Forum', city: 'Gdańsk', urlCitySlug: 'gdansk', urlCinemaSlug: 'kino-helios-forum', lat: 54.349381, lng: 18.643519, enabled: true },
  { id: '23', name: 'Gdynia Helios', city: 'Gdynia', urlCitySlug: 'gdynia', urlCinemaSlug: 'kino-helios', lat: 54.504902, lng: 18.532143, enabled: true },
  { id: '42', name: 'Gniezno Helios', city: 'Gniezno', urlCitySlug: 'gniezno', urlCinemaSlug: 'kino-helios', lat: 52.560964, lng: 17.612513, enabled: true },
  { id: '46', name: 'Gorzów Wielkopolski Helios', city: 'Gorzów Wielkopolski', urlCitySlug: 'gorzow-wielkopolski', urlCinemaSlug: 'kino-helios', lat: 52.73114, lng: 15.224744, enabled: true },
  { id: '19', name: 'Grudziądz Helios', city: 'Grudziądz', urlCitySlug: 'grudziadz', urlCinemaSlug: 'kino-helios', lat: 53.484428, lng: 18.747582, enabled: true },
  { id: '16', name: 'Jelenia Góra Helios', city: 'Jelenia Góra', urlCitySlug: 'jelenia-gora', urlCinemaSlug: 'kino-helios', lat: 50.922308, lng: 15.763399, enabled: true },
  { id: '29', name: 'Kalisz Helios', city: 'Kalisz', urlCitySlug: 'kalisz', urlCinemaSlug: 'kino-helios', lat: 51.744527, lng: 18.070502, enabled: true },
  { id: '2', name: 'Katowice Helios', city: 'Katowice', urlCitySlug: 'katowice', urlCinemaSlug: 'kino-helios', lat: 50.223904, lng: 18.987786, enabled: true },
  { id: '48', name: 'Kędzierzyn-Koźle Helios', city: 'Kędzierzyn-Koźle', urlCitySlug: 'kedzierzyn-kozle', urlCinemaSlug: 'kino-helios', lat: 50.342219, lng: 18.191086, enabled: true },
  { id: '40', name: 'Kielce Helios', city: 'Kielce', urlCitySlug: 'kielce', urlCinemaSlug: 'kino-helios', lat: 50.880437, lng: 20.647754, enabled: true },
  { id: '31', name: 'Konin Helios', city: 'Konin', urlCitySlug: 'konin', urlCinemaSlug: 'kino-helios', lat: 52.23848, lng: 18.259979, enabled: true },
  { id: '54', name: 'Koszalin Helios', city: 'Koszalin', urlCitySlug: 'koszalin', urlCinemaSlug: 'kino-helios-galeria-emka', lat: 54.207717, lng: 16.185954, enabled: true },
  { id: '34', name: 'Krosno Helios', city: 'Krosno', urlCitySlug: 'krosno', urlCinemaSlug: 'kino-helios', lat: 49.677475, lng: 21.776047, enabled: true },
  { id: '15', name: 'Legionowo Helios', city: 'Legionowo', urlCitySlug: 'legionowo', urlCinemaSlug: 'kino-helios', lat: 52.396568, lng: 20.932827, enabled: true },
  { id: '5', name: 'Legnica Helios', city: 'Legnica', urlCitySlug: 'legnica', urlCinemaSlug: 'kino-helios', lat: 51.210865, lng: 16.163681, enabled: true },
  { id: '27', name: 'Lubin Helios', city: 'Lubin', urlCitySlug: 'lubin', urlCinemaSlug: 'kino-helios', lat: 51.394022, lng: 16.205798, enabled: true },
  { id: '7', name: 'Łódź Helios', city: 'Łódź', urlCitySlug: 'lodz', urlCinemaSlug: 'kino-helios', lat: 51.749311, lng: 19.448353, enabled: true },
  { id: '53', name: 'Łomża Helios', city: 'Łomża', urlCitySlug: 'lomza', urlCinemaSlug: 'kino-helios', lat: 53.172971, lng: 22.066986, enabled: true },
  { id: '3', name: 'Nowy Sącz Helios', city: 'Nowy Sącz', urlCitySlug: 'nowy-sacz', urlCinemaSlug: 'kino-helios', lat: 49.624136, lng: 20.706627, enabled: true },
  { id: '33', name: 'Olsztyn Helios', city: 'Olsztyn', urlCitySlug: 'olsztyn', urlCinemaSlug: 'kino-helios', lat: 53.777262, lng: 20.483205, enabled: true },
  { id: '1', name: 'Opole Helios Solaris', city: 'Opole', urlCitySlug: 'opole', urlCinemaSlug: 'kino-helios-solaris', lat: 50.670482, lng: 17.926158, enabled: true },
  { id: '51', name: 'Opole Helios Karolinka', city: 'Opole', urlCitySlug: 'opole', urlCinemaSlug: 'kino-helios-karolinka', lat: 50.681788, lng: 17.884332, enabled: true },
  { id: '52', name: 'Ostrów Wielkopolski Helios', city: 'Ostrów Wielkopolski', urlCitySlug: 'ostrow-wielkopolski', urlCinemaSlug: 'kino-helios', lat: 51.659615, lng: 17.84865, enabled: true },
  { id: '39', name: 'Pabianice Helios', city: 'Pabianice', urlCitySlug: 'pabianice', urlCinemaSlug: 'kino-helios', lat: 51.660829, lng: 19.358537, enabled: true },
  { id: '44', name: 'Piła Helios', city: 'Piła', urlCitySlug: 'pila', urlCinemaSlug: 'kino-helios', lat: 53.158757, lng: 16.75688, enabled: true },
  { id: '28', name: 'Piotrków Trybunalski Helios', city: 'Piotrków Trybunalski', urlCitySlug: 'piotrkow-trybunalski', urlCinemaSlug: 'kino-helios', lat: 51.41121, lng: 19.667236, enabled: true },
  { id: '22', name: 'Płock Helios', city: 'Płock', urlCitySlug: 'plock', urlCinemaSlug: 'kino-helios', lat: 52.534998, lng: 19.75708, enabled: true },
  { id: '25', name: 'Poznań Helios', city: 'Poznań', urlCitySlug: 'poznan', urlCinemaSlug: 'kino-helios', lat: 52.397362, lng: 16.956183, enabled: true },
  { id: '17', name: 'Przemyśl Helios', city: 'Przemyśl', urlCitySlug: 'przemysl', urlCinemaSlug: 'kino-helios', lat: 49.790658, lng: 22.781051, enabled: true },
  { id: '11', name: 'Radom Helios', city: 'Radom', urlCitySlug: 'radom', urlCinemaSlug: 'kino-helios', lat: 51.390611, lng: 21.151959, enabled: true },
  { id: '49', name: 'Rzeszów Galeria Rzeszów', city: 'Rzeszów', urlCitySlug: 'rzeszow', urlCinemaSlug: 'kino-helios-galeria', lat: 50.041957, lng: 21.998118, enabled: true },
  { id: '32', name: 'Siedlce Helios', city: 'Siedlce', urlCitySlug: 'siedlce', urlCinemaSlug: 'kino-helios', lat: 52.16792, lng: 22.269607, enabled: true },
  { id: '21', name: 'Sosnowiec Helios', city: 'Sosnowiec', urlCitySlug: 'sosnowiec', urlCinemaSlug: 'kino-helios', lat: 50.275576, lng: 19.131947, enabled: true },
  { id: '12', name: 'Stalowa Wola Helios', city: 'Stalowa Wola', urlCitySlug: 'stalowa-wola', urlCinemaSlug: 'kino-helios', lat: 50.58448, lng: 22.064197, enabled: true },
  { id: '4', name: 'Starachowice Helios', city: 'Starachowice', urlCitySlug: 'starachowice', urlCinemaSlug: 'kino-helios', lat: 51.035752, lng: 21.087319, enabled: true },
  { id: '45', name: 'Szczecin Helios CHR Kupiec', city: 'Szczecin', urlCitySlug: 'szczecin', urlCinemaSlug: 'kino-helios-chr-kupiec', lat: 53.426736, lng: 14.542279, enabled: true },
  { id: '47', name: 'Szczecin Helios Outlet Park', city: 'Szczecin', urlCitySlug: 'szczecin', urlCinemaSlug: 'helios-outlet-park', lat: 53.38144, lng: 14.67068, enabled: true },
  { id: '30', name: 'Tczew Helios', city: 'Tczew', urlCitySlug: 'tczew', urlCinemaSlug: 'kino-helios', lat: 54.096199, lng: 18.786965, enabled: true },
  { id: '38', name: 'Tomaszów Mazowiecki Helios', city: 'Tomaszów Mazowiecki', urlCitySlug: 'tomaszow-mazowiecki', urlCinemaSlug: 'kino-helios', lat: 51.534865, lng: 20.007052, enabled: true },
  { id: '26', name: 'Warszawa Helios Blue City', city: 'Warszawa', urlCitySlug: 'warszawa', urlCinemaSlug: 'kino-helios-blue-city', lat: 52.212657, lng: 20.955732, enabled: true },
  { id: '14', name: 'Wołomin Helios', city: 'Wołomin', urlCitySlug: 'wolomin', urlCinemaSlug: 'kino-helios', lat: 52.356279, lng: 21.256595, enabled: true },
  { id: '41', name: 'Wrocław Helios Magnolia', city: 'Wrocław', urlCitySlug: 'wroclaw', urlCinemaSlug: 'kino-helios-magnolia', lat: 51.11818, lng: 16.98719, enabled: true },
  { id: '8', name: 'Wrocław Helios Aleja Bielany', city: 'Wrocław', urlCitySlug: 'wroclaw', urlCinemaSlug: 'kino-helios-aleja-bielany', lat: 51.048879, lng: 16.960007, enabled: true },
  { id: '50', name: 'Żory Helios', city: 'Żory', urlCitySlug: 'zory', urlCinemaSlug: 'kino-helios', lat: 50.045279, lng: 18.703084, enabled: true },
];
export function heliosScopes(): string[] {
  return HELIOS_CINEMAS.map((c) => c.id);
}
