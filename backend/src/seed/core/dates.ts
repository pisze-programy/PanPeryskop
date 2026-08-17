import { DAY_MS, EVENT_VISIBLE_OFFSET_MS } from './constants';

export function todayWarsaw(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date()); // "YYYY-MM-DD"
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
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
export function warsawMidnightMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' });
  while (fmt.format(t) === isoDate) t -= 3_600_000;
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
