// going provider — VPS executor source. Single Algolia query covers all cities
// (scope 'all'); env keys come from admin/vps/.env via process.env (the
// orchestrator assigns .env into process.env before providers run). There is no
// D1 binding on the VPS — going skips venue upserts (see providers/going.ts).
//
// TradeDoubler affiliate: api.tradedoubler.com rejects CF Workers egress, so the
// feed (fid 46830) is downloaded HERE, once per version — lastUpdated-gated and
// disk-cached (admin/seed/td-going.json) so the 3-downloads/24h-per-version
// quota is never burned. The built slug→click map rides into the provider via
// env.GOING_TD_MAP; every failure falls back to plain links (the run never
// fails on an affiliate hiccup).
import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import type { ScopeSource } from '../runtime';
import { SEED_DIR } from '../runtime';
import { goingProvider } from '../../../../seed/providers/going';
import { ProviderId } from '../../../../seed/core/types';
import {
  buildGoingTdMap,
  downloadGoingTdProducts,
  goingTdVersion,
  type GoingTdProduct,
} from '../../../../seed/core/goingTd';

const GOING_TD_CACHE = join(SEED_DIR, 'td-going.json');

interface TdCache {
  version: string;
  products: GoingTdProduct[];
}

function readTdCache(): TdCache | null {
  if (!existsSync(GOING_TD_CACHE)) return null;
  try {
    return JSON.parse(readFileSync(GOING_TD_CACHE, 'utf8')) as TdCache;
  } catch {
    return null;
  }
}

function writeTdCache(version: string, products: GoingTdProduct[]): void {
  const tmp = GOING_TD_CACHE + '.tmp';
  writeFileSync(tmp, JSON.stringify({ version, products }));
  renameSync(tmp, GOING_TD_CACHE);
}

async function goingEnv(): Promise<Record<string, unknown>> {
  const base = {
    ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID || '',
    ALGOLIA_API_KEY: process.env.ALGOLIA_API_KEY || '',
    CLOUDINARY_SIG: process.env.CLOUDINARY_SIG || '',
  };
  const token = process.env.EBILET_TD_TOKEN || process.env.GOING_TD_TOKEN || '';
  if (!token) {
    console.warn('going: no TradeDoubler token (EBILET_TD_TOKEN/GOING_TD_TOKEN) — affiliate links skipped');
    return base;
  }
  const cached = readTdCache();
  try {
    const version = await goingTdVersion(token);
    if (cached && (version === null || cached.version === version)) {
      const { map, stats } = buildGoingTdMap(cached.products);
      console.log(`going affiliate: cache hit (v${cached.version}) map=${stats.matched}/${stats.products} ambiguous=${stats.ambiguous}`);
      return { ...base, GOING_TD_MAP: map };
    }
    const products = await downloadGoingTdProducts(token);
    writeTdCache(version ?? 'unknown', products);
    const { map, stats } = buildGoingTdMap(products);
    console.log(`going affiliate: downloaded v${version} map=${stats.matched}/${stats.products} ambiguous=${stats.ambiguous}`);
    return { ...base, GOING_TD_MAP: map };
  } catch (e) {
    console.warn(`going affiliate: TD failed (${(e as Error).message}) — falling back to cached copy`);
    if (cached) {
      const { map } = buildGoingTdMap(cached.products);
      return { ...base, GOING_TD_MAP: map };
    }
    return base;
  }
}

export const goingSource: ScopeSource = {
  source: ProviderId.GOING,
  scopes: () => ['all'],
  scopeGeo: () => null,
  fetchScope: async (_scope, ctx) =>
    goingProvider.fetchCandidates({
      env: (await goingEnv()) as never,
      day: ctx.days[0],
      dayStart: ctx.windowStart,
      dayEnd: ctx.windowEnd,
      createdAt: Date.now(),
      recordBrowserMs: () => {},
    } as never),
};
