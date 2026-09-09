import { TRAVEL_BATCH_CAP, TRAVEL_TAGS, TravelRunType, TravelTag } from './constants';

export interface TravelEvent {
  provider: string;
  externalId: string;
  title: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  startMs: number;
  tag: TravelTag;
  link: string | null;
}

export interface TravelManifest {
  provider: string;
  runType: TravelRunType;
  days: string[];
  events: TravelEvent[];
}

function isTravelEvent(v: unknown): v is TravelEvent {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.provider === 'string' && e.provider.length > 0 &&
    typeof e.externalId === 'string' && e.externalId.length > 0 &&
    typeof e.title === 'string' && e.title.length > 0 &&
    typeof e.city === 'string' &&
    typeof e.country === 'string' &&
    typeof e.startMs === 'number' && Number.isFinite(e.startMs) &&
    typeof e.lat === 'number' && Number.isFinite(e.lat) &&
    typeof e.lng === 'number' && Number.isFinite(e.lng) &&
    typeof e.tag === 'string' && TRAVEL_TAGS.has(e.tag as TravelTag) &&
    (e.link === null || typeof e.link === 'string')
  );
}

/** Validate + dedupe manifest events; throws on a malformed row. */
export function sanitizeManifest(manifest: TravelManifest): TravelEvent[] {
  const seen = new Set<string>();
  const out: TravelEvent[] = [];
  for (let i = 0; i < manifest.events.length; i++) {
    const e = manifest.events[i];
    if (!isTravelEvent(e)) throw new Error(`travel manifest row ${i} invalid`);
    const key = `${e.provider}:${e.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export async function upsertTravelEvents(db: D1Database, events: TravelEvent[]): Promise<void> {
  const now = Date.now();
  for (let i = 0; i < events.length; i += TRAVEL_BATCH_CAP) {
    const chunk = events.slice(i, i + TRAVEL_BATCH_CAP);
    const stmts = chunk.map((e) =>
      db.prepare(
        `INSERT INTO travel_events (provider, external_id, title, lat, lng, city, country, start_ms, tag, link, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider, external_id) DO UPDATE SET
           title=excluded.title, lat=excluded.lat, lng=excluded.lng, city=excluded.city,
           country=excluded.country, start_ms=excluded.start_ms, tag=excluded.tag,
           link=excluded.link, updated_at=excluded.updated_at`
      ).bind(
        e.provider, e.externalId, e.title, e.lat, e.lng, e.city, e.country,
        e.startMs, e.tag, e.link, now, now
      )
    );
    await db.batch(stmts);
  }
}