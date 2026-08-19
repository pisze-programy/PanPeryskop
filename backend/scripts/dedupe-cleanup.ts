// One-off production cleanup: reject posts that the NEW dedupe pipeline considers
// duplicates. Reads a wrangler JSON dump of approved event posts, runs the exact
// pipeline (dropCancelled → dedupe → rescueRealShows), and emits the reject SQL.
// Usage:  npx wrangler d1 execute panperyskop-db --remote --command="..." --json > dump.json
//         npx tsx scripts/dedupe-cleanup.ts dump.json
import { readFileSync } from 'node:fs';
import { dedupe } from '../src/seed/core/dedupe';
import { dropCancelled, rescueRealShows, isCancelled } from '../src/seed/core/filters';
import type { SeedCandidate, ProviderId } from '../src/seed/core/types';

const raw: unknown = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let rows: Array<Record<string, unknown>>;
if (Array.isArray(raw)) {
  if (raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null && 'results' in (raw[0] as object)) {
    rows = (raw as Array<{ results?: unknown[] }>).flatMap((w) => w.results ?? []);
  } else {
    rows = raw as Array<Record<string, unknown>>;
  }
} else {
  rows = ((raw as { results?: unknown[] }).results ?? []) as Array<Record<string, unknown>>;
}

function toCand(r: Record<string, unknown>): SeedCandidate {
  const desc: string = String(r.description || '');
  const m = desc.match(/^(.*?):\s*(\d{2}:\d{2})\s*,\s*(.*)$/s);
  const title = (m ? m[1] : desc).trim();
  const hm = m ? m[2] : '00:00';
  const venue = (m ? m[3] : '').trim();
  const src = String(r.external_id || '').split('-')[0];
  return {
    source: src as ProviderId,
    externalId: String(r.external_id || ''),
    title,
    startMs: Date.parse(`${String(r.event_date)}T${hm}:00+02:00`),
    lat: typeof r.lat === 'number' ? r.lat : null,
    lng: typeof r.lng === 'number' ? r.lng : null,
    city: '',
    venue,
    address: '',
    link: String(r.link_url || ''),
    mediaUrl: '',
    thumbUrl: null,
  };
}

const all = rows.map(toCand);
const pre = dropCancelled(all);
const merged = rescueRealShows(pre, dedupe(pre));
const removed = pre.filter((c) => !merged.includes(c));
const cancelled = all.filter((c) => !pre.includes(c));

const REASON = 'dedupe: covered by another provider';
const ids = [...cancelled.map((c) => c.externalId), ...removed.map((c) => c.externalId)];

console.log(`rows=${all.length} cancelled=${cancelled.length} dedupe_losers=${removed.length}`);
console.log(`to_reject=${ids.length} (${cancelled.length} cancelled + ${removed.length} dedupe losers)`);
for (const c of cancelled) console.log(`  CANCEL  ${c.externalId} | ${c.title.slice(0, 50)}`);
for (const c of removed) console.log(`  REJECT  ${c.externalId} | ${c.title.slice(0, 50)} | ${c.venue.slice(0, 30)}`);

const values = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
const sql = ids.length
  ? `UPDATE posts SET status='rejected', rejection_reason='${REASON}' WHERE external_id IN (${values});`
  : '-- nothing to reject';
console.log('\n-- SQL --');
console.log(sql);
