// Consumer entry: dispatch a queue batch. v2 only carries `{ type: 'unit' }`
// wake-ups; the durable work-list (seed_units) is the source of truth, so one
// wake-up drains the pending WORKER units. Per-message ack/retry keeps one slow
// message from nuking the batch.
import { QUEUE_CONSUMER_CONCURRENCY, QUEUE_RETRY_DELAY_SECONDS } from '../../core/constants';
import { EnvQ, SeedQueueMessage } from './types';
import { handleUnitWake } from './unitHandler';

export async function runQueue(env: EnvQ, batch: MessageBatch<SeedQueueMessage>): Promise<void> {
  const CONCURRENCY = QUEUE_CONSUMER_CONCURRENCY;
  const msgs = [...batch.messages];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, msgs.length) }, async () => {
    while (cursor < msgs.length) {
      const msg = msgs[cursor++];
      try {
        if (msg.body.type === 'unit') await handleUnitWake(env);
        msg.ack();
      } catch (e) {
        console.error(`queue unit wake attempt ${msg.attempts} failed: ${(e as Error).message}`);
        msg.retry({ delaySeconds: QUEUE_RETRY_DELAY_SECONDS });
      }
    }
  });
  await Promise.all(workers);
}
