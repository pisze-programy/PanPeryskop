// Luma provider — VPS executor ScopeSource (imported by the orchestrator, run in-process).
import { checkpointGeoStore } from '../runtime';
import type { ScopeSource } from '../runtime';
import { fetchLumaCity } from '../../../../seed/providers/luma';
import { CITIES, cityById } from '../../../../admin/cities';
import { ProviderId } from '../../../../seed/core/types';

export const lumaSource: ScopeSource = {
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
};

