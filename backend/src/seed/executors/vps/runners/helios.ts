// helios provider — VPS executor source. One request per cinema returns the FULL
// repertoire (~25 days), so a scope fetches once and is parsed for every window
// day (mirrors multikino: 1 req per cinema covers the whole seed window). The
// static catalog provides the dedupe/reject anchor (lat/lng).
import { HELIOS_CINEMAS, HELIOS_SCREENINGS, HELIOS_TIMEOUT_MS, heliosScopes } from '../../../../seed/core/constants';
import { parseHeliosPayload } from '../../../../seed/providers/helios';
import { UA_HEADERS } from '../../../../seed/providers/http';
import type { ScopeSource } from '../runtime';
import { ProviderId } from '../../../../seed/core/types';
import type { SeedCandidate } from '../../../../seed/core/types';

export const heliosSource: ScopeSource = {
  source: ProviderId.HELIOS,
  scopes: () => heliosScopes(),
  scopeGeo: (scope) => {
    const c = HELIOS_CINEMAS.find((x) => x.id === scope);
    if (!c || c.lat === undefined || c.lng === undefined) return null;
    return { lat: c.lat, lng: c.lng };
  },
  fetchScope: async (scope, ctx) => {
    const res = await fetch(HELIOS_SCREENINGS(Number(scope)), {
      headers: { 'User-Agent': UA_HEADERS['User-Agent'], 'Accept-Language': 'pl', Accept: 'application/json' },
      signal: AbortSignal.timeout(HELIOS_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`helios ${scope} -> ${res.status}`);
    const body = (await res.json()) as { data?: unknown };
    const out: SeedCandidate[] = [];
    for (const day of ctx.days) out.push(...parseHeliosPayload(body.data || {}, scope, day));
    return out;
  },
};
