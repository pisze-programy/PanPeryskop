export const queue = {
  // Cloudflare Queues sendBatch caps at 100 messages per call.
  sendBatchCap: 100,
  // D1 batch() caps at 100 statements — keep chunks well under it.
  d1BatchCap: 90,
  retryDelaySeconds: 30,
  // Respects the 6-connection limit + D1 writes.
  consumerConcurrency: 6,
} as const;
