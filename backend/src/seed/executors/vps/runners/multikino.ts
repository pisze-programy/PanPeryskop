// multikino provider — VPS executor source. ONE request per cinema (no
// showingDate) returns the WHOLE programme; coordinates come from the static
// MK_CINEMAS catalog (no checkpoint geo).
// Usage (from the backend dir): npx tsx src/seed/executors/vps/runners/multikino.ts
import type { ScopeSource } from '../runtime';
import { fetchMkCinema } from '../../../../seed/providers/multikino';
import { mkScopes } from '../../../../seed/core/constants';
import { ProviderId } from '../../../../seed/core/types';

export const multikinoSource: ScopeSource = {
  source: ProviderId.MULTIKINO,
  scopes: () => mkScopes(),
  scopeGeo: () => null,
  fetchScope: (scope, ctx) => fetchMkCinema({ days: ctx.days }, scope),
};

