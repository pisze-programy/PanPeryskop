// luma provider — VPS executor runner. One file per provider; only wires the
// provider's fetch (cities = scopes) into the shared scope model. Every provider
// covers the same seed window [today, today+SEED_DAYS_AHEAD].
// Usage (from the backend dir): npx tsx src/seed/executors/vps/runners/luma.ts
import { runScopeSource, checkpointGeoStore } from '../runtime';
import { fetchLumaCity } from '../../../../seed/providers/luma';
import { CITIES, cityById } from '../../../../admin/cities';
import { ProviderId } from '../../../../seed/core/types';

runScopeSource({
  source: ProviderId.LUMA,
  scopes: () => CITIES.map((c) => c.id),
  scopeGeo: (scope) => {
    const c = cityById(scope);
    return c ? { lat: c.lat, lng: c.lng } : null;
  },
  fetchScope: (scope, ctx) => {
    const fetchOpts = {
      day: ctx.days[0],
      dayStart: ctx.windowStart,
      dayEnd: ctx.windowEnd,
      geoStore: checkpointGeoStore(ctx.cp),
    };
    return fetchLumaCity(
      { day: fetchOpts.day, dayStart: fetchOpts.dayStart, dayEnd: fetchOpts.dayEnd },
      scope,
      fetchOpts,
    );
  },
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
