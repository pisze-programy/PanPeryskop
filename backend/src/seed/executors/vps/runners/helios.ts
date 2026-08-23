// helios provider — VPS executor source. One request per cinema returns the FULL
// repertoire (~25 days), so a scope fetches once and is parsed for every window
// day (mirrors multikino: 1 req per cinema covers the whole seed window). The
// static catalog provides the dedupe/reject anchor (lat/lng).
import { HELIOS_CINEMAS, HELIOS_SCREENINGS, HELIOS_TIMEOUT_MS } from '../../../../seed/core/constants';
import { parseHeliosPayload } from '../../../../seed/providers/helios';
import { UA_HEADERS } from '../../../../seed/providers/http';
import type { ScopeSource } from '../runtime';
import { ProviderId } from '../../../../seed/core/types';
import type { SeedCandidate } from '../../../../seed/core/types';

export const heliosSource: ScopeSource = {
  source: ProviderId.HELIOS,
  scopes: () => HELIOS_CINEMAS.map((c) => String(c.id)),
  scopeGeo: (scope) => {
    const c = HELIOS_CINEMAS.find((x) => String(x.id) === scope);
    return c ? { lat: c.lat, lng: c.lng } : null;
  },
  fetchScope: async (scope, ctx) => {
    const id = Number(scope);
    const res = await fetch(HELIOS_SCREENINGS(id), {
      headers: { 'User-Agent': UA_HEADERS['User-Agent'], 'Accept-Language': 'pl', Accept: 'application/json' },
      signal: AbortSignal.timeout(HELIOS_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`helios ${id} -> ${res.status}`);
    const body = (await res.json()) as { data?: unknown };
    const out: SeedCandidate[] = [];
    for (const day of ctx.days) out.push(...parseHeliosPayload(body.data || {}, id, day));
    return out;
  },
};
