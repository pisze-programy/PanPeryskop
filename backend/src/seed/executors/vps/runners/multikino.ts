// multikino provider — VPS executor source. ONE request per cinema (no
// showingDate) returns the WHOLE programme; cinema geo cached in the checkpoint.
// Usage (from the backend dir): npx tsx src/seed/executors/vps/runners/multikino.ts
import { checkpointMkGeoStore } from '../runtime';
import type { ScopeSource } from '../runtime';
import { fetchMkCinema } from '../../../../seed/providers/multikino';
import { mkScopes } from '../../../../seed/core/constants';
import { ProviderId } from '../../../../seed/core/types';

export const multikinoSource: ScopeSource = {
  source: ProviderId.MULTIKINO,
  scopes: () => mkScopes(),
  // The MK catalog has no coordinates — the reject anchor falls back to the
  // first candidate's resolved cinema geo.
  scopeGeo: () => null,
  fetchScope: (scope, ctx) => fetchMkCinema({ days: ctx.days, geoStore: checkpointMkGeoStore(ctx.cp) }, scope),
};

