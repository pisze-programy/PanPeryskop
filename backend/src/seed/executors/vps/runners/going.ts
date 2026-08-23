// going provider — VPS executor source. Single Algolia query covers all cities
// (scope 'all'); env keys come from admin/vps/.env via process.env (the
// orchestrator assigns .env into process.env before providers run). There is no
// D1 binding on the VPS — going skips venue upserts (see providers/going.ts).
import type { ScopeSource } from '../runtime';
import { goingProvider } from '../../../../seed/providers/going';
import { ProviderId } from '../../../../seed/core/types';

function goingEnv(): Record<string, unknown> {
  return {
    ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID || '',
    ALGOLIA_API_KEY: process.env.ALGOLIA_API_KEY || '',
    CLOUDINARY_SIG: process.env.CLOUDINARY_SIG || '',
  };
}

export const goingSource: ScopeSource = {
  source: ProviderId.GOING,
  scopes: () => ['all'],
  scopeGeo: () => null,
  fetchScope: (_scope, ctx) =>
    goingProvider.fetchCandidates({
      env: goingEnv() as never,
      day: ctx.days[0],
      dayStart: ctx.windowStart,
      dayEnd: ctx.windowEnd,
      createdAt: Date.now(),
      recordBrowserMs: () => {},
    } as never),
};
