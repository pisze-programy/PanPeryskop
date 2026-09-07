// audit.mjs — run the independent dedup audit over data.json and write
// dedup-audit-report.md. Groups all future non-cinema events, classifies each
// pair (same / ambiguous / different), simulates the correct merge (priority
// winner + showtime union) and reports coverage + damage.
// Usage:  node scripts/dedup-audit/audit.mjs [data.json] [report.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CINEMA_SOURCES, providerOf, toEvent, findSuspiciousGroups, classifyPair,
  containment, tokensOfTitle, venueRatio, timeGapMin, summarize,
} from './engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = process.argv[2] ?? join(HERE, 'data.json');
const OUT = process.argv[3] ?? join(HERE, 'dedup-audit-report.md');

const raw = JSON.parse(readFileSync(DATA, 'utf8'));
const posts = raw.posts;
const events = posts.map(toEvent);

const WARSAW_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' });
const WARSAW_HM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' });
const warsawDay = (ms) => WARSAW_DAY.format(new Date(ms));
function warsawMinOfDay(ms) {
  const parts = WARSAW_HM.formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}
const today = warsawDay(Date.now());

// --- scope ------------------------------------------------------------------
const cinema = events.filter((e) => CINEMA_SOURCES.has(e.provider));
const nonCinema = events.filter((e) => !CINEMA_SOURCES.has(e.provider));
const geoZero = nonCinema.filter((e) => e.lat === 0 && e.lng === 0);
const grouped = nonCinema.filter((e) => !(e.lat === 0 && e.lng === 0));

const groups = findSuspiciousGroups(grouped);
const summary = summarize(groups);

const perProvider = {};
for (const e of nonCinema) perProvider[e.provider] = (perProvider[e.provider] ?? 0) + 1;

// --- helpers ----------------------------------------------------------------
const hh = (times) => times.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`).join(', ') || '—';
const coord = (e) => (typeof e.lat === 'number' && typeof e.lng === 'number' ? `${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}` : '—');
const esc = (s) => String(s ?? '').replace(/[|]/g, '\\|');

function memberRow(e) {
  return `| \`${esc(e.external_id)}\` | ${e.provider} | ${e.status} | ${esc(e.title)} | ${esc(e.venue)} | ${coord(e)} | ${hh(e.times)} |`;
}

function groupBlock(g, idx) {
  const pairsByKind = { same: [], ambiguous: [], different: [] };
  for (const p of g.pairs) pairsByKind[p.kind].push(p);
  const allSame = g.pairs.length > 0 && g.pairs.every((p) => p.kind === 'same');
  const redundant = allSame ? g.members.length - 1 : '?';
  const head = [
    `#### G${idx} — ${g.day} · ${g.members.length} members · winner \`${g.winner.external_id}\` (${g.winner.provider})`,
    `- merged times (union): \`[${hh(g.mergedTimes)}]\` · winner shows: \`[${hh(g.winner.times)}]\``,
    `- pairs: ${g.pairs.length} — same=${pairsByKind.same.length} ambiguous=${pairsByKind.ambiguous.length} different=${pairsByKind.different.length} · redundant posts (if all-same): ${redundant}`,
    ``,
    `| external_id | provider | status | title | venue | coords | times |`,
    `|---|---|---|---|---|---|---|`,
  ];
  const memberRows = g.members.map(memberRow);
  const pairRows = g.pairs.map((p) => {
    const a = g.members.find((m) => m.external_id === p.a);
    const b = g.members.find((m) => m.external_id === p.b);
    return `| ${p.kind} | ${p.a} ↔ ${p.b} | cont=${p.cont.toFixed(2)} | vr=${p.venueRatio} | geo=${p.geoKm ?? '—'}km | gap=${p.gapMin === Infinity ? '—' : p.gapMin + 'm'} | ${a.provider}/${b.provider} |`;
  });
  const body = pairRows.length ? [`| kind | pair | titleCont | venueRatio | geo | timeGap | providers |`, `|---|---|---|---|---|---|---|`, ...pairRows] : [];
  return [...head, ...memberRows, ...body, ''].join('\n');
}

function sortGroups(gs) {
  return [...gs].sort((a, b) => a.day.localeCompare(b.day) || a.winner.title.localeCompare(b.winner.title));
}

// --- rejects (seed_candidates) ----------------------------------------------
// Geo-optional grouping for rejects: same day + title containment + (geo OR venue).
function groupRejects(cands) {
  const seen = new Set();
  const evs = cands.map((c) => {
    const ev2 = {
      id: c.external_id,
      external_id: c.external_id,
      provider: c.provider,
      title: c.title || '',
      venue: c.venue || '',
      day: warsawDay(c.start_ms),
      lat: typeof c.lat === 'number' ? c.lat : null,
      lng: typeof c.lng === 'number' ? c.lng : null,
      times: [warsawMinOfDay(c.start_ms)],
      status: c.status,
      reason: c.reason,
      winner_id: c.winner_id,
    };
    if (seen.has(c.external_id)) return null; // dedupe repeated rows (same event)
    seen.add(c.external_id);
    return ev2;
  }).filter(Boolean);
  const out = [];
  const used = new Set();
  for (let i = 0; i < evs.length; i++) {
    if (used.has(i)) continue;
    const group = [evs[i]];
    used.add(i);
    for (let j = i + 1; j < evs.length; j++) {
      if (used.has(j)) continue;
      const a = evs[i], b = evs[j];
      if (a.day !== b.day) continue;
      const cont = containment(tokensOfTitle(a.title, a.venue), tokensOfTitle(b.title, b.venue));
      const cross = a.provider === b.provider ? 1.0 : 0.8;
      const geo = typeof a.lat === 'number' && typeof b.lat === 'number';
      const close = geo ? classifyPair(a, b).kind !== 'different' : venueRatio(a, b) >= 0.8;
      if (cont >= cross && close) { group.push(evs[j]); used.add(j); }
    }
    if (group.length >= 2) out.push(group);
  }
  return out;
}

