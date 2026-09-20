// Curated Michelin Guide restaurants for the map "Restauracje" tag.
//
// WHY a static list: guide.michelin.com blocks automated reads (AWS WAF bot
// challenge) and its robots.txt forbids the geo/search endpoints, so there is no
// legal way to scrape it at runtime. This file stores FACTS only (name, city,
// coordinates, award, cuisine, website) that were verified by hand for the 49
// Polish stars + Bib Gourmand entries. No editorial text, no Michelin branding,
// no reservation links (the Guide does not publish them as data).
//
// WHY exactly these: stars (11) and Bib Gourmand (38) are the actual distinctions.
// "Selected Restaurants" is a plain recommendation and is deliberately excluded.
//
// This is a manual import, not a daily seed: re-run POST /admin/seed/restaurants
// after editing the list. Posts are idempotent by external_id (restaurant-<id>).
//
// Media: every restaurant shares ONE placeholder image (backend/assets/restaurant,
// uploaded once to R2 as the keys below). To replace it:
//   npx wrangler r2 object put panperyskop-media/seed/restaurant/media.jpg \
//     --file=assets/restaurant/media.jpg --content-type=image/jpeg --remote
import { nanoid } from 'nanoid';
import { CATEGORY_FOOD, POST_TYPE_PHOTO, STATUS_APPROVED } from '../../core/models';
import { doSavePost } from '../../api/posts';
import { getOrCreateSeedUser } from '../pipeline/queue/state';

export interface RestaurantEntry {
  /** Stable slug — becomes external_id `restaurant-<id>`. */
  id: string;
  name: string;
  city: string;
  /** '1*' | '2*' | '3*' | 'bib' — display label is built on the client. */
  award: string;
  cuisine: string;
  lat: number;
  lng: number;
  website: string;
}

/** Shared placeholder served for every restaurant (R2 keys, see header). */
const MEDIA_KEY = 'seed/restaurant/media.jpg';
const THUMB_KEY = 'seed/restaurant/thumb.jpg';

export const RESTAURANTS: RestaurantEntry[] = [
  { id: 'kwestia-czasu-nago', name: 'Kwestia Czasu / NAGO', city: 'Białystok', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 53.121737, lng: 23.153914, website: 'https://www.instagram.com/restauracjakwestiaczasu/?hl=en' },
  { id: 'sztuka-chleba-i-wina', name: 'Sztuka Chleba i Wina', city: 'Białystok', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 53.133211, lng: 23.146281, website: 'https://www.instagram.com/sztukachlebaiwina.winobistro/' },
  { id: 'arco-by-paco-perez', name: 'Arco by Paco Pérez', city: 'Gdańsk', award: '1*', cuisine: 'Kuchnia kreatywna', lat: 54.403585, lng: 18.571053, website: 'https://www.oliviastar.pl/restauracje/arco-by-paco-perez/' },
  { id: 'brut-bistro', name: 'Brut Bistro', city: 'Gdańsk', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 54.340398, lng: 18.65683, website: 'https://brutbistro.com/' },
  { id: 'hewelke', name: 'Hewelke', city: 'Gdańsk', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 54.382935, lng: 18.60815, website: 'https://hewelke.pl/' },
  { id: 'treinta-y-tres', name: 'Treinta y Tres', city: 'Gdańsk', award: 'bib', cuisine: 'Kuchnia hiszpańska', lat: 54.403643, lng: 18.570819, website: 'https://www.oliviastar.pl/restauracje/treinta-y-tres/' },
  { id: 'krzywa-sztuka-wina', name: 'KRZYWA Sztuka Wina', city: 'Katowice', award: 'bib', cuisine: 'Kuchnia regionalna', lat: 50.25534, lng: 19.015439, website: 'https://krzywa9.pl' },
  { id: 'the-moment', name: 'The Moment', city: 'Kielce', award: 'bib', cuisine: 'Kuchnia tradycyjna', lat: 50.870053, lng: 20.624069, website: 'https://themoment.pl' },
  { id: 'giewont', name: 'Giewont', city: 'Kościelisko', award: '1*', cuisine: 'Kuchnia nowoczesna', lat: 49.290438, lng: 19.921765, website: 'https://restaurantgiewont.com/' },
  { id: 'bottiglieria-1881', name: 'Bottiglieria 1881', city: 'Kraków', award: '2*', cuisine: 'Kuchnia kreatywna', lat: 50.04866, lng: 19.946055, website: 'https://www.1881.com.pl/' },
  { id: 'bufet-krk', name: 'Bufet KRK', city: 'Kraków', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 50.051852, lng: 19.949325, website: 'https://bufetkrk.com' },
  { id: 'folga', name: 'Folga', city: 'Kraków', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 50.05182, lng: 19.945462, website: 'https://folgakrakow.pl/en/front-page/' },
  { id: 'molam', name: 'MOLÁM', city: 'Kraków', award: 'bib', cuisine: 'Kuchnia tajska', lat: 50.064839, lng: 19.927618, website: 'https://molam.pl/' },
  { id: 'noah', name: 'NOAH', city: 'Kraków', award: 'bib', cuisine: 'Kuchnia izraelska', lat: 50.05145, lng: 19.944187, website: 'https://noahkrakow.pl' },
  { id: 'nat-bistro', name: 'Nat Bistro', city: 'Kraków', award: 'bib', cuisine: 'Kuchnia tradycyjna', lat: 50.049349, lng: 19.94324, website: 'https://natbistro.pl/' },
  { id: '2pier', name: '2PiEr', city: 'Lublin', award: 'bib', cuisine: 'Kuchnia tradycyjna', lat: 51.24728, lng: 22.5494, website: 'https://restauracja.2pier.pl/' },
  { id: 'da-andrea', name: 'Da Andrea', city: 'Olsztyn', award: 'bib', cuisine: 'Kuchnia włoska', lat: 53.775355, lng: 20.474463, website: 'https://www.instagram.com/daandreaolsztyn/?hl=en' },
  { id: 'fromazeria', name: 'Fromażeria', city: 'Poznań', award: 'bib', cuisine: 'Kuchnia europejska', lat: 52.406247, lng: 16.924968, website: 'https://fromazeria.pl/' },
  { id: 'muga', name: 'Muga', city: 'Poznań', award: '1*', cuisine: 'Kuchnia nowoczesna', lat: 52.40383, lng: 16.928815, website: 'https://www.restauracjamuga.pl/' },
  { id: 'posto', name: 'Posto', city: 'Poznań', award: 'bib', cuisine: 'Kuchnia europejska', lat: 52.417426, lng: 16.905627, website: 'https://www.postopoznan.pl/' },
  { id: 'spot', name: 'SPOT.', city: 'Poznań', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 52.388971, lng: 16.924279, website: 'https://spot.poznan.pl/' },
  { id: 'tu-restaurant', name: 'TU.REStAURANT', city: 'Poznań', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 52.403108, lng: 16.894208, website: 'https://turestaurant.pl/en/' },
  { id: 'steampunk', name: 'Steampunk', city: 'Pszczyna', award: '1*', cuisine: 'Kuchnia nowoczesna', lat: 49.974237, lng: 18.943773, website: 'https://wodna-wieza.pl/steampunk-restauracja/' },
  { id: 'naama', name: 'Naama', city: 'Rzeszów', award: 'bib', cuisine: 'Kuchnia marokańska', lat: 50.03718, lng: 22.005319, website: 'https://naama.pl/' },
  { id: 'farmer-sons', name: 'Farmer & Sons', city: 'Skórzewo', award: 'bib', cuisine: 'Kuchnia tradycyjna', lat: 52.391558, lng: 16.777032, website: 'https://www.instagram.com/farmer.and.sons?igsh=MTcyNXBtZTJueXA1NQ==' },
  { id: 'vinissimo', name: 'Vinissimo', city: 'Sopot', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 54.443559, lng: 18.567425, website: 'https://vinissimorestaurant.pl/' },
  { id: 'piernicova', name: 'Piernicova', city: 'Toruń', award: 'bib', cuisine: 'Kuchnia regionalna', lat: 53.010176, lng: 18.610704, website: 'https://piernicova.pl/' },
  { id: 'ahaan', name: 'AHAAN', city: 'Warszawa', award: 'bib', cuisine: 'Kuchnia tajska', lat: 52.231408, lng: 21.054976, website: 'https://ahaan.pl/' },
  { id: 'alon-omakase', name: 'Alon Omakase', city: 'Warszawa', award: '1*', cuisine: 'Sushi', lat: 52.188644, lng: 20.991519, website: 'https://omakase.eu/' },
  { id: 'blisko-bar', name: 'Blisko Bar', city: 'Warszawa', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 52.260959, lng: 21.043302, website: 'https://blisko.bar' },
  { id: 'ceviche-bar', name: 'Ceviche Bar', city: 'Warszawa', award: 'bib', cuisine: 'Kuchnia południowoamerykańska', lat: 52.235543, lng: 21.001912, website: 'https://new.cevichebar.pl/' },
  { id: 'kieliszki-na-proznej', name: 'Kieliszki na Próżnej', city: 'Warszawa', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 52.236455, lng: 21.004674, website: 'https://kieliszkinaproznej.pl/' },
  { id: 'koneser-grill', name: 'Koneser Grill', city: 'Warszawa', award: 'bib', cuisine: 'Mięso i grill', lat: 52.255003, lng: 21.044234, website: 'https://konesergrillwarszawa.pl' },
  { id: 'le-braci', name: 'Le Braci', city: 'Warszawa', award: 'bib', cuisine: 'Kuchnia włoska', lat: 52.22439, lng: 21.028538, website: 'https://lebraci.pl/' },
  { id: 'nuta', name: 'NUTA', city: 'Warszawa', award: '1*', cuisine: 'Kuchnia kreatywna', lat: 52.229025, lng: 21.023509, website: 'https://nuta.com.pl/' },
  { id: 'rozbrat-20', name: 'Rozbrat 20', city: 'Warszawa', award: '1*', cuisine: 'Kuchnia nowoczesna', lat: 52.224219, lng: 21.035092, website: 'https://rozbrat20.com.pl/' },
  { id: 'wandal', name: 'WANDAL', city: 'Warszawa', award: 'bib', cuisine: 'Kuchnia współczesna', lat: 52.229844, lng: 20.989473, website: 'https://wandal.pl/' },
  { id: 'win-wine-bar-shop', name: 'WIN wine bar & shop', city: 'Warszawa', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 52.239364, lng: 20.98661, website: 'https://www.instagram.com/win.winebar?igsh=eTJ3eTdnY3Q2dThq' },
  { id: 'wyraj', name: 'WYRAJ', city: 'Warszawa', award: 'bib', cuisine: 'Kuchnia tradycyjna', lat: 52.23588, lng: 20.988602, website: 'https://wyraj.net/' },
  { id: 'hub-praga', name: 'hub.praga', city: 'Warszawa', award: '1*', cuisine: 'Kuchnia nowoczesna', lat: 52.2512, lng: 21.035961, website: 'https://hub-praga.pl/' },
  { id: 'kontakt', name: 'kontakt', city: 'Warszawa', award: 'bib', cuisine: 'Kuchnia śródziemnomorska', lat: 52.207946, lng: 21.019013, website: 'https://kontakt.wine/' },
  { id: 'biblioteka', name: 'Biblioteka', city: 'Wałbrzych', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 50.843035, lng: 16.294483, website: 'https://restauracjabiblioteka.pl/' },
  { id: 'baba', name: 'BABA', city: 'Wrocław', award: '1*', cuisine: 'Kuchnia nowoczesna', lat: 51.112748, lng: 17.031826, website: 'https://baba.wroclaw.pl/' },
  { id: 'ida-kuchnia-i-wino', name: 'IDA kuchnia i wino', city: 'Wrocław', award: 'bib', cuisine: 'Kuchnia regionalna', lat: 51.112499, lng: 17.02906, website: 'https://idakuchniaiwino.pl/' },
  { id: 'most', name: 'Most', city: 'Wrocław', award: '1*', cuisine: 'Kuchnia nowoczesna', lat: 51.114809, lng: 17.031254, website: 'https://miedzy-mostami.pl' },
  { id: 'pijalni', name: 'Pijalni', city: 'Wrocław', award: 'bib', cuisine: 'Kuchnia współczesna', lat: 51.111575, lng: 17.05595, website: 'https://pijalnibistro.pl/' },
  { id: 'tarasowa', name: 'Tarasowa', city: 'Wrocław', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 51.10808, lng: 17.077607, website: 'https://restauracjatarasowa.pl/' },
  { id: 'stary-niedzwiedz', name: 'Stary Niedźwiedź', city: 'Zakopane', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 49.28053, lng: 19.942458, website: 'https://www.instagram.com/staryniedzwiedz.zakopane/' },
  { id: 'acanti', name: 'Acanti', city: 'Łódź', award: 'bib', cuisine: 'Kuchnia nowoczesna', lat: 51.769088, lng: 19.459989, website: 'https://www.acanti.com.pl' },
];

export interface RestaurantIngestResult {
  id: string;
  status: 'ok' | 'error';
  postId?: string;
  reason?: string;
}

/** Upsert every curated restaurant as an evergreen approved post. Idempotent:
 *  a re-run updates the existing post (external_id = restaurant-<id>). */
export async function ingestRestaurants(env: Env): Promise<RestaurantIngestResult[]> {
  const user = await getOrCreateSeedUser(env.DB);
  const results: RestaurantIngestResult[] = [];
  const createdAt = Date.now();
  for (const r of RESTAURANTS) {
    const externalId = `restaurant-${r.id}`;
    try {
      const existing = await env.DB.prepare('SELECT id FROM posts WHERE external_id=?')
        .bind(externalId)
        .first<{ id: string }>();
      const postId = existing?.id ?? nanoid(24);
      const isUpdate = Boolean(existing);
      await doSavePost(
        env, user, postId, POST_TYPE_PHOTO, r.lat, r.lng,
        `${r.name} — ${r.cuisine}, ${r.city}`,
        MEDIA_KEY, THUMB_KEY, createdAt, false, r.website, externalId, isUpdate, false,
        null, null, JSON.stringify(['restauracje']), STATUS_APPROVED,
      );
      // doSavePost classifies any external_id post as a dated 'events' post; a
      // restaurant is evergreen, so override category + clear the day key here.
      await env.DB.prepare('UPDATE posts SET category=?, event_date=NULL, distinction=? WHERE id=?')
        .bind(CATEGORY_FOOD, r.award, postId)
        .run();
      results.push({ id: r.id, status: 'ok', postId });
    } catch (e) {
      results.push({ id: r.id, status: 'error', reason: (e as Error).message });
    }
  }
  return results;
}
