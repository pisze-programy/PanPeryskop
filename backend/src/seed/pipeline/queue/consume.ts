import { CONFIG } from '../../../config/index';

import { EnvQ, SeedQueueMessage } from './types';
import { handleUnitWake } from './unitHandler';
import { handleFinalizeWake } from './finalize';

export async function runQueue(env: EnvQ, batch: MessageBatch<SeedQueueMessage>): Promise<void> {
  const CONCURRENCY = CONFIG.queue.consumerConcurrency;
  const msgs = [...batch.messages];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, msgs.length) }, async () => {
    while (cursor < msgs.length) {
      const msg = msgs[cursor++];
      try {
        if (msg.body.type === 'unit') await handleUnitWake(env);
        else if (msg.body.type === 'finalize') await handleFinalizeWake(env, msg.body.day, msg.body.batchId);
        msg.ack();
      } catch (e) {
        console.error(`queue unit wake attempt ${msg.attempts} failed: ${(e as Error).message}`);
        msg.retry({ delaySeconds: CONFIG.queue.retryDelaySeconds });
      }
    }
  });
  await Promise.all(workers);
}
