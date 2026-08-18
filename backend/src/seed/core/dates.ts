import { DAY_MS, EVENT_VISIBLE_OFFSET_MS } from './constants';

// Build "YYYY-MM-DD" for a Warsaw-wall-clock instant WITHOUT relying on a locale's
// short-date format. Node 24 (Alpine, and newer macOS builds) stopped rendering
// `en-CA` as ISO — `fmt.format()` returned "08/18/2026", breaking every parser.
// formatToParts yields numeric fields regardless of locale/CLDR.
function warsawYmd(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms));
  const field = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${field('year')}-${field('month')}-${field('day')}`;
}

export function todayWarsaw(): string {
  return warsawYmd(Date.now());
}
export function tomorrowWarsaw(day = todayWarsaw()): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
// Add `n` calendar days to a YYYY-MM-DD string (Warsaw-calendar arithmetic).
export function addDaysWarsaw(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
// YYYY-MM-DD of a millisecond instant in Europe/Warsaw (day-browser key).
export function warsawDateOf(ms: number): string {
  return warsawYmd(ms);
}
export function warsawMidnightMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  while (warsawYmd(t) === isoDate) t -= 3_600_000;
  return t + 3_600_000;
}
// Event posts for a day become visible at 06:00 Europe/Warsaw (TTL window start).
export function eventCreatedAtMs(isoDate: string): number {
  return warsawMidnightMs(isoDate) + EVENT_VISIBLE_OFFSET_MS;
}
// Inclusive end of a Warsaw day.
export function eventDayEndMs(isoDate: string): number {
  return warsawMidnightMs(isoDate) + DAY_MS - 1;
}
export function warsawOffset(): string {
  const raw = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', timeZoneName: 'shortOffset' })
    .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')!.value; // "GMT+2"
  const off = raw.replace('GMT', '');
  const sign = off[0] === '-' ? '-' : '+';
  return `${sign}${off.replace(/^[+-]/, '').padStart(2, '0')}:00`;
}
export function toWarsawIso(ms: number): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(ms)).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${warsawOffset()}`;
}
