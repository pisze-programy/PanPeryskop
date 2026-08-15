// Provider registry. New sources register here with their own transport:
// 'fetch' (like goingapp) or 'browser' (like kupbilecik, behind Bot Fight Mode).
import { SeedProvider } from './types';
import { goingProvider } from './going';
import { kupbilecikProvider } from './kupbilecik';

export const SEED_PROVIDERS: SeedProvider[] = [goingProvider, kupbilecikProvider];

export function enabledProviders(): SeedProvider[] {
  return SEED_PROVIDERS.filter((p) => p.enabled);
}
