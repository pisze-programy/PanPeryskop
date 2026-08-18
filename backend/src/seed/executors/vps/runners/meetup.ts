// meetup provider — VPS executor source. Exported ScopeSource wired into the
// shared scope model; runs standalone only when executed directly.
// Usage (from the backend dir): npx tsx src/seed/executors/vps/runners/meetup.ts
import { checkpointGeoStore } from '../runtime';
import type { ScopeSource } from '../runtime';
import { fetchMeetupCity } from '../../../../seed/providers/meetup';
import { CITIES, cityById } from '../../../../admin/cities';
import { ProviderId } from '../../../../seed/core/types';

export const meetupSource: ScopeSource = {
  source: ProviderId.MEETUP,
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
    return fetchMeetupCity(
      { day: fetchOpts.day, dayStart: fetchOpts.dayStart, dayEnd: fetchOpts.dayEnd },
      scope,
      fetchOpts,
    );
  },
};

