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
const cancelled = all.filter((c) => isCancelled(c.title));
const pre = dropCancelled(all);
const deduped = dedupe(pre);
const merged = rescueRealShows(pre, deduped);
const rescued = merged.filter((c) => !deduped.includes(c));
const removed = pre.filter((c) => !merged.includes(c));

const fmt = (c: SeedCandidate) => {
  const hm = new Date(c.startMs).toISOString().slice(11, 16);
  return `[${c.source}] ${c.title.slice(0, 40).padEnd(42)} | ${c.venue.slice(0, 26).padEnd(28)} | ${hm}`;
};

console.log(`rows=${all.length}`);
console.log(`cancelled_dropped=${cancelled.length} rescued=${rescued.length}`);
console.log(`dedupe_in=${pre.length} dedupe_out=${deduped.length} final_out=${merged.length} losers_to_remove=${removed.length}`);

// comparison dumps
import { writeFileSync } from 'node:fs';
const dedupeRemoved = pre.filter((c) => !deduped.includes(c));
writeFileSync('/tmp/ts_dedupe_removed.txt', dedupeRemoved.map((c) => c.externalId).sort().join('\n'));
writeFileSync('/tmp/ts_dedupe_kept.txt', deduped.map((c) => c.externalId).sort().join('\n'));
writeFileSync('/tmp/ts_final_removed.txt', removed.map((c) => c.externalId).sort().join('\n'));
console.log('--- cancelled (pre-filter, always removed) ---');
for (const c of cancelled) console.log('  REMOVE', fmt(c));
console.log('--- rescued (kept back as real shows) ---');
for (const c of rescued) console.log('  KEEP  ', fmt(c));
console.log('--- removed by dedupe (losers) ---');
for (const c of removed) console.log('  -', fmt(c));
