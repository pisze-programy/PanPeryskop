// Cross-source dedupe + description builder.
import { SeedCandidate } from './types';
import { toWarsawIso } from './dates';

function normVenue(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function dedupe(events: SeedCandidate[]): SeedCandidate[] {
  const seen = new Map<string, SeedCandidate>();
  const out: SeedCandidate[] = [];
  for (const e of events) {
    const key = `${Math.floor(e.startMs / 3600000)}|${normVenue(e.venue)}`;
    const prev = seen.get(key);
    if (prev) {
      if (e.source === 'going' && prev.source === 'kupbilecik') {
        const i = out.indexOf(prev);
        out[i] = e;
        seen.set(key, e);
      }
      continue;
    }
    seen.set(key, e);
    out.push(e);
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
