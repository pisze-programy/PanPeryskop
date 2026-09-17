import { CONFIG } from '../config/index';
import { addDaysWarsaw, todayWarsaw } from '../seed/core/dates';

// Viator affiliate API (tours & activities). Partner traps worth knowing:
// `pagination.count` is capped at 50 (verified live), content exists only in
// `en-US` and similar (no Polish), `productUrl` carries our affiliate tracking and
// must be used unmodified, and review text must not be re-published.

/** Structural env slice so this module also runs in tests/VPS without the worker Env. */
export interface ViatorEnv {
  VIATOR_API_KEY?: string;
  VIATOR_API_KEY_SANDBOX?: string;
  VIATOR_ENV?: string;
}

interface Credentials {
  base: string;
  key: string;
}

export interface ViatorCity {
  destinationId: number;
  name: string;
  lat: number | null;
  lng: number | null;
}

export interface ViatorProductRow {
  productCode: string;
  title: string;
  imageUrl: string | null;
  fromPrice: number | null;
  currency: string | null;
  durationMinutes: number | null;
  rating: number | null;
  reviewCount: number | null;
  productUrl: string;
  badges: string[];
}

interface RawImageVariant {
  url?: string;
  width?: number;
  height?: number;
}

interface RawImage {
  isCover?: boolean;
  variants?: RawImageVariant[];
}

interface RawDuration {
  fixedDurationInMinutes?: number | null;
  variableDurationFromMinutes?: number | null;
  variableDurationToMinutes?: number | null;
}

interface RawProduct {
  productCode?: string;
  title?: string;
  images?: RawImage[];
  duration?: RawDuration | null;
  reviews?: { totalReviews?: number; combinedAverageRating?: number } | null;
  pricing?: { summary?: { fromPrice?: number } | null; currency?: string | null } | null;
  productUrl?: string;
  flags?: string[];
}

interface RawDestination {
  destinationId?: number;
  name?: string;
  type?: string;
  parentDestinationId?: number | null;
  iataCodes?: string[] | null;
  center?: { latitude?: number; longitude?: number } | null;
  defaultCurrencyCode?: string | null;
  timeZone?: string | null;
}

interface SearchResponse {
  products?: RawProduct[];
  totalCount?: number;
}

interface DestinationsResponse {
  destinations?: RawDestination[];
}

interface CityCacheRow {
  total: number;
  pages: number;
  fetchedAt: number;
}

function credentials(env: ViatorEnv): Credentials | null {
  const sandbox = env.VIATOR_ENV === 'sandbox';
  const key = (sandbox ? env.VIATOR_API_KEY_SANDBOX : env.VIATOR_API_KEY)?.trim();
  if (!key) return null;
  return {
    base: sandbox ? CONFIG.travel.viator.hosts.sandbox : CONFIG.travel.viator.hosts.production,
    key,
  };
}

export function viatorConfigured(env: ViatorEnv): boolean {
  return credentials(env) !== null;
}

async function viatorRequest<T>(
  cred: Credentials,
  path: string,
  init?: { method: string; body: unknown },
): Promise<T> {
  const url = `${cred.base}${path}`;
  let lastError = `viator ${path} failed`;
  for (let attempt = 0; attempt <= CONFIG.travel.viator.retries; attempt++) {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        'exp-api-key': cred.key,
        Accept: `application/json;version=${CONFIG.travel.viator.apiVersion}`,
        'Accept-Language': CONFIG.travel.viator.language,
        ...(init ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(CONFIG.travel.viator.timeoutMs),
    });
    if (res.ok) return (await res.json()) as T;
    const detail = await res.text().catch(() => '');
    lastError = `viator ${res.status} ${detail.slice(0, 200)}`;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === CONFIG.travel.viator.retries) break;
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : CONFIG.travel.viator.retryDelayMs * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error(lastError);
}

/** Partner cadence: weekly. */
export async function refreshViatorDestinations(db: D1Database, env: ViatorEnv): Promise<number> {
  const cred = credentials(env);
  if (!cred) throw new Error('viator: missing api key');
  const body = await viatorRequest<DestinationsResponse>(cred, '/destinations');
  const rows = (body.destinations ?? []).filter(
    (d): d is RawDestination & { destinationId: number; name: string } =>
      typeof d.destinationId === 'number' && typeof d.name === 'string' && d.name.length > 0,
  );
  const now = Date.now();
  const statements = rows.map((d) =>
    db
      .prepare(
        `INSERT INTO viator_destinations
           (destination_id, name, type, parent_id, iata_codes, lat, lng, currency, time_zone, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(destination_id) DO UPDATE SET
           name = excluded.name, type = excluded.type, parent_id = excluded.parent_id,
           iata_codes = excluded.iata_codes, lat = excluded.lat, lng = excluded.lng,
           currency = excluded.currency, time_zone = excluded.time_zone, updated_at = excluded.updated_at`,
      )
      .bind(
        d.destinationId,
        d.name,
        d.type ?? '',
        d.parentDestinationId ?? null,
        d.iataCodes && d.iataCodes.length > 0 ? JSON.stringify(d.iataCodes) : null,
        d.center?.latitude ?? null,
        d.center?.longitude ?? null,
        d.defaultCurrencyCode ?? null,
        d.timeZone ?? null,
        now,
      ),
  );
  for (let i = 0; i < statements.length; i += CONFIG.travel.batchCap) {
    await db.batch(statements.slice(i, i + CONFIG.travel.batchCap));
  }
  // Drop destinations the partner no longer returns (merged/removed ids would
  // otherwise stay in our copy forever).
  await db.prepare(`DELETE FROM viator_destinations WHERE updated_at < ?1`).bind(now).run();
  return rows.length;
}

/**
 * TEMPORARY: returns a pseudo-random city (stable per anchor, so the same event
 * keeps the same city between opens). The real anchor → city matcher comes later;
 * this exists so the section can be built and reviewed end to end.
 */
export async function viatorRandomCity(db: D1Database, lat: number, lng: number): Promise<ViatorCity | null> {
  const count = await db
    .prepare(`SELECT COUNT(*) AS n FROM viator_destinations WHERE type = 'CITY' AND iata_codes IS NOT NULL`)
    .first<{ n: number }>();
  const total = count?.n ?? 0;
  if (total === 0) return null;
  let hash = 2166136261;
  for (const char of `${lat.toFixed(3)},${lng.toFixed(3)}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const offset = (hash >>> 0) % total;
  return db
    .prepare(
      `SELECT destination_id AS destinationId, name, lat, lng
         FROM viator_destinations
        WHERE type = 'CITY' AND iata_codes IS NOT NULL
        ORDER BY destination_id
        LIMIT 1 OFFSET ?1`,
    )
    .bind(offset)
    .first<ViatorCity>();
}

export function viatorPickImage(images: RawImage[] | undefined): string | null {
  const cover = images?.find((image) => image.isCover) ?? images?.[0];
  const variants = (cover?.variants ?? []).filter((v): v is RawImageVariant & { url: string } => typeof v.url === 'string');
  if (variants.length === 0) return null;
  const best =
    variants.find((v) => v.width === 800 && v.height === 600) ??
    [...variants].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return best?.url ?? null;
}

export function viatorDurationMinutes(duration: RawDuration | null | undefined): number | null {
  const fixed = duration?.fixedDurationInMinutes;
  if (typeof fixed === 'number' && fixed > 0) return fixed;
  const from = duration?.variableDurationFromMinutes;
  if (typeof from === 'number' && from > 0) return from;
  return null;
}

// The first badge is the card pill.
export function viatorBadges(flags: string[] | undefined): string[] {
  const present = new Set(flags ?? []);
  return CONFIG.travel.viator.badgeFlags
    .filter(([, flag]) => present.has(flag))
    .map(([badge]) => badge);
}

// LIKELY_TO_SELL_OUT is the partner's own popularity signal.
export function viatorRank(products: RawProduct[]): RawProduct[] {
  const bestSeller = (p: RawProduct) => ((p.flags ?? []).includes('LIKELY_TO_SELL_OUT') ? 0 : 1);
  return [...products].sort(
    (a, b) =>
      bestSeller(a) - bestSeller(b) ||
      (b.reviews?.totalReviews ?? 0) - (a.reviews?.totalReviews ?? 0) ||
      (b.reviews?.combinedAverageRating ?? 0) - (a.reviews?.combinedAverageRating ?? 0) ||
      (a.pricing?.summary?.fromPrice ?? Infinity) - (b.pricing?.summary?.fromPrice ?? Infinity),
  );
}

function isUsableProduct(p: RawProduct): p is RawProduct & { productCode: string; title: string; productUrl: string } {
  return (
    typeof p.productCode === 'string' && p.productCode.length > 0 &&
    typeof p.title === 'string' && p.title.length > 0 &&
    typeof p.productUrl === 'string' && p.productUrl.length > 0
  );
}

export interface ViatorWindow {
  start: string;
  end: string;
}

/** Trip day ± the configured days. The partner rejects dates in the past. */
export function viatorWindowFor(day?: string): ViatorWindow {
  const { windowDaysBefore, windowDaysAfter } = CONFIG.travel.viator;
  const today = todayWarsaw();
  const base = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
  const start = addDaysWarsaw(base, -windowDaysBefore);
  return {
    start: start < today ? today : start,
    end: addDaysWarsaw(base, windowDaysAfter),
  };
}

function cacheKey(destinationId: number, window: ViatorWindow): string {
  return `${destinationId}|${window.start}|${window.end}`;
}

async function loadPage(
  db: D1Database,
  cred: Credentials,
  destinationId: number,
  window: ViatorWindow,
  page: number,
  replacing: boolean,
): Promise<void> {
  const { pageSize, currency } = CONFIG.travel.viator;
  const key = cacheKey(destinationId, window);
  const body = await viatorRequest<SearchResponse>(cred, '/products/search', {
    method: 'POST',
    body: {
      filtering: { destination: String(destinationId), startDate: window.start, endDate: window.end },
      sorting: { sort: 'DEFAULT' },
      pagination: { start: (page - 1) * pageSize + 1, count: pageSize },
      currency,
    },
  });
  const total = typeof body.totalCount === 'number' ? body.totalCount : 0;
  const raw = (body.products ?? []).filter(isUsableProduct);
  // Never wipe a populated window: an empty or partial answer keeps the old rows.
  if (replacing && raw.length === 0) return;
  const ordered = page === 1 ? viatorRank(raw) : raw;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  if (replacing) {
    statements.push(db.prepare(`DELETE FROM viator_products WHERE cache_key = ?1`).bind(key));
  }
  ordered.forEach((p, index) =>
    statements.push(
      db
        .prepare(
          `INSERT INTO viator_products
             (cache_key, product_code, position, title, image_url, from_price, currency,
              duration_minutes, rating, review_count, product_url, flags, fetched_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
           ON CONFLICT(cache_key, product_code) DO UPDATE SET
             position = excluded.position, title = excluded.title, image_url = excluded.image_url,
             from_price = excluded.from_price, currency = excluded.currency,
             duration_minutes = excluded.duration_minutes, rating = excluded.rating,
             review_count = excluded.review_count, product_url = excluded.product_url,
             flags = excluded.flags, fetched_at = excluded.fetched_at`,
        )
        .bind(
          key,
          p.productCode,
          (page - 1) * pageSize + index + 1,
          p.title,
          viatorPickImage(p.images),
          p.pricing?.summary?.fromPrice ?? null,
          p.pricing?.currency ?? currency,
          viatorDurationMinutes(p.duration),
          p.reviews?.combinedAverageRating ?? null,
          p.reviews?.totalReviews ?? null,
          p.productUrl,
          JSON.stringify(p.flags ?? []),
          now,
        ),
    ),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO viator_city_cache (cache_key, destination_id, window_start, window_end, total, pages, fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(cache_key) DO UPDATE SET
           total = excluded.total,
           pages = excluded.pages,
           fetched_at = excluded.fetched_at`,
      )
      .bind(key, destinationId, window.start, window.end, total, page, now),
  );
  for (let i = 0; i < statements.length; i += CONFIG.travel.batchCap) {
    await db.batch(statements.slice(i, i + CONFIG.travel.batchCap));
  }
}

// Cache is filled lazily: absent or expired → one partner page; later pages only
// when a caller asks past what we already stored. Never calls the partner on a hit.
export async function viatorProductsForCity(
  db: D1Database,
  env: ViatorEnv,
  destinationId: number,
  window: ViatorWindow,
  offset: number,
  limit: number,
): Promise<{ places: ViatorProductRow[]; total: number }> {
  const cred = credentials(env);
  if (!cred) return { places: [], total: 0 };
  const pageSize = CONFIG.travel.viator.pageSize;
  const key = cacheKey(destinationId, window);
  const cached = await db
    .prepare(`SELECT total, pages, fetched_at AS fetchedAt FROM viator_city_cache WHERE cache_key = ?1`)
    .bind(key)
    .first<CityCacheRow>();
  const stale = !cached || Date.now() - cached.fetchedAt > CONFIG.travel.viator.cacheTtlMs;
  try {
    if (stale) {
      await loadPage(db, cred, destinationId, window, 1, true);
    } else if (offset + limit > cached.pages * pageSize && offset < cached.total) {
      await loadPage(db, cred, destinationId, window, cached.pages + 1, false);
    }
  } catch (error) {
    // Serve whatever we already have rather than failing the whole section.
    console.error(`viator: load failed for ${destinationId}: ${(error as Error).message}`);
  }
  const { results } = await db
    .prepare(
      `SELECT product_code AS productCode, title, image_url AS imageUrl, from_price AS fromPrice,
              currency, duration_minutes AS durationMinutes, rating, review_count AS reviewCount,
              product_url AS productUrl, flags
         FROM viator_products
        WHERE cache_key = ?1
        ORDER BY position
        LIMIT ?2 OFFSET ?3`,
    )
    .bind(key, limit, offset)
    .all<ViatorProductRow & { flags: string | null }>();
  const places = (results ?? []).map((row) => ({
    ...row,
    badges: viatorBadges(safeParseFlags(row.flags)),
  }));
  const meta = await db
    .prepare(`SELECT total FROM viator_city_cache WHERE cache_key = ?1`)
    .bind(key)
    .first<{ total: number }>();
  return { places, total: meta?.total ?? places.length };
}

function safeParseFlags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
