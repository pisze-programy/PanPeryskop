// maratonypolskie.pl provider — 'fetch' transport, Worker executor. The site is a
// plain PHP calendar (no anti-bot, returns 200 from datacenter egress), so it runs
// on the CF Workers edge without a proxy. Content: Polish running events (grp=13).
//
// The list page (POST mp_index.php with a month/year) renders a table with one row
// per event: DYSC icon / DATE / PLACE (city [+distance]) / NAME + per-event `code`.
// There is no start hour and no geo on the site: startMs = 00:00 (showtimes null)
// and coordinates come from Nominatim via the city. The poster (/logo/<year>/…)
// lives on the per-event detail page (action=5&code=…).
//
// Staging: every post ingests as PENDING (pendingByDefault) until reviewed — flip
// the flag below to auto-approve. Events without a poster are skipped (no broken
// posts); in practice ~100% of events have a current-year /logo/ poster.
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { resolveGeo } from '../core/geo';
import { MP_BASE, MP_LIST } from '../core/constants';
import { UA_HEADERS } from './http';

const MP_GRP = '13';
const MP_MONTHS = ['styczen', 'luty', 'marzec', 'kwiecien', 'maj', 'czerwiec', 'lipiec',
  'sierpien', 'wrzesien', 'pazdziernik', 'listopad', 'grudzien'];
const MP_TIMEOUT_MS = 10_000;

// iso-8859-2 (Latin-2) code points for bytes 0xA0..0xFF — the list/detail pages are
// served as charset=iso-8859-2 and the Workers TextDecoder only covers a limited
// set (no Latin-2), so decode manually (0x00-0x9F stay raw ASCII/control).
const LATIN2_HI = [
  0xa0, 0x0104, 0x02d8, 0x0141, 0x00a4, 0x013d, 0x015a, 0x00a7,
  0x00a8, 0x0160, 0x015e, 0x0164, 0x0179, 0x00ad, 0x017d, 0x017b,
  0x00b0, 0x0105, 0x02db, 0x0142, 0x00b4, 0x013e, 0x015b, 0x02c7,
  0x00b8, 0x0161, 0x015f, 0x0165, 0x017a, 0x02dd, 0x017e, 0x017c,
  0x0154, 0x00c1, 0x00c2, 0x0102, 0x00c4, 0x0139, 0x0106, 0x00c7,
  0x010c, 0x00c9, 0x0118, 0x00cb, 0x011a, 0x00cd, 0x00ce, 0x010e,
  0x0110, 0x0143, 0x0147, 0x00d3, 0x00d4, 0x0150, 0x00d6, 0x00d7,
  0x0158, 0x016e, 0x00da, 0x0170, 0x00dc, 0x00dd, 0x0162, 0x00df,
  0x0155, 0x00e1, 0x00e2, 0x0103, 0x00e4, 0x013a, 0x0107, 0x00e7,
  0x010d, 0x00e9, 0x0119, 0x00eb, 0x011b, 0x00ed, 0x00ee, 0x010f,
  0x0111, 0x0144, 0x0148, 0x00f3, 0x00f4, 0x0151, 0x00f6, 0x00f7,
  0x0159, 0x016f, 0x00fa, 0x0171, 0x00fc, 0x00fd, 0x0163, 0x02d9,
] as const;

function latin2Decode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    s += b >= 0xa0 ? String.fromCharCode(LATIN2_HI[b - 0xa0]) : String.fromCharCode(b);
  }
  return s;
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parse the site's date formats: `2026.9.5`, `5.9.2026` and multi-day
 *  `19-20.09.2026` / `18-20.09.2026`. Drops the trailing `(so)` weekday. */
export function parseMpDate(raw: string): string[] {
  const s = raw.replace(/\s*\([a-z]{2}\)\s*$/i, '').trim();
  let m = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return [iso(+m[1], +m[2], +m[3])];
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return [iso(+m[3], +m[2], +m[1])];
  m = s.match(/^(\d{1,2})-(\d{1,2})(?:-(\d{1,2}))?\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const d1 = +m[1];
    const d2 = m[3] ? +m[3] : +m[2];
    const mon = +m[4];
    const y = +m[5];
    const out: string[] = [];
    for (let d = d1; d <= d2; d++) out.push(iso(y, mon, d));
    return out;
  }
  return [];
}

/** The MIEJSCE cell glues distance(s) to the city ("Gdańsk 5 km.",
 *  "Warszawa 42.195 km, 10 km") — strip every trailing distance segment. */
function parseMiejsce(raw: string): { city: string; distance: string | null } {
  let city = raw.replace(/\s+/g, ' ').trim();
  const distances: string[] = [];
  for (;;) {
    const m = city.match(/(\d+(?:[.,]\d+)?)\s*km\.?$/i);
    if (!m) break;
    distances.unshift(`${m[1].replace(',', '.')} km`);
    city = city.slice(0, m.index).replace(/,\s*$/, '').replace(/\.$/, '').trim();
  }
  return { city, distance: distances[0] || null };
}

