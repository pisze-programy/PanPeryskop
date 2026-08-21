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

// Bulk upsert without fuzzy matching — used for canonical, exact sources
// (dzis.app venue names during buildVenueCache). Uses D1 batch (single round-trip
// per chunk) so a ~10k-venue daily build doesn't block the seed-day message.
// Rows keep their id, so repeated daily builds are idempotent.
const BATCH_SIZE = 500; // keep well under D1's 1000-statement batch cap
export async function upsertVenuesBatch(db: D1Database, venues: VenueInput[]): Promise<number> {
  const now = Date.now();
  let n = 0;
  for (let i = 0; i < venues.length; i += BATCH_SIZE) {
    const chunk = venues.slice(i, i + BATCH_SIZE);
    const statements: D1PreparedStatement[] = [];
    for (const v of chunk) {
      if (!v.name || typeof v.lat !== 'number' || typeof v.lng !== 'number') continue;
      const sources = v.provider && v.ref ? { [v.provider]: v.ref } : {};
      statements.push(
        db.prepare(
          `INSERT INTO venues (id, name, aliases, lat, lng, city, sources, hit_count, first_seen, last_seen, created_at)
           VALUES (?, ?, '[]', ?, ?, ?, ?, 1, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, city=excluded.city, last_seen=excluded.last_seen`
        ).bind(venueKey(v.name), v.name, v.lat, v.lng, venueKey(v.city || '') || null, JSON.stringify(sources), now, now, now)
      );
      n++;
    }
    if (statements.length) await db.batch(statements);
  }
  return n;
}

// Upsert a venue by fuzzy-matching against existing rows. Returns the venue id
// (existing match or newly created). Adds provider alias/ref + refreshes geo.
export async function upsertVenue(db: D1Database, v: VenueInput): Promise<string | null> {
  if (!v.name || typeof v.lat !== 'number' || typeof v.lng !== 'number') return null;
  const now = Date.now();
  const rows = await loadVenuePool(db, v.city);

  let best: VenueRow | null = null;
  let bestScore = 0;
  const cityNorm = v.city ? venueKey(v.city) : null;
  for (const r of rows) {
    // Match only within the same city — "Tama" in Warszawa is a different venue
    // than "Tama" in Poznań. Rows without a city are still candidates (provider
    // didn't know the city), but a same-city match is preferred.
    if (cityNorm && r.city && venueKey(r.city) !== cityNorm) continue;
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
    const city = venueKey(best.city || v.city || '') || null;
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
    ).bind(id, v.name, v.lat, v.lng, venueKey(v.city || '') || null, JSON.stringify(sources), now, now, now).run();
  return id;
}

// Resolve geo for a venue name by fuzzy match, scoped to the SAME city only
// ("Tama" in Warszawa is not "Tama" in Poznań). City-less rows are NEVER matched
// when a city is known — a generic name like "Amfiteatr" must not resolve to a
// same-named venue in a different city. EXCEPTION: a city-less row whose flattened
// name matches the candidate EXACTLY (venueKey equality) is unambiguous
// (e.g. "Katedra Marii Magdaleny"), so it resolves despite the missing city —
// otherwise a geo'd venue with an unknown city silently drops every candidate.
// Returns {lat, lng, id} or null.
export async function resolveVenueGeo(
  db: D1Database, name: string, city?: string | null
): Promise<{ lat: number; lng: number; id: string } | null> {
  if (!name) return null;
  const rows = await loadVenuePool(db, city);
  let match = bestVenueMatch(name, rows);
  if (!match && city) {
    const cityless = await db.prepare('SELECT * FROM venues WHERE city IS NULL AND id = ?')
      .bind(venueKey(name)).first<VenueRow>();
    if (cityless) match = bestVenueMatch(name, [cityless]);
  }
  if (!match) return null;
  await db.prepare('UPDATE venues SET hit_count=hit_count+1, last_seen=? WHERE id=?').bind(Date.now(), match.id).run();
  return { lat: match.lat, lng: match.lng, id: match.id };
}

// Load the candidate venue rows. With a known city ONLY exact same-city rows are
// candidates — city-less rows are ambiguous ("Amfiteatr" could be any city's).
async function loadVenuePool(db: D1Database, city?: string | null): Promise<VenueRow[]> {
  if (city) {
    const { results } = await db.prepare('SELECT * FROM venues WHERE city = ?')
      .bind(venueKey(city)).all<VenueRow>();
    return results || [];
  }
  const { results } = await db.prepare('SELECT * FROM venues').all<VenueRow>();
  return results || [];
}

// Best fuzzy match for a name across the given rows (name + aliases).
function bestVenueMatch(name: string, rows: VenueRow[]): VenueRow | null {
  let best: VenueRow | null = null;
  let bestScore = 0;
  for (const r of rows) {
    const names = [r.name, ...safeJSON<string[]>(r.aliases, [])];
    for (const n of names) {
      const s = venueSimilarity(name, n);
      if (s > bestScore) { bestScore = s; best = r; }
    }
  }
  return best && bestScore >= MATCH_THRESHOLD ? best : null;
}

// All venues (optionally filtered by city) for in-memory fuzzy matching (matchVenueGeo).
export async function listVenues(db: D1Database, city?: string | null): Promise<{ name: string; geo: { lat: number; lng: number }; city: string | null }[]> {
  const { results } = city
    ? await db.prepare('SELECT name, lat, lng, city FROM venues WHERE city = ?').bind(venueKey(city)).all<{ name: string; lat: number; lng: number; city: string | null }>()
    : await db.prepare('SELECT name, lat, lng, city FROM venues').all<{ name: string; lat: number; lng: number; city: string | null }>();
  return (results || []).map((r) => ({ name: r.name, geo: { lat: r.lat, lng: r.lng }, city: r.city }));
}

function safeJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
