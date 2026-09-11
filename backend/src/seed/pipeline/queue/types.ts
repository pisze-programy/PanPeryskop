// Queue message contract for the v2 seed pipeline. The queue is only a wake-up:
// the durable work-list (seed_units) is the source of truth. One message drains
// the pending worker units; VPS units are claimed over HTTP by the VPS consumer.
export type SeedQueueMessage = { type: 'unit'; unitId?: string };

// The seed pipeline runs with the full Worker Env (DB, R2, queues, secrets).
// Kept as a named alias for readability; no subset casting.
export type EnvQ = Env;
