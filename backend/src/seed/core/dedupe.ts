import { SeedCandidate, ProviderId } from './types';
import { toWarsawIso } from './dates';
import { priorityOf } from '../providers/registry';
import {
  titleTokens, linkKey, filmSlug, isUkrainian, venuesMatch, containment, isTba,
} from './match';

// Canonical-link preference: when several sources carry the same event, the one
// with the LOWEST rank wins — its link/geo becomes canonical. Lower is better.
// Rank lives in the provider registry (single source of truth).
const sourceRank = (s: ProviderId): number => priorityOf(s);

// Dedupe scope is the DAY (not the hour): "godzina może być różna" — providers
// list the same event at slightly different hours, and PL/UA film versions run
// at different times in the same cinema.
const dayKey = (startMs: number): string => toWarsawIso(startMs).slice(0, 10);

export function dedupe(events: SeedCandidate[]): SeedCandidate[] {
  const byDay = new Map<string, SeedCandidate[]>();
  for (const e of events) {
    const k = dayKey(e.startMs);
    const arr = byDay.get(k);
    if (arr) arr.push(e);
    else byDay.set(k, [e]);
  }

  const out: SeedCandidate[] = [];
  for (const arr of byDay.values()) {
    const n = arr.length;
    const slugOf = arr.map((e) => filmSlug(e.link, e.source));
    const tokensOf = arr.map((e) => titleTokens(e.title, e.venue));

    const parent = arr.map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    // R1 — same event page (identical link). Same link is authoritative UNLESS
    // both sides have distinct known venues: cinema-city shares ONE per-film link
    // across all its cinemas, so that must not collapse them.
    const byLink = new Map<string, number[]>();
    arr.forEach((e, i) => {
      const k = linkKey(e.link);
      if (k) { const l = byLink.get(k) ?? []; l.push(i); byLink.set(k, l); }
    });
    for (const idx of byLink.values()) {
      for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
        const x = arr[idx[a]], y = arr[idx[b]];
        const bothKnown = !!x.venue.trim() && !!y.venue.trim() && !isTba(x.venue) && !isTba(y.venue);
        if (!bothKnown || venuesMatch(x, y)) union(idx[a], idx[b]);
      }
    }

    // R2 — film slug (PL/UA versions of the same film) at the same venue.
    const bySlug = new Map<string, number[]>();
    arr.forEach((_, i) => {
      const k = slugOf[i];
      if (k) { const l = bySlug.get(k) ?? []; l.push(i); bySlug.set(k, l); }
    });
    for (const idx of bySlug.values()) {
      for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
        if (venuesMatch(arr[idx[a]], arr[idx[b]])) union(idx[a], idx[b]);
      }
    }

    // R3 — title containment + venue match. Different film slugs rule the pair
    // out (e.g. "NMF: Noc Władcy Pierścieni" vs "Noc Władcy Pierścieni").
    // Same-source pairs need IDENTICAL tokens (1.0) — two real concerts of the
    // "przy świecach" series share 0.8 and must stay separate.
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      if (find(a) === find(b)) continue;
      const sa = slugOf[a], sb = slugOf[b];
      if (sa && sb && sa !== sb) continue;
      const minContainment = arr[a].source === arr[b].source ? 1.0 : 0.8;
      if (containment(tokensOf[a], tokensOf[b], minContainment) && venuesMatch(arr[a], arr[b])) union(a, b);
    }

    // Pick the canonical per group: lowest priority, then the non-UA version,
    // then the earliest start. Winner's hour = earliest in the group.
    const groups = new Map<number, number[]>();
    arr.forEach((_, i) => { const r = find(i); const l = groups.get(r) ?? []; l.push(i); groups.set(r, l); });
    for (const idx of groups.values()) {
      if (idx.length < 2) { out.push(arr[idx[0]]); continue; }
      const members = idx.map((i) => arr[i]).sort((x, y) =>
        sourceRank(x.source) - sourceRank(y.source) ||
        (isUkrainian(x.title) ? 1 : 0) - (isUkrainian(y.title) ? 1 : 0) ||
        x.startMs - y.startMs
      );
      const winner = members[0];
      winner.startMs = Math.min(...members.map((m) => m.startMs));
      out.push(winner);
    }
  }
  return out;
}

export function buildDescription(c: SeedCandidate): string {
  const hm = toWarsawIso(c.startMs).slice(11, 16); // HH:MM
  const cityNorm = (c.city || '').trim().toLowerCase();
  const street = (c.address || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => !/^\d{2}-\d{3}$/.test(s))
    .filter((s) => s.toLowerCase() !== cityNorm)
    .join(', ');
  const loc = [c.venue, street].filter(Boolean).join(', ');
  return `${c.title}: ${hm}, ${loc}`.slice(0, 130);
}
