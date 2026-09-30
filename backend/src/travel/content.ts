import {
  ORIGIN_PAGES, PUBLIC_BASE, dealSlug, destinationSlug, groupPlaces, monthOptions, monthParts,
  originData, renderConnectionsPage, renderDealPage, renderDestinationPage,
  renderIndexPage, renderJson, renderMonthPage, renderPage, type OriginPage,
} from './webpage';
import { foldCity } from './airports';
import { submitIndexNow } from './indexnow';

const PAGE_TTL_MS = 24 * 3_600_000;

export function pageKey(slug: string): string {
  return `plan/${slug}.html`;
}

function contentHash(html: string): string {
  let h = 2166136261;
  for (let i = 0; i < html.length; i++) {
    h ^= html.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

async function putHtml(env: Env, slug: string, html: string): Promise<{ bytes: number; hash: string }> {
  const hash = contentHash(html);
  await env.MEDIA.put(pageKey(slug), html, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    customMetadata: { v: String(Date.now()), h: hash },
  });
  return { bytes: html.length, hash };
}

/** The machine copy of a page. It is written here, with the page, because
 *  rebuilding it on demand takes a minute and a half. */
export async function putOriginJson(env: Env, originId: string, json: string): Promise<void> {
  await env.MEDIA.put(originJsonKey(originId), json, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { v: String(Date.now()) },
  });
}

export function originJsonKey(originId: string): string {
  return `plan/json/${originId}.json`;
}

