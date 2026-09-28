import {
  ORIGIN_PAGES, PUBLIC_BASE, dealSlug, destinationSlug, groupPlaces, monthOptions, monthParts,
  originBySlug, originData, renderConnectionsPage, renderDealPage, renderDestinationPage,
  renderIndexPage, renderMonthPage, renderPage, type OriginPage,
} from './webpage';
import { foldCity } from './airports';

const PAGE_TTL_MS = 24 * 3_600_000;

export function pageKey(slug: string): string {
  return `plan/${slug}.html`;
}

async function putHtml(env: Env, slug: string, html: string): Promise<number> {
  await env.MEDIA.put(pageKey(slug), html, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
  });
  return html.length;
}

async function upsertDoc(env: Env, slug: string, originId: string, kind: string, bytes: number): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO content_docs (slug, origin_id, kind, bytes, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET origin_id = excluded.origin_id, kind = excluded.kind,
         bytes = excluded.bytes, updated_at = excluded.updated_at`,
    )
    .bind(slug, originId, kind, bytes, Date.now())
    .run();
}

export async function readStoredPage(env: Env, slug: string): Promise<string | null> {
  const object = await env.MEDIA.get(pageKey(slug));
  return object ? object.text() : null;
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

  const indexBytes = await putHtml(env, 'tanie-loty', renderIndexPage(data.generatedAt));
  await upsertDoc(env, 'tanie-loty', 'index', 'index', indexBytes);

  const originBytes = await putHtml(env, origin.slug, renderPage(data));
  await upsertDoc(env, origin.slug, origin.id, 'origin', originBytes);

  const dealByCity = new Map(data.featured.map((deal) => [foldCity(deal.offer.city), deal]));
  let destinations = 0;
  for (const place of places) {
    const slug = destinationSlug(origin, place);
    const deal = dealByCity.get(foldCity(place.city));
    const bytes = await putHtml(env, slug, renderDestinationPage(origin, place, deal, places, data.generatedAt));
    await upsertDoc(env, slug, origin.id, 'destination', bytes);
    destinations += 1;
  }

  const months = new Set<string>();
  for (const place of places) for (const option of place.options) months.add(option.start.slice(0, 7));
  for (const key of months) {
    const monthSlugPath = `${origin.slug}/${monthParts(key).slug}`;
    const monthBytes = await putHtml(env, monthSlugPath, renderMonthPage(origin, places, key, data.generatedAt));
    await upsertDoc(env, monthSlugPath, origin.id, 'month', monthBytes);
    for (const place of places) {
      if (monthOptions(place, key).length === 0) continue;
      const slug = dealSlug(origin, place, key);
      const bytes = await putHtml(env, slug, renderDealPage(origin, place, dealByCity.get(foldCity(place.city)), key, data.generatedAt));
      await upsertDoc(env, slug, origin.id, 'deal', bytes);
    }
  }

  const connSlug = `${origin.slug}/polaczenia`;
  const connBytes = await putHtml(env, connSlug, renderConnectionsPage(origin, places, data.generatedAt));
  await upsertDoc(env, connSlug, origin.id, 'connections', connBytes);

  return { origin: origin.slug, originBytes, destinations };
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
  const rows = await docs(env);
  const latest = new Map<string, number>();
  for (const row of rows) {
    const current = latest.get(row.origin_id) ?? 0;
    if (row.updated_at > current) latest.set(row.origin_id, row.updated_at);
  }
  const stale = ORIGIN_PAGES
    .filter((origin) => Date.now() - (latest.get(origin.id) ?? 0) > PAGE_TTL_MS)
    .sort((a, b) => (latest.get(a.id) ?? 0) - (latest.get(b.id) ?? 0));
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

export async function llmsTxt(env: Env): Promise<string> {
  const rows = await docs(env);
  const origins = rows.filter((row) => row.kind === 'origin').map((row) => `- ${PUBLIC_BASE}/${row.slug}`);
  const sample = rows.filter((row) => row.kind === 'destination').slice(0, 60).map((row) => `- ${PUBLIC_BASE}/${row.slug}`);
  return `# Pan Peryskop - tanie loty i weekendy\n\n> Agregator najtańszych weekendów z polskich lotnisk. Loty, hotele i wydarzenia.\n\n## Lotniska\n${origins.join('\n')}\n\n## Kierunki (przykład)\n${sample.join('\n')}\n\n## Dane maszynowe\n- JSON: ${PUBLIC_BASE}/plan/json/{miasto}\n- Sitemap: ${PUBLIC_BASE}/sitemap.xml\n`;
}

export function slugToOrigin(slug: string): OriginPage | null {
  return originBySlug(slug);
}