interface MpEvent {
  code: string;
  dates: string[];
  city: string;
  distance: string | null;
  name: string;
}

export function parseList(html: string): MpEvent[] {
  const out: MpEvent[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    if (!/action=5&code=/i.test(row)) continue;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 4) continue;
    const codeM = row.match(/code=(\d+)/i);
    const dates = parseMpDate(strip(tds[1]));
    if (!codeM || !dates.length) continue; // nav/ad rows
    const { city, distance } = parseMiejsce(strip(tds[2]));
    out.push({ code: codeM[1], dates, city, distance, name: decodeEntities(strip(tds[3])) });
  }
  return out;
}

// Fallback poster for events whose detail page has no /logo/ image at all:
// hosted in R2 (posts/defaults/sport-poster.jpg), served by the public /media route.
const DEFAULT_SPORT_POSTER = 'https://api.panperyskop.app/media/posts/defaults/sport-poster.jpg';

/** The event logo: the FIRST /logo/<year>/ image on the detail page (the 960px
 *  header banner — every page has one). Falls back to the default poster when
 *  no /logo/ image exists. */
function extractPoster(html: string): string | null {
  const m = html.match(/src=["'](\/logo\/20\d{2}\/[^"']+\.(?:jpg|jpeg|png|gif))["']/i);
  return m ? m[1] : null;
}

interface MpDetail {
  logo: string | null;
  officialLink: string | null;
}

export function fetchDetail(code: string): Promise<MpDetail> {
  const url = `${MP_LIST}?dzial=3&action=5&code=${code}&bieganie`;
  return fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(MP_TIMEOUT_MS) })
    .then((res) => (res.ok ? res.arrayBuffer() : null))
    .then((buf) => {
      if (!buf) return { logo: null, officialLink: null };
      const html = latin2Decode(new Uint8Array(buf));
      const poster = extractPoster(html);
      const links = [...html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+?)["'][^>]*>/gi)].map((m) => m[1]);
      const officialLink = links.find((l) => !l.includes('maratonypolskie.pl')) || null;
      return { logo: poster ? `${MP_BASE}${poster}` : null, officialLink };
    })
    .catch(() => ({ logo: null, officialLink: null }));
}

export function fetchList(day: string): Promise<MpEvent[]> {
  const [y, m] = day.split('-').map(Number);
  const body = new URLSearchParams({
    dzienp1: '1',
    dzienk1: '31',
    czasm1: MP_MONTHS[m - 1],
    czasr1: String(y),
    wojew: 'Wszystkie',
    mapa_nazwa: 'Polska',
    mapa_tryb2: 'Tekstowo',
    grp: MP_GRP,
    cykl: '',
    wielkosc: '2',
    dzial: '3',
    action: '1',
  }).toString();
  return fetch(MP_LIST, {
    method: 'POST',
    headers: { ...UA_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(MP_TIMEOUT_MS),
  })
    .then((res) => (res.ok ? res.arrayBuffer() : null))
    .then((buf) => (buf ? parseList(latin2Decode(new Uint8Array(buf))) : []))
    .catch(() => []);
}

export async function fetchMp(ctx: SeedContext): Promise<SeedCandidate[]> {
  const day = ctx.day; // YYYY-MM-DD (the far edge of the seed window)
  const events = await fetchList(day);
  const out: SeedCandidate[] = [];
  for (const ev of events) {
    if (!ev.dates.includes(day)) continue;
    const detail = await fetchDetail(ev.code);
    let lat: number | null = null;
    let lng: number | null = null;
    if (ev.city) {
      const g = await resolveGeo({
        name: ev.city, city: ev.city, db: ctx.env.DB,
        provider: ProviderId.MARATONYPOLSKIE, fallback: undefined,
      });
      if (g) { lat = g.lat; lng = g.lng; }
    }
    out.push({
      source: ProviderId.MARATONYPOLSKIE,
      // Multi-day events must key per day — posts.external_id is unique and one
      // day's post would otherwise overwrite the next day's.
      externalId: ev.dates.length > 1
        ? `maratonypolskie-${ev.code}-${day}`
        : `maratonypolskie-${ev.code}`,
      title: ev.name,
      startMs: ctx.dayStart,
      lat, lng,
      city: ev.city,
      venue: ev.distance ? `${ev.city} (${ev.distance})` : ev.city,
      address: '',
      link: detail.officialLink || `${MP_LIST}?dzial=3&action=5&code=${ev.code}&bieganie`,
      mediaUrl: detail.logo || DEFAULT_SPORT_POSTER,
      thumbUrl: null,
      tags: ['sport'],
    });
  }
  return out;
}

export const maratonypolskieProvider: SeedProvider = {
  id: ProviderId.MARATONYPOLSKIE,
  transport: 'fetch',
  fetchCandidates: fetchMp,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: ['all'],
  fetchScope: (ctx, _scope) => fetchMp(ctx),
  pendingByDefault: true,
};
