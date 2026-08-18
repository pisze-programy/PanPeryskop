// Worker executor ("sposób wykonania" = worker): providers assigned to the CF
// Workers edge. The actual running happens in the existing queue pipeline
// (seed/pipeline + the Worker cron in src/index.ts) — this executor only says
// WHICH providers belong to it, so enabledProviders() and the pipeline stay
// registry-driven.
import { EXECUTOR, Executor } from './types';
import type { ProviderConfig } from '../providers/registry';

export const workerExecutor: Executor = {
  id: EXECUTOR.WORKER,
  providerIds: (configs) => configs
    .filter((c) => c.enabled && c.executors.worker === true)
    .map((c) => c.id),
};
