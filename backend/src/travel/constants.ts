import { D1_BATCH_STATEMENT_CAP } from '../seed/core/constants';

export const TRAVEL_PROVIDER = 'espn';

// Wycieczki = the travel category (one table). Within it, tags discriminate:
// City-break / Piłka nożna / Biegi (extensible). ESPN soccer → 'pilka-nozna'.
export type TravelTag = 'citybreak' | 'pilka-nozna' | 'biegi';
export const TRAVEL_TAGS: ReadonlySet<TravelTag> = new Set<TravelTag>(['citybreak', 'pilka-nozna', 'biegi']);
export const ESPN_TAG: TravelTag = 'pilka-nozna';

export const ESPN_HOST = 'https://site.api.espn.com';
export const ESPN_BACKUP_HOST = 'https://site.web.api.espn.com';
// limit>1000 breaks the response (returns 25 "featured" events).
export const ESPN_LIMIT = 1000;
export const ESPN_TIMEOUT_MS = 30_000;
export const ESPN_RETRIES = 3;
export const ESPN_RETRY_DELAY_MS = 5_000;

export const TRAVEL_BACKFILL_DAYS = 90;
export const TRAVEL_REPLENISH_DAYS = 7;

export const TRAVEL_BATCH_CAP = D1_BATCH_STATEMENT_CAP;

export type TravelRunType = 'backfill' | 'replenish';