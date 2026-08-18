// Execution methods ("sposoby wykonywania") — WHERE a provider's fetch runs.
// Providers (seed/providers/*) are pure logic; executors are pluggable runtime.
// A provider is assigned to one or more executors in the registry
// (providers/registry.ts → ProviderConfig.executors). Adding a new way of
// execution = a new executor here + a key in that map — providers never change.
import type { ProviderConfig } from '../providers/registry';
import type { ProviderId } from '../core/types';

export const EXECUTOR = {
  /** CF Workers edge — the queue pipeline (src/index.ts + seed/pipeline). */
  WORKER: 'worker',
  /** VPS with residential egress — per-provider runners + seed-ingest upload. */
  VPS: 'vps',
} as const;
export type ExecutorId = (typeof EXECUTOR)[keyof typeof EXECUTOR];

/** Shared contract every executor implements: which providers it is responsible
 *  for (enabled AND assigned to it in the registry). */
export interface Executor {
  id: ExecutorId;
  providerIds(configs: ProviderConfig[]): ProviderId[];
}
