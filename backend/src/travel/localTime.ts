import { CONFIG } from '../config/index';

export function resolveZone(country: string, city: string): string | null {
  const cityZone = CONFIG.travel.timezones.byCity[city.trim().toLowerCase()];
  if (cityZone) return cityZone;
  return CONFIG.travel.timezones.byCountry[country.trim()] ?? null;
}

export function localParts(ms: number, zone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export function localDateTime(ms: number, country: string, city: string): { date: string; time: string } | null {
  const zone = resolveZone(country, city);
  if (!zone) return null;
  return localParts(ms, zone);
}