async function upsertDoc(env: Env, slug: string, originId: string, kind: string, bytes: number, hash: string): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO content_docs (slug, origin_id, kind, bytes, hash, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET origin_id = excluded.origin_id, kind = excluded.kind,
         bytes = excluded.bytes,
         updated_at = CASE WHEN content_docs.hash = excluded.hash THEN content_docs.updated_at ELSE excluded.updated_at END,
         hash = excluded.hash`,
    )
    .bind(slug, originId, kind, bytes, hash, Date.now())
    .run();
}

async function markOriginDone(env: Env, origin: OriginPage): Promise<void> {
  const now = Date.now();
  await env.DB
    .prepare(
      `INSERT INTO content_pages (origin_id, slug, generated_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(origin_id) DO UPDATE SET slug = excluded.slug,
         generated_at = excluded.generated_at, updated_at = excluded.updated_at`,
    )
    .bind(origin.id, origin.slug, now, now)
    .run();
}

async function originDoneAt(env: Env): Promise<Map<string, number>> {
  const { results } = await env.DB
    .prepare('SELECT origin_id, updated_at FROM content_pages')
    .all<{ origin_id: string; updated_at: number }>();
  return new Map((results ?? []).map((row) => [row.origin_id, row.updated_at]));
}

export interface BundleResult {
  origin: string;
  originBytes: number;
  destinations: number;
}

export async function storeOriginBundle(env: Env, origin: OriginPage): Promise<BundleResult> {
  const data = await originData(env, origin.id, true);
  if (!data) throw new Error(`content: no data for ${origin.id}`);
  const places = groupPlaces(data.sections);
  const urls: string[] = [];
  const before = await docHashes(env, origin.id);

  const index = await putHtml(env, 'tanie-loty', renderIndexPage(data.generatedAt));
  await upsertDoc(env, 'tanie-loty', 'index', 'index', index.bytes, index.hash);
  urls.push(`${PUBLIC_BASE}/tanie-loty`);

  const originPut = await putHtml(env, origin.slug, renderPage(data));
  await upsertDoc(env, origin.slug, origin.id, 'origin', originPut.bytes, originPut.hash);
  urls.push(`${PUBLIC_BASE}/${origin.slug}`);
  await putOriginJson(env, origin.id, renderJson(data));

  const dealByCity = new Map(data.featured.map((deal) => [foldCity(deal.offer.city), deal]));
  let destinations = 0;
  for (const place of places) {
    const slug = destinationSlug(origin, place);
    const deal = dealByCity.get(foldCity(place.city));
    const put = await putHtml(env, slug, renderDestinationPage(origin, place, deal, places, data.generatedAt));
    await upsertDoc(env, slug, origin.id, 'destination', put.bytes, put.hash);
    urls.push(`${PUBLIC_BASE}/${slug}`);
    destinations += 1;
  }

  const months = new Set<string>();
  for (const place of places) for (const option of place.options) months.add(option.start.slice(0, 7));
  for (const key of months) {
    const monthSlugPath = `${origin.slug}/${monthParts(key).slug}`;
    const monthPut = await putHtml(env, monthSlugPath, renderMonthPage(origin, places, data.featured, key, data.generatedAt));
    await upsertDoc(env, monthSlugPath, origin.id, 'month', monthPut.bytes, monthPut.hash);
    urls.push(`${PUBLIC_BASE}/${monthSlugPath}`);
    for (const place of places) {
      if (monthOptions(place, key).length === 0) continue;
      const slug = dealSlug(origin, place, key);
      const put = await putHtml(env, slug, renderDealPage(origin, place, dealByCity.get(foldCity(place.city)), key, data.generatedAt));
      await upsertDoc(env, slug, origin.id, 'deal', put.bytes, put.hash);
      urls.push(`${PUBLIC_BASE}/${slug}`);
    }
  }

  const connSlug = `${origin.slug}/polaczenia`;
  const allDestSlugs = await destinationDocs(env, origin.id);
  const extra = allDestSlugs.map((slug) => ({ slug, label: labelFromSlug(origin, slug) }));
  const connPut = await putHtml(env, connSlug, renderConnectionsPage(origin, places, data.generatedAt, extra));
  await upsertDoc(env, connSlug, origin.id, 'connections', connPut.bytes, connPut.hash);
  urls.push(`${PUBLIC_BASE}/${connSlug}`);

  await markOriginDone(env, origin);
  const after = await docHashes(env, origin.id);
  const changed = urls.filter((url) => {
    const slug = url.slice(PUBLIC_BASE.length + 1);
    return (before.get(slug) ?? '') !== (after.get(slug) ?? '');
  });
  await submitIndexNow(changed);

  return { origin: origin.slug, originBytes: originPut.bytes, destinations };
}

async function docHashes(env: Env, originId: string): Promise<Map<string, string>> {
  const { results } = await env.DB
    .prepare('SELECT slug, hash FROM content_docs WHERE origin_id = ?')
    .bind(originId)
    .all<{ slug: string; hash: string }>();
  return new Map((results ?? []).map((row) => [row.slug, row.hash ?? '']));
}

/** Every destination doc for the origin, so the connections page links them all. */
async function destinationDocs(env: Env, originId: string): Promise<string[]> {
  const { results } = await env.DB
    .prepare("SELECT slug FROM content_docs WHERE origin_id = ? AND kind = 'destination'")
    .bind(originId)
    .all<{ slug: string }>();
  return (results ?? []).map((row) => row.slug);
}

function labelFromSlug(origin: OriginPage, slug: string): string {
  const tail = slug.slice(slug.lastIndexOf('-do-') + 4);
  const cut = tail.lastIndexOf(`-z-${origin.slug.replace('tanie-loty-z-', '')}`);
  const city = cut > 0 ? tail.slice(0, cut) : tail;
  return city.charAt(0).toUpperCase() + city.slice(1);
}

export interface ContentDoc {
  slug: string;
  origin_id: string;
  kind: string;
  updated_at: number;
}

export async function docs(env: Env): Promise<ContentDoc[]> {
  const { results } = await env.DB
    .prepare('SELECT slug, origin_id, kind, updated_at FROM content_docs ORDER BY updated_at DESC')
    .all<ContentDoc>();
  return results ?? [];
}

export async function buildNextStale(env: Env): Promise<OriginPage | null> {
  const done = await originDoneAt(env);
  const stale = ORIGIN_PAGES
    .filter((origin) => Date.now() - (done.get(origin.id) ?? 0) > PAGE_TTL_MS)
    .sort((a, b) => (done.get(a.id) ?? 0) - (done.get(b.id) ?? 0));
  const next = stale[0];
  if (!next) return null;
  await storeOriginBundle(env, next);
  return next;
}

export async function coverageReport(env: Env): Promise<{
  origins: number;
  originsPublished: number;
  docs: number;
  byKind: Record<string, number>;
  pages: { slug: string; kind: string; updated_at: number }[];
}> {
  const rows = await docs(env);
  const byKind: Record<string, number> = {};
  for (const row of rows) byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
  const originIds = new Set(rows.filter((row) => row.kind === 'origin').map((row) => row.origin_id));
  return {
    origins: ORIGIN_PAGES.length,
    originsPublished: originIds.size,
    docs: rows.length,
    byKind,
    pages: rows.map((row) => ({ slug: row.slug, kind: row.kind, updated_at: row.updated_at })),
  };
}

export async function docUrls(env: Env, base: string): Promise<string[]> {
  const rows = await docs(env);
  return rows.map((row) => `${base}/${row.slug}`);
}

export interface DocEntry {
  slug: string;
  url: string;
  lastmod: string;
}

export async function docEntries(env: Env, base: string): Promise<DocEntry[]> {
  const rows = await docs(env);
  const pastMonth = new Date().toISOString().slice(0, 7);
  return rows
    .filter((row) => row.kind !== 'deal')
    .filter((row) => row.kind !== 'month' || monthKeyOf(row.slug) >= pastMonth)
    .map((row) => ({
      slug: row.slug,
      url: `${base}/${row.slug}`,
      lastmod: new Date(row.updated_at).toISOString().slice(0, 10),
    }));
}

function monthKeyOf(slug: string): string {
  const months = ['styczen', 'luty', 'marzec', 'kwiecien', 'maj', 'czerwiec', 'lipiec', 'sierpien', 'wrzesien', 'pazdziernik', 'listopad', 'grudzien'];
  const tail = slug.split('/').slice(-1)[0];
  const match = tail.match(/^([a-z]+)-(\d{4})$/);
  if (!match) return '9999-99';
  const idx = months.indexOf(match[1]);
  return idx < 0 ? '9999-99' : `${match[2]}-${String(idx + 1).padStart(2, '0')}`;
}

export async function readStoredPageMeta(env: Env, slug: string): Promise<{ html: string; etag: string; lastModified: string } | null> {
  const object = await env.MEDIA.get(pageKey(slug));
  if (!object) return null;
  const version = object.customMetadata?.v ?? '0';
  const ms = Number(version);
  return {
    html: await object.text(),
    etag: `W/"p-${slug}-${version}"`,
    lastModified: new Date(ms > 0 ? ms : Date.now()).toUTCString(),
  };
}

export async function llmsTxt(env: Env): Promise<string> {
  const rows = await docs(env);
  const origins = rows.filter((row) => row.kind === 'origin').map((row) => `- ${PUBLIC_BASE}/${row.slug}`);
  const sample = rows.filter((row) => row.kind === 'destination').slice(0, 60).map((row) => `- ${PUBLIC_BASE}/${row.slug}`);
  return `# Pan Peryskop

> Mapa lokalnych wydarzeń w Polsce oraz planer wyjazdów: lot, hotel i wydarzenie w jednym miejscu. Aplikacja na iOS; treść dostępna także na stronie, po polsku i po angielsku.

## Trzy rzeczy, które robi

- Lokalne wydarzenia: koncerty, kino, teatr, stand-up, sport i wydarzenia darmowe — na mapie, w Twojej okolicy.
- Wyjazd na wydarzenie w Europie: mecz albo bieg, do tego lot, hotel i bilet.
- City-break bez wydarzeń: sam lot i hotel, gdy chcesz odpocząć.

## Aplikacja

- iOS/iPadOS 18.0+, kategoria Rozrywka, po polsku, bez reklam i bez opłat.
- Logowanie przez Sign in with Apple jest wymagane. Adres e-mail nie jest przechowywany; lokalizacja tylko podczas korzystania z aplikacji.
- 21 miast w Polsce z lokalnymi wydarzeniami.
- Kontakt: kontakt@panperyskop.app

## Strony

- Strona główna: ${PUBLIC_BASE}/
- Strona główna (EN): ${PUBLIC_BASE}/index.en.html
- Polityka prywatności: ${PUBLIC_BASE}/privacy
- Regulamin: ${PUBLIC_BASE}/terms
- Wsparcie: ${PUBLIC_BASE}/support
- App Store: https://apps.apple.com/pl/app/pan-peryskop/id6803138750

## Tanie loty z polskich lotnisk

12 lotnisk wylotu: Poznań, Warszawa, Wrocław, Gdańsk, Kraków, Katowice, Rzeszów, Bydgoszcz, Łódź, Szczecin, Lublin, Olsztyn. Ceny są orientacyjne i zmieniają się u przewoźnika.

${origins.join('\n')}

## Kierunki i terminy (przykład)

${sample.join('\n')}

## Dane maszynowe

- Sitemap: ${PUBLIC_BASE}/sitemap.xml
- Zasięg i liczniki: ${PUBLIC_BASE}/coverage.json
`;
}

