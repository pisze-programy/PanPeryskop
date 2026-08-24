// Single source of truth for every seed provider's OPERATIONAL config:
//   enabled   — master switch (the ONLY place to turn a provider on/off).
//   priority  — canonical rank for cross-provider dedupe (lowest wins).
//   executors — the execution methods ("sposoby wykonywania") this provider is
//               assigned to, plus executor-specific config. Present key = runs
//               there; e.g. `executors: { worker: true }` → CF Workers edge,
//               `executors: { vps: {...} }` → VPS residential-egress runner.
//               Moving a provider to another executor (even despite Cloudflare
//               blocking the Worker egress) is a config change, not a code one.
//
// Implementation facts (fetch logic, transport, scopes) stay in the per-provider
// files — this registry is config, not code. The Worker, dedupe, every executor
// and the runners all read from HERE, never from their own copy.
import { ProviderId, ProviderTransport } from '../core/types';
import { ExecutorId, EXECUTOR } from '../executors/types';

export interface VpsSpec {
  /** Output JSON staged for seed-ingest, relative to admin/seed. */
  output: string;
  /** Poster media dir, relative to admin/seed. */
  mediaDir: string;
  /** Checkpoint file, relative to admin/vps/logs. */
  checkpoint: string;
  // Every provider covers the same seed window [today, today+SEED_DAYS_AHEAD]
  // (see core/constants.ts) — the target/window is NOT per-provider config.
}

export interface ProviderConfig {
  id: ProviderId;
  transport: ProviderTransport;
  enabled: boolean;
  priority: number;
  executors: {
    /** present → runs in the CF Workers queue pipeline. */
    worker?: true;
    /** present → runs on the VPS executor with this spec. */
    vps?: VpsSpec;
  };
}

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  // ---- Worker executor (CF Workers edge) ---------------------------------
  // Only kupbilecik stays on the Worker: it needs the BROWSER binding (Bot Fight
  // Mode blocks plain fetch, and Browser Run is free within the 10h/month budget).
  {
    id: ProviderId.KUPBILECIK, transport: 'browser', enabled: true, priority: 3,
    executors: { worker: true },
  },
  {
    id: ProviderId.DZISAPP, transport: 'fetch', enabled: false, priority: 4,
    executors: { worker: true },
  },
  {
    id: ProviderId.EVENTYLIVE, transport: 'fetch', enabled: false, priority: 5,
    executors: { worker: true },
  },
  // maratonypolskie.pl — ready but NOT yet enabled in production (pending the
  // user's go: logo fix + autoapprove decision). Flip `enabled` + deploy when approved.
  {
    id: ProviderId.MARATONYPOLSKIE, transport: 'fetch', enabled: false, priority: 7,
    executors: { worker: true },
  },
  // ---- VPS executor (residential egress — Cloudflare bot management 403s the
  //      Worker's datacenter IPs; fetched by the VPS runners, uploaded via
  //      seed-ingest). Every provider covers the SAME seed window. --------
  {
    id: ProviderId.HELIOS, transport: 'fetch', enabled: true, priority: 0,
    executors: {
      vps: {
        output: 'helios.json', mediaDir: 'helios-media',
        checkpoint: 'helios-checkpoint.json',
      },
    },
  },
  {
    id: ProviderId.GOING, transport: 'fetch', enabled: true, priority: 2,
    executors: {
      vps: {
        output: 'events-going.json', mediaDir: 'events-going-media',
        checkpoint: 'events-going-checkpoint.json',
      },
    },
  },
  {
    id: ProviderId.MULTIKINO, transport: 'fetch', enabled: true, priority: 0,
    executors: {
      vps: {
        output: 'multikino.json', mediaDir: 'multikino-media',
        checkpoint: 'multikino-checkpoint.json',
      },
    },
  },
  {
    id: ProviderId.CINEMACITY, transport: 'fetch', enabled: true, priority: 0,
    executors: {
      vps: {
        output: 'cinemacity.json', mediaDir: 'cinemacity-media',
        checkpoint: 'cinemacity-checkpoint.json',
      },
    },
  },
  {
    id: ProviderId.LUMA, transport: 'fetch', enabled: true, priority: 1,
    executors: {
      vps: {
        output: 'events-luma.json', mediaDir: 'events-luma-media',
        checkpoint: 'events-luma-checkpoint.json',
      },
    },
  },
  {
    id: ProviderId.MEETUP, transport: 'fetch', enabled: true, priority: 6,
    executors: {
      vps: {
        output: 'events-meetup.json', mediaDir: 'events-meetup-media',
        checkpoint: 'events-meetup-checkpoint.json',
      },
    },
  },
  // ---- Manual provider (no executor): Facebook events are ingested by hand from
  //      the browser addon via POST /admin/seed/facebook. Never runs in cron; the
  //      priority still feeds cross-provider dedupe (below kupbilecik, above
  //      dzisapp/eventylive — facebook events are often covered by ticket sellers).
  {
    id: ProviderId.FACEBOOK, transport: 'manual', enabled: true, priority: 3.5,
    executors: {},
  },
];

const byId = new Map(PROVIDER_CONFIGS.map((c) => [c.id, c]));

export const configOf = (id: ProviderId): ProviderConfig | undefined => byId.get(id);

/** Provider configs assigned to (and enabled on) the given executor. */
export function enabledForExecutor(executorId: ExecutorId): ProviderConfig[] {
  return PROVIDER_CONFIGS.filter((c) => c.enabled && c.executors[executorId] !== undefined);
}

/** Canonical rank for cross-provider dedupe — lower wins. Unknown sources rank last. */
export function priorityOf(id: ProviderId): number {
  return byId.get(id)?.priority ?? 99;
}

export { EXECUTOR };
