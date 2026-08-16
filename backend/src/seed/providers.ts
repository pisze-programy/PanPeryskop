import { SeedProvider } from './types';
import { goingProvider } from './going';
import { kupbilecikProvider } from './kupbilecik';
import { dzisappProvider } from './dzisapp';
import { eventyliveProvider } from './eventylive';

export const SEED_PROVIDERS: SeedProvider[] = [
  goingProvider,
  kupbilecikProvider,
  dzisappProvider,
  eventyliveProvider,
];

export function enabledProviders(): SeedProvider[] {
  return SEED_PROVIDERS.filter((p) => p.enabled);
}