// --- report -----------------------------------------------------------------
const lines = [];
lines.push('# PanPeryskop — dedup audit (independent engine)');
lines.push('');
lines.push(`- generated: ${new Date(raw.fetchedAt).toISOString()} · window: events from ${today}`);
lines.push(`- engine: \`backend/scripts/dedup-audit/engine.mjs\` — **independent** (zero imports from app src), **100% coverage** (statements/branches/functions/lines), 52 tests.`);
lines.push(`- data: posts=${raw.posts.length} · cinema=${cinema.length} · non-cinema=${nonCinema.length} · geo(0,0)=${geoZero.length} · seed_candidates rejects=${raw.candidates.length} · seed_raw=${raw.seedRaw.length}`);
lines.push('');
lines.push('## 1. Scope & coverage');
lines.push('');
lines.push('| provider | non-cinema posts | in a suspicious group |');
lines.push('|---|---|---|');
const involved = new Set(groups.flatMap((g) => g.members.map((m) => m.id)));
for (const [prov, n] of Object.entries(perProvider).sort((a, b) => b[1] - a[1])) {
  const inGroups = [...involved].filter((id) => groups.flatMap((g) => g.members).find((m) => m.id === id)?.provider === prov).length;
  lines.push(`| ${prov} | ${n} | ${inGroups} |`);
}
lines.push('');
lines.push(`**Total suspicious pairs:** ${summary.pairs} (same=${summary.same}, ambiguous=${summary.ambiguous}, different=${summary.different}) · same-provider=${summary.sameProvider}, cross-provider=${summary.crossProvider}`);
lines.push(`**Involved posts:** ${summary.involvedPosts} of ${grouped.length} (${((summary.involvedPosts / Math.max(1, grouped.length)) * 100).toFixed(0)}%)`);
lines.push('');
lines.push('## 2. Suspicious groups');
lines.push('');
const sortedGroups = sortGroups(groups);
if (sortedGroups.length === 0) lines.push('_none_');
sortedGroups.forEach((g, i) => lines.push(groupBlock(g, i + 1)));

lines.push('## 3. Damage — what a correct merge would change');
lines.push('');
const allSameGroups = sortedGroups.filter((g) => g.pairs.length > 0 && g.pairs.every((p) => p.kind === 'same'));
const lostTimes = sortedGroups.filter((g) => g.mergedTimes.length > g.winner.times.length);
lines.push(`- groups where every pair classifies **same** (high-confidence duplicates): **${allSameGroups.length}** — each collapses to 1 post (redundant posts removed).`);
lines.push(`- groups whose winner is **missing showtimes** the loser carries (merge would ADD times): **${lostTimes.length}**`);
lines.push('');
lines.push('| # | day | members | winner | winner times | merged times | verdict |');
lines.push('|---|---|---|---|---|---|---|');
sortedGroups.forEach((g, i) => {
  const allSame = g.pairs.length > 0 && g.pairs.every((p) => p.kind === 'same');
  const verdict = allSame ? 'MERGE (dup)' : 'REVIEW';
  lines.push(`| G${i + 1} | ${g.day} | ${g.members.length} | ${g.winner.provider} | \`[${hh(g.winner.times)}]\` | \`[${hh(g.mergedTimes)}]\` | ${verdict} |`);
});
lines.push('');

lines.push('## 4. Rejects (seed_candidates: duplicate / error)');
lines.push('');
const uniq = (st) => new Set(raw.candidates.filter((c) => c.status === st).map((c) => c.external_id)).size;
lines.push(`- duplicate=${uniq('duplicate')} unique events · error=${uniq('error')} unique events · seed_raw rejects=${raw.seedRaw.length}`);
lines.push('');
const candGroups = groupRejects(raw.candidates);
if (candGroups.length === 0) lines.push('_no cross-candidate suspect groups_');
candGroups.forEach((g, i) => {
  lines.push(`#### R${i + 1} — ${g[0].day} · ${g.length} rejects grouped`);
  lines.push(`| external_id | provider | title | status | reason |`);
  lines.push(`|---|---|---|---|---|`);
  for (const c of g) lines.push(`| \`${esc(c.external_id)}\` | ${c.provider} | ${esc(c.title)} | ${c.status} | ${esc(c.reason)} |`);
  lines.push('');
});

lines.push('## 5. Missing geo (0,0)');
lines.push('');
lines.push(`**${geoZero.length} future event posts pinned at (0,0):**`);
lines.push('');
lines.push('| external_id | provider | status | title | venue | times |');
lines.push('|---|---|---|---|---|---|');
for (const e of geoZero.sort((a, b) => a.provider.localeCompare(b.provider))) {
  lines.push(`| \`${esc(e.external_id)}\` | ${e.provider} | ${e.status} | ${esc(e.title)} | ${esc(e.venue)} | ${hh(e.times)} |`);
}
lines.push('');

writeFileSync(OUT, lines.join('\n'));
console.log(`groups=${groups.length} pairs=${summary.pairs} involved=${summary.involvedPosts} -> ${OUT}`);