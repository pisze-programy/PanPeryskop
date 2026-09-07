// engine.mjs — INDEPENDENT dedup diagnostic engine for the PanPeryskop seed
// pipeline. Intentionally imports ZERO app code (nothing from backend/src/):
// this is a second, from-scratch implementation of event-dedup grouping so
// that bugs in the production engine cannot be silently replicated here.
//
// The engine works on normalized "events" (see toEvent). It answers:
//   - which events are suspicious duplicates (same day, close geo, close time,
//     same or different providers — and a title-similarity pass),
//   - what a correct merge would look like (priority winner + showtime union),
//   - whether a merge is safe (classifyPair: same / ambiguous / different).
//
// Input shape expected from the fetch layer:
//   { id, external_id, description, lat, lng, event_date, showtimes, status }

// ---------------------------------------------------------------------------
// Provider priority (canonical rank for cross-provider dedupe, LOWEST wins).
// Mirrors backend/src/seed/providers/registry.ts. Unknown sources rank 99.
// ---------------------------------------------------------------------------
export const CINEMA_SOURCES = new Set(['multikino', 'helios', 'cinemacity']);

export const PRIORITY = {
  helios: 0, multikino: 0, cinemacity: 0,
  luma: 1, going: 2, kupbilecik: 3, facebook: 3.5,
  dzisapp: 4, eventylive: 5, meetup: 6,
  ebilet: 7, eventim: 7, maratonypolskie: 7, mtp: 7,
  getyourguide: 8,
};

export function providerOf(externalId) {
  return String(externalId || '').split('-')[0];
}

export function priorityOf(provider) {
  return PRIORITY[provider] ?? 99;
}

// ---------------------------------------------------------------------------
// Title normalization — Cyrillic-safe (PL/UA titles never collapse), folds
// Latin diacritics, removes stop/noise words and venue-name tokens.
// ---------------------------------------------------------------------------
const STOP = new Set([
  'w', 'i', 'na', 'z', 'do', 'o', 'a', 'the', 'and', 'or', 'vs',
  '2026', '2025', '2024', 'poznan', 'warszawa', 'poland', 'polska',
  'bilety', 'bilet', 'jest', 'tak', 'nie', 'sala', 'hala', 'pozn', 'kino', 'nad',
  'seans', 'seansy', 'premiera', 'dnia', 'czesc',
]);
const NOISE = new Set([
  'ukrainski', 'ukrainska', 'ukrainskie', 'ukrainskiej', 'ukrainian',
  'dubbing', 'napisy', 'lektor', 'oryginalny', 'oryginalna', 'oryginalnej',
  '2d', '3d', '4d', 'imax', 'xd', 'dts', 'vr', 'ukr',
  'wersji', 'wersja', 'wersje', 'rozszerzone', 'rozszerzona', 'rozszerzonej',
]);
const TOKEN_RE = /[a-z0-9\u0430-\u044f\u0456\u0454\u0491]+/g;

export function foldDiacritics(s) {
  return String(s || '')
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('ł', 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Folding + flattening to a token-joined string ("teatr capitol ul x"). */
export function flatNorm(s) {
  return (foldDiacritics(s).match(TOKEN_RE) ?? []).join(' ');
}

/** Title tokens (length>=3, no stop/noise, venue-name tokens subtracted). */
export function tokensOfTitle(title, venue) {
  const words = foldDiacritics(title).match(TOKEN_RE) ?? [];
  const sub = venue ? new Set(foldDiacritics(venue).match(TOKEN_RE) ?? []) : new Set();
  const out = new Set();
  for (const w of words) {
    if (w.length >= 3 && !STOP.has(w) && !NOISE.has(w) && !sub.has(w)) out.add(w);
  }
  return out;
}

/** Token containment in [0,1]: shared / min(sizeA, sizeB). 0 for empty sets. */
export function containment(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

/** LCS-based sequence ratio in [0,1] (difflib.SequenceMatcher-style). */
export function seqRatio(a, b) {
  const A = flatNorm(a);
  const B = flatNorm(b);
  if (A.length === 0 && B.length === 0) return 1;
  if (A.length === 0 || B.length === 0) return 0;
  const n = A.length, m = B.length;
  const dp = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    let prevDiag = 0;
    for (let j = 1; j <= m; j++) {
      const save = dp[j];
      dp[j] = A[i - 1] === B[j - 1] ? prevDiag + 1 : Math.max(dp[j], dp[j - 1]);
      prevDiag = save;
    }
  }
  return (2 * dp[m]) / (n + m);
}

// ---------------------------------------------------------------------------
// Geo — haversine distance in kilometres.
// ---------------------------------------------------------------------------
export function haversineKm(la, lo, lb, lng) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lb - la);
  const dLng = rad(lng - lo);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(la)) * Math.cos(rad(lb)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function geoDist(a, b) {
  return haversineKm(a.lat, a.lng, b.lat, b.lng);
}

// ---------------------------------------------------------------------------
// Time — showtimes as minutes-from-midnight arrays.
// ---------------------------------------------------------------------------
export function hhmmToMin(t) {
  if (typeof t !== 'string') return null;
  const m = /^(\d{2}):(\d{2})$/.exec(t.trim());
  return m ? +m[1] * 60 + +m[2] : null;
}

export function minToHhmm(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Showtimes for a post: JSON array preferred, else the description's HH:MM. */
export function parseTimes(post, descTime = null) {
  let raw = null;
  try {
    const j = JSON.parse(post.showtimes);
    if (Array.isArray(j) && j.length) raw = j;
  } catch { /* not JSON / empty */ }
  const list = raw ?? (descTime ? [descTime] : []);
  const mins = list.map(hhmmToMin).filter((t) => t !== null);
  if (mins.length === 0 && descTime) {
    const d = hhmmToMin(descTime);
    if (d !== null) return [d];
  }
  return mins.sort((a, b) => a - b);
}

/** Minimum pairwise minute gap between two time arrays; Infinity if any empty. */
export function timeGapMin(ta, tb) {
  if (ta.length === 0 || tb.length === 0) return Infinity;
  let best = Infinity;
  for (const x of ta) for (const y of tb) best = Math.min(best, Math.abs(x - y));
  return best;
}

// ---------------------------------------------------------------------------
// Description parsing -> normalized event.
// ---------------------------------------------------------------------------
/** "Tytuł: HH:MM, lokalizacja" -> { title, time, loc } (seed description format).
 *  Falls back to the LAST loose HH:MM in the string so single-digit hours
 *  ("9:00") and colons inside titles still yield a time. */
export function descParts(description) {
  const d = String(description || '');
  const m = d.match(/^(.+?):\s*(\d{2}:\d{2}),\s*(.*)$/);
  if (m) return { title: m[1].trim(), time: m[2], loc: m[3].trim() };
  const loose = [...d.matchAll(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$|,)/g)];
  if (loose.length > 0) {
    const last = loose[loose.length - 1];
    const idx = last.index;
    const hm = `${last[1].padStart(2, '0')}:${last[2]}`;
    return { title: d.slice(0, idx).trim().replace(/[,;:]$/, ''), time: hm, loc: '' };
  }
  return { title: d.trim(), time: null, loc: '' };
}

export function toEvent(post) {
  const { title, time, loc } = descParts(post.description);
  const venue = loc.split(',')[0].trim();
  return {
    id: post.id,
    external_id: post.external_id,
    provider: providerOf(post.external_id),
    title,
    venue,
    loc,
    day: post.event_date,
    lat: typeof post.lat === 'number' ? post.lat : null,
    lng: typeof post.lng === 'number' ? post.lng : null,
    status: post.status,
    times: parseTimes(post, time),
  };
}

// ---------------------------------------------------------------------------
// Pairwise predicates (independent implementation).
// ---------------------------------------------------------------------------
export function hasCoords(e) {
  return typeof e.lat === 'number' && typeof e.lng === 'number';
}

export function isZeroGeo(e) {
  return e.lat === 0 && e.lng === 0;
}

export function geoWithin(e, f, geoKm) {
  return hasCoords(e) && hasCoords(f) && geoDist(e, f) <= geoKm;
}

export function venueRatio(a, b) {
  const va = flatNorm(a.venue).trim();
  const vb = flatNorm(b.venue).trim();
  if (!va && !vb) return 1;
  if (!va || !vb) return 0;
  return seqRatio(va, vb);
}

/** Venue match: fuzzy ratio >= 0.8, or geo <= geoKm when a venue is unknown. */
export function venueMatch(a, b, geoKm = 1.5) {
  const va = flatNorm(a.venue).trim();
  const vb = flatNorm(b.venue).trim();
  if (va && vb) return seqRatio(va, vb) >= 0.8;
  return geoWithin(a, b, geoKm);
}

/**
 * Do the venue strings share at least one token? Used by Pass A grouping so a
 * dense city block does not chain completely unrelated events into one blob
 * ("Amy Gadiaga" at Klub Jassmine vs "BAYONNE" at BARdzo bardzo, 400m apart).
 * NOTE: one generic shared token ("teatr"/"scena"/"muzeum") is still enough to
 * chain same-district theater events together — classification then splits them
 * (venue-ratio rule), so the report stays safe; grouping is deliberately loose.
 * An unknown/empty venue trusts geo instead.
 */
export function venueTokenOverlap(a, b) {
  const ta = new Set(foldDiacritics(a.venue).match(TOKEN_RE) ?? []);
  const tb = new Set(foldDiacritics(b.venue).match(TOKEN_RE) ?? []);
  if (ta.size === 0 || tb.size === 0) return true;
  for (const w of ta) if (tb.has(w)) return true;
  return false;
}

export function titleContainment(a, b) {
  return containment(
    tokensOfTitle(a.title, a.venue),
    tokensOfTitle(b.title, b.venue),
  );
}

/** Title match for grouping: same provider needs identical tokens (1.0). */
export function titleMatch(a, b, containmentCross = 0.8, containmentSame = 1.0) {
  const min = a.provider === b.provider ? containmentSame : containmentCross;
  return titleContainment(a, b) >= min;
}

// ---------------------------------------------------------------------------
// Classification — is this pair SAFE to merge? (damage / collateral analysis)
//   'same'       — high-confidence duplicate: title AND venue name agree
//                  (fuzzy ratio >= 0.8). Auto-merge would only drop redundant
//                  posts. Close geo ALONE never yields 'same' (two distinct
//                  venues 300m apart can share a generic title token — e.g.
//                  "Muzeum Sztuki Nowoczesnej" vs "Muzeum Jana Pawła II").
//   'ambiguous'  — venue/geo agree but title evidence is weak or zero, OR
//                  title agrees but only geo is close (verbose vs terse venue
//                  strings). EITHER two real events sharing a venue slot (the
//                  "przy świecach" series trap) OR a real duplicate. Human
//                  decision; never auto-merge.
//   'different'  — neither venue nor geo close: different events.
// ---------------------------------------------------------------------------
export function classifyPair(a, b, opts = {}) {
  const { geoKm = 1.5, containmentCross = 0.8, containmentSame = 1.0 } = opts;
  const cont = titleContainment(a, b);
  const min = a.provider === b.provider ? containmentSame : containmentCross;
  const geoOk = geoWithin(a, b, geoKm);
  const vr = venueRatio(a, b);
  const venueOk = vr >= 0.8;
  const meta = { cont, venueRatio: Number(vr.toFixed(3)), geoKm: geoOk ? Number(geoDist(a, b).toFixed(3)) : null };

  if (cont >= min && venueOk) return { kind: 'same', ...meta };
  if (geoOk || venueOk) return { kind: 'ambiguous', ...meta };
  return { kind: 'different', ...meta };
}

// ---------------------------------------------------------------------------
// Grouping — union-find over a day's events.
//   Pass A: same day + geo <= geoKm + any two showtimes within timeMin (±1h)
//           + venues share a token (requireVenueForTime, default on).
//   Pass B: same day + geo <= geoKm + title containment (cross 0.8 / same 1.0).
// ---------------------------------------------------------------------------
export function unionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  return { find, union };
}

export function findSuspiciousGroups(events, opts = {}) {
  const {
    geoKm = 1.5,
    timeMin = 60,
    containmentCross = 0.8,
    containmentSame = 1.0,
    includeCinemas = false,
    // Pass A (geo+time) additionally requires the venues to share a token, so a
    // dense city block does not chain unrelated events into one blob ("Amy
    // Gadiaga" at Klub Jassmine vs "BAYONNE" at BARdzo bardzo, 400m apart).
    requireVenueForTime = true,
  } = opts;

  const byDay = new Map();
  for (const e of events) {
    if (!includeCinemas && CINEMA_SOURCES.has(e.provider)) continue;
    if (isZeroGeo(e)) continue; // no-geo posts reported separately
    const arr = byDay.get(e.day) ?? [];
    arr.push(e);
    byDay.set(e.day, arr);
  }

  const groups = [];
  for (const [day, arr] of byDay) {
    const uf = unionFind(arr.length);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (uf.find(i) === uf.find(j)) continue;
        const geoOk = geoWithin(a, b, geoKm);
        if (!geoOk) continue;
        const passA = timeGapMin(a.times, b.times) <= timeMin && (!requireVenueForTime || venueTokenOverlap(a, b));
        const passB = titleMatch(a, b, containmentCross, containmentSame);
        if (passA || passB) uf.union(i, j);
      }
    }
    const byRoot = new Map();
    arr.forEach((e, i) => {
      const r = uf.find(i);
      const l = byRoot.get(r) ?? [];
      l.push(e);
      byRoot.set(r, l);
    });
    for (const members of byRoot.values()) {
      if (members.length >= 2) groups.push(analyzeGroup(members, { day, geoKm, containmentCross, containmentSame }));
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Merge simulation + damage analysis for one group.
// ---------------------------------------------------------------------------
export function compareEvents(a, b) {
  return priorityOf(a.provider) - priorityOf(b.provider) ||
    a.title.localeCompare(b.title) ||
    (a.times.length ? a.times[0] : 1440) - (b.times.length ? b.times[0] : 1440);
}

export function unionTimes(members) {
  const out = new Set();
  for (const m of members) {
    for (const t of m.times.length ? m.times : []) out.add(t);
  }
  return [...out].sort((a, b) => a - b);
}

export function analyzeGroup(members, opts = {}) {
  const { geoKm = 1.5, containmentCross = 0.8, containmentSame = 1.0 } = opts;
  const sorted = [...members].sort(compareEvents);
  const winner = sorted[0];
  const losers = sorted.slice(1);
  const mergedTimes = unionTimes(members);
  const pairs = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      pairs.push({
        a: members[i].external_id,
        b: members[j].external_id,
        ...classifyPair(members[i], members[j], { geoKm, containmentCross, containmentSame }),
        gapMin: timeGapMin(members[i].times, members[j].times),
      });
    }
  }
  return {
    day: winner.day,
    members,
    winner,
    losers,
    mergedTimes,
    mergedTimesRaw: mergedTimes.map(minToHhmm),
    pairs,
  };
}

// ---------------------------------------------------------------------------
// Coverage / damage summary across all groups.
// ---------------------------------------------------------------------------
export function summarize(groups) {
  const involved = new Set();
  let pairs = 0;
  const kinds = { same: 0, ambiguous: 0, different: 0 };
  const providerPairs = { sameProvider: 0, crossProvider: 0 };
  for (const g of groups) {
    for (const m of g.members) involved.add(m.id);
    for (const p of g.pairs) {
      pairs++;
      kinds[p.kind]++;
      const a = g.members.find((m) => m.external_id === p.a);
      const b = g.members.find((m) => m.external_id === p.b);
      if (a.provider === b.provider) providerPairs.sameProvider++;
      else providerPairs.crossProvider++;
    }
  }
  return { groups: groups.length, involvedPosts: involved.size, pairs, ...kinds, ...providerPairs };
}