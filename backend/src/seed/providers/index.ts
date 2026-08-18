import { SeedProvider } from '../core/types';
import { workerExecutor } from '../executors/worker';
import { PROVIDER_CONFIGS } from './registry';
import { goingProvider } from './going';
import { kupbilecikProvider } from './kupbilecik';
import { dzisappProvider } from './dzisapp';
import { eventyliveProvider } from './eventylive';
import { multikinoProvider } from './multikino';
import { cinemacityProvider } from './cinemacity';
import { heliosProvider } from './helios';
import { lumaProvider } from './luma';
import { meetupProvider } from './meetup';

// All implementations, in run order. Which of them actually run on the Worker
// edge is decided by the worker executor (registry: enabled + executors.worker) —
// this array is code, the registry is config.
export const SEED_PROVIDERS: SeedProvider[] = [
  goingProvider,
  kupbilecikProvider,
  dzisappProvider,
  eventyliveProvider,
  multikinoProvider,
  cinemacityProvider,
  heliosProvider,
  lumaProvider,
  meetupProvider,
];

export function enabledProviders(): SeedProvider[] {
  const workerIds = new Set(workerExecutor.providerIds(PROVIDER_CONFIGS));
  return SEED_PROVIDERS.filter((p) => workerIds.has(p.id));
}
