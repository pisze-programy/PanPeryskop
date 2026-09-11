import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendChunked, type SeedQueueMessage } from '../src/seed/pipeline/queue';

test('queue sendChunked: splits batches >100 into <=100 sendBatch calls', async () => {
  const sent: number[] = [];
  const queue = {
    sendBatch: async (msgs: unknown[]) => { sent.push(msgs.length); },
  } as unknown as Queue<SeedQueueMessage>;
  const msgs = Array.from({ length: 245 }, () => ({ body: { type: 'unit' } as const }));
  await sendChunked({} as never, queue, msgs);
  assert.deepEqual(sent, [100, 100, 45]);
});
