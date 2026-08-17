import { SeedProvider } from '../core/types';
import { goingProvider } from './going';
import { kupbilecikProvider } from './kupbilecik';
import { dzisappProvider } from './dzisapp';
import { eventyliveProvider } from './eventylive';
import { multikinoProvider } from './multikino';

export const SEED_PROVIDERS: SeedProvider[] = [
  goingProvider,
  kupbilecikProvider,
  dzisappProvider,
  eventyliveProvider,
  multikinoProvider,
];

export function enabledProviders(): SeedProvider[] {
  return SEED_PROVIDERS.filter((p) => p.enabled);
}
