// Shared seed types + provider abstraction. Each source (goingapp, kupbilecik, ...)
// is a SeedProvider with its own transport ('fetch' | 'browser'). The runner
// iterates providers, logs per-run stats to D1, and sums Browser Run time.

export type ProviderTransport = 'fetch' | 'browser';
export type RunType = 'manual' | 'cron';

export interface SeedCandidate {
  source: string;
  externalId: string;
  title: string;
  startMs: number;
  lat: number | null;
  lng: number | null;
  city: string;
  venue: string;
  address: string;
  link: string;
  mediaUrl: string;
  thumbUrl: string | null;
  isSoldOut?: boolean;
}

export interface SeedProviderResult {
  provider: string;
  transport: ProviderTransport;
  candidates: number;
  ingested: number;
  skipped: number;
  errors: { externalId: string; error: string }[];
  durationMs: number;
  browserMs: number;
}

export interface SeedResult {
  day: string;
  runType: RunType;
  providers: SeedProviderResult[];
  total: {
    candidates: number;
    ingested: number;
    skipped: number;
    errors: number;
    durationMs: number;
    browserMs: number;
  };
  budget: { monthMs: number; limitMs: number; exceeded: boolean } | null;
}

export interface SeedContext {
  env: Env;
  day: string;
  dayStart: number;
  dayEnd: number;
  createdAt: number;
  recordBrowserMs: (ms: number) => void;
}

export interface SeedProvider {
  id: string;
  transport: ProviderTransport;
  enabled: boolean;
  /** Fetch candidates for the target day. Must call ctx.recordBrowserMs for browser time. */
  fetchCandidates(ctx: SeedContext): Promise<SeedCandidate[]>;
  /** Download media bytes (poster / thumb). Browser transport may proxy through Browser Run. */
  fetchBytes(ctx: SeedContext, url: string): Promise<Uint8Array>;
  /** Parallel fetch scopes (per city / per category). Each becomes its own queue message. */
  scopes: string[];
  /** Fetch one scope. Used by the queue consumer to parallelize across cities/categories. */
  fetchScope(ctx: SeedContext, scope: string): Promise<SeedCandidate[]>;
}
