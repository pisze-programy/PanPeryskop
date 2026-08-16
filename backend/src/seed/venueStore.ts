// Persistent venue geo store shared by all seed providers. Each provider upserts
// locations it discovers (dzisapp API, kupbilecik venue pages, eventylive, going)
// and resolves venue geo by fuzzy name matching (venueMatch.ts). Aliases track the
// different spellings providers use for the same place.
import { venueSimilarity, flat } from './venueMatch';

export interface VenueRow {
  id: string;
  name: string;
  aliases: string;
  lat: number;
  lng: number;
  city: string | null;
  sources: string;
  hit_count: number;
  last_seen: number;
}

export interface VenueInput {
  name: string;
  lat: number;
  lng: number;
  city?: string | null;
  provider?: string;
  ref?: string;         // provider-specific reference (e.g. kupbilecik obiekt id)
}

const MATCH_THRESHOLD = 0.55;

// venue_key for a name: flattened lowercase alphanumeric.
export function venueKey(name: string): string {
  return flat(name);
}

// Upsert a venue by fuzzy-matching against existing rows. Returns the venue id
// (existing match or newly created). Adds provider alias/ref + refreshes geo.
export async function upsertVenue(db: D1Database, v: VenueInput): Promise<string | null> {
  if (!v.name || typeof v.lat !== 'number' || typeof v.lng !== 'number') return null;
  const now = Date.now();
  const { results } = await db.prepare('SELECT * FROM venues').all<VenueRow>();
  const rows = results || [];

  let best: VenueRow | null = null;
  let bestScore = 0;
  const cityNorm = v.city ? v.city.toLowerCase() : null;
  for (const r of rows) {
    // Match only within the same city — "Tama" in Warszawa is a different venue
    // than "Tama" in Poznań. Rows without a city are still candidates (provider
    // didn't know the city), but a same-city match is preferred.
    if (cityNorm && r.city && r.city.toLowerCase() !== cityNorm) continue;
    const names = [r.name, ...safeJSON<string[]>(r.aliases, [])];
    for (const n of names) {
      const s = venueSimilarity(v.name, n);
      if (s > bestScore) { bestScore = s; best = r; }
    }
  }

  if (best && bestScore >= MATCH_THRESHOLD) {
    // Refresh geo (latest provider may be more accurate), add alias/ref.
    const aliases = safeJSON<string[]>(best.aliases, []);
    const canonical = flat(best.name);
    if (flat(v.name) !== canonical && !aliases.some((a) => flat(a) === flat(v.name))) {
      aliases.push(v.name);
    }
    const sources = { ...safeJSON<Record<string, string>>(best.sources, {}), ...(v.provider && v.ref ? { [v.provider]: v.ref } : {}) };
    const city = best.city || v.city || null;
    await db.prepare(
      `UPDATE venues SET lat=?, lng=?, aliases=?, sources=?, city=?, hit_count=hit_count+1, last_seen=? WHERE id=?`
    ).bind(v.lat, v.lng, JSON.stringify(aliases), JSON.stringify(sources), city, now, best.id).run();
    return best.id;
  }

  // New venue.
  const id = venueKey(v.name);
  const sources = v.provider && v.ref ? { [v.provider]: v.ref } : {};
  await db.prepare(
    `INSERT INTO venues (id, name, aliases, lat, lng, city, sources, hit_count, first_seen, last_seen, created_at)
     VALUES (?, ?, '[]', ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, city=excluded.city, last_seen=excluded.last_seen, hit_count=hit_count+1`
  ).bind(id, v.name, v.lat, v.lng, v.city || null, JSON.stringify(sources), now, now, now).run();
  return id;
}

// Resolve geo for a venue name by fuzzy match, preferring the same city ("Tama"
// in Warszawa is not "Tama" in Poznań). Returns {lat, lng, id} or null.
export async function resolveVenueGeo(
  db: D1Database, name: string, city?: string | null
): Promise<{ lat: number; lng: number; id: string } | null> {
  if (!name) return null;
  const { results } = await db.prepare('SELECT * FROM venues').all<VenueRow>();
  const rows = results || [];
  const cityNorm = city ? city.toLowerCase() : null;
  const pool = cityNorm ? rows.filter((r) => (r.city || '').toLowerCase() === cityNorm) : rows;
  const candidates = pool.length > 0 ? pool : rows; // fall back to all cities when none match

  let best: VenueRow | null = null;
  let bestScore = 0;
  for (const r of candidates) {
    const names = [r.name, ...safeJSON<string[]>(r.aliases, [])];
    for (const n of names) {
      const s = venueSimilarity(name, n);
      if (s > bestScore) { bestScore = s; best = r; }
    }
  }
  if (!best || bestScore < MATCH_THRESHOLD) return null;
  await db.prepare('UPDATE venues SET hit_count=hit_count+1, last_seen=? WHERE id=?').bind(Date.now(), best.id).run();
  return { lat: best.lat, lng: best.lng, id: best.id };
}

// All venues (optionally filtered by city) for in-memory fuzzy matching (matchVenueGeo).
export async function listVenues(db: D1Database, city?: string | null): Promise<{ name: string; geo: { lat: number; lng: number }; city: string | null }[]> {
  const { results } = city
    ? await db.prepare('SELECT name, lat, lng, city FROM venues WHERE city = ?').bind(city).all<{ name: string; lat: number; lng: number; city: string | null }>()
    : await db.prepare('SELECT name, lat, lng, city FROM venues').all<{ name: string; lat: number; lng: number; city: string | null }>();
  return (results || []).map((r) => ({ name: r.name, geo: { lat: r.lat, lng: r.lng }, city: r.city }));
}

function safeJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
