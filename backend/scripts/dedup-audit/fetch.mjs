// fetch.mjs — pull all future events from production D1 into data.json for the
// dedup audit. Read-only (SELECT only). Writes:
//   { fetchedAt, posts, geoZero, candidates, seedRaw }
// Usage:  node scripts/dedup-audit/fetch.mjs [out.json]
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DB = 'c9fed854-29bc-4ea7-9242-d0a7bc6abee0';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(HERE, 'data.json');
const BACKEND = join(HERE, '..', '..');

function d1(sql) {
  const out = execSync(`npx wrangler d1 execute ${DB} --remote --json --command ${JSON.stringify(sql.replace(/\s+/g, ' ').trim())}`, {
    cwd: BACKEND,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  const parsed = JSON.parse(out);
  return parsed?.[0]?.results ?? [];
}

const POST_COLS = 'id, external_id, description, lat, lng, event_date, showtimes, status, link_url, rejection_reason';

const data = {
  fetchedAt: new Date().toISOString(),
  // All future event posts (approved + pending). Cinemas stay in the dump;
  // the engine excludes them by default so the raw data is reusable.
  posts: d1(
    `SELECT ${POST_COLS} FROM posts
      WHERE event_date >= date('now','+2 hours') AND category='events'
        AND status IN ('approved','pending')`,
  ),
  // Future posts with missing geo pinned at (0,0).
  geoZero: d1(
    `SELECT ${POST_COLS} FROM posts
      WHERE event_date >= date('now','+2 hours') AND category='events'
        AND lat=0 AND lng=0`,
  ),
  // Dedup/merge rejects from the seed_candidates path (old pipeline, live).
  candidates: d1(
    `SELECT provider, external_id, title, start_ms, lat, lng, venue, city, status, reason, winner_id, post_id
       FROM seed_candidates
      WHERE start_ms >= strftime('%s','now','+2 hours','start of day')*1000
        AND status IN ('duplicate','error')`,
  ),
  // Rejects from the seed_raw/reconcile path (currently not populated in prod,
  // kept so the audit works the day that path is wired).
  seedRaw: d1(
    `SELECT provider, external_id, title, start_min, showtimes, raw_venue, city, status, reason, winner_raw_id, post_id
       FROM seed_raw WHERE status IN ('duplicate','failure')`,
  ),
};

writeFileSync(OUT, JSON.stringify(data, null, 2));
console.log(`posts=${data.posts.length} geoZero=${data.geoZero.length} candidates=${data.candidates.length} seedRaw=${data.seedRaw.length} -> ${OUT}`);