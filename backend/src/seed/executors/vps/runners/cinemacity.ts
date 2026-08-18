// cinemacity provider — VPS executor source. The quickbook API is PER-DAY
// (at-date/{date} → exactly one day, no bulk variant), so each cinema scope
// fetches every window day sequentially.
// Usage (from the backend dir): npx tsx src/seed/executors/vps/runners/cinemacity.ts
import { sleep, PACING_MS } from '../runtime';
import type { ScopeSource } from '../runtime';
import { fetchCcCinema } from '../../../../seed/providers/cinemacity';
import { ccScopes, CC_CINEMAS } from '../../../../seed/core/constants';
import { ProviderId } from '../../../../seed/core/types';
import type { SeedCandidate } from '../../../../seed/core/types';

export const cinemacitySource: ScopeSource = {
  source: ProviderId.CINEMACITY,
  scopes: () => ccScopes(),
  scopeGeo: (scope) => {
    const c = CC_CINEMAS.find((x) => x.code === scope);
    return c ? { lat: c.lat, lng: c.lng } : null;
  },
  fetchScope: async (scope, ctx) => {
    const out: SeedCandidate[] = [];
    for (const day of ctx.days) {
      out.push(...await fetchCcCinema(day, scope));
      await sleep(PACING_MS);
    }
    return out;
  },
};

