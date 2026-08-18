// multikino provider — VPS executor runner. One file per provider; only wires
// the provider's fetch into the shared scope model. ONE request per cinema
// (no showingDate) returns the WHOLE programme, so the seed window is covered
// by a single call per cinema. Cinema geo is cached in the checkpoint.
// Usage (from the backend dir): npx tsx src/seed/executors/vps/runners/multikino.ts
import { runScopeSource, checkpointMkGeoStore } from '../runtime';
import { fetchMkCinema } from '../../../../seed/providers/multikino';
import { mkScopes } from '../../../../seed/core/constants';
import { ProviderId } from '../../../../seed/core/types';

runScopeSource({
  source: ProviderId.MULTIKINO,
  scopes: () => mkScopes(),
  // The MK catalog has no coordinates — the reject anchor falls back to the
  // first candidate's resolved cinema geo.
  scopeGeo: () => null,
  fetchScope: (scope, ctx) => fetchMkCinema({ days: ctx.days, geoStore: checkpointMkGeoStore(ctx.cp) }, scope),
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
