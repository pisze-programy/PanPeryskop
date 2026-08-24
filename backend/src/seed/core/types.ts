// Shared seed types + provider abstraction. Each source (goingapp, kupbilecik, ...)
// is a SeedProvider with its own transport ('fetch' | 'browser'). The runner
// iterates providers, logs per-run stats to D1, and sums Browser Run time.

export type ProviderTransport = 'fetch' | 'browser' | 'manual';
export type RunType = 'manual' | 'cron';

/** Seed providers — the string values persist to D1 (seed_candidates.provider, posts.external_id prefix). */
export const ProviderId = {
  GOING: 'going',
  KUPBILECIK: 'kupbilecik',
  DZISAPP: 'dzisapp',
  EVENTYLIVE: 'eventylive',
  MULTIKINO: 'multikino',
  CINEMACITY: 'cinemacity',
  HELIOS: 'helios',
  LUMA: 'luma',
  MEETUP: 'meetup',
  MARATONYPOLSKIE: 'maratonypolskie',
  FACEBOOK: 'facebook',
} as const;
export type ProviderId = (typeof ProviderId)[keyof typeof ProviderId];

/** Candidate lifecycle through the queue (seed_candidates.status). */
export const CandidateStatus = {
  PENDING: 'pending',
  NO_MEDIA: 'no_media',
  NO_COORDS: 'no_coords',
  DUPLICATE: 'duplicate',
  INGESTING: 'ingesting',
  DONE: 'done',
  ERROR: 'error',
} as const;
export type CandidateStatus = (typeof CandidateStatus)[keyof typeof CandidateStatus];

/** Per-showtime booking identity for a cinema event. The provider kind lets the
 *  client compose the deep booking URL on the fly (no links are stored). */
export interface ShowtimeBooking {
  time: string;
  kind: 'helios' | 'cinemacity' | 'multikino';
  params: Record<string, string>;
}

export interface SeedCandidate {
  source: ProviderId;
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
  /** Tickets are sold out for the target date (shown as a badge, not hidden). */
  isSoldOut?: boolean;
  /** Provider-specific reference for deferred geo resolution (e.g. kupbilecik obiekt id). */
  geoRef?: string | null;
  /** All showtimes for the target day ("HH:MM", sorted). Cinema providers carry
   *  every session; may be a single entry or empty when unknown. */
  times?: string[];
  /** Per-showtime booking identity (cinema providers) — the client builds the
   *  deep booking URL from it; absent for non-bookable sources. */
  showtimeBooking?: ShowtimeBooking[];
  /** Canonical tags (subset of the closed tag set) — empty/absent = none. */
  tags?: string[];
}

export interface SeedProviderResult {
  provider: ProviderId;
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

/** Date-window context a provider's fetch function actually reads. Both the
 *  Worker (full SeedContext) and the VPS executor (a plain {day,dayStart,dayEnd})
 *  can satisfy it — the VPS host has no Worker `Env`. */
export type SeedFetchCtx = Pick<SeedContext, 'day' | 'dayStart' | 'dayEnd'>;

export interface SeedProvider {
  id: ProviderId;
  transport: ProviderTransport;
  /** Fetch candidates for the target day. Must call ctx.recordBrowserMs for browser time. */
  fetchCandidates(ctx: SeedContext): Promise<SeedCandidate[]>;
  /** Download media bytes (poster / thumb). Browser transport may proxy through Browser Run. */
  fetchBytes(ctx: SeedContext, url: string): Promise<Uint8Array>;
  /** Parallel fetch scopes (per city / per category). Each becomes its own queue message. */
  scopes: string[];
  /** Fetch one scope. Used by the queue consumer to parallelize across cities/categories. */
  fetchScope(ctx: SeedContext, scope: string): Promise<SeedCandidate[]>;
  /** Optional: resolve the post's link_url to a direct source (called at ingest, only for survivors). */
  resolveLink?(ctx: SeedContext, cand: SeedCandidate): Promise<string>;
  /** Ingest every post from this provider as PENDING (moderation review) even
   *  with valid geo. Flip to false for auto-approve after review. */
  pendingByDefault?: boolean;
}
