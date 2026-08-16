// Queue-based seed pipeline.
//   { type:'seed-day', batchId, day, runType }  → create batch, enqueue fetch-per-provider
//   { type:'fetch', batchId, provider }         → fetchCandidates → persist seed_candidates
//                                                → when all providers done: dedupe + enqueue ingest
//   { type:'ingest', candidateId }              → media→R2→D1; deterministic failures (no media,
//                                                bad coords, dup) are marked with reason; transient
//                                                errors throw → Cloudflare retries → DLQ.
// Audit lives in D1 seed_batches/seed_candidates (status + reason per candidate).
import { nanoid } from 'nanoid';
import { enabledProviders } from './providers';
import { SeedContext, SeedCandidate, ProviderId, CandidateStatus } from './types';
import { warsawMidnightMs } from './dates';
import { detectMediaType, extForMediaType, doSavePost } from '../posts';
import { TTL_MS } from '../models';
import { SEED_DEVICE_ID } from './constants';
import { dedupe, buildDescription } from './dedupe';
import { buildVenueCache } from './eventylive';
import { resolveKupGeo } from './kupbilecik';

export type SeedQueueMessage =
  | { type: 'seed-day'; batchId: string; day: string; runType: 'cron' | 'manual' }
  | { type: 'fetch'; batchId: string; provider: string; scope: string }
  | { type: 'dedupe'; batchId: string }
  | { type: 'ingest'; candidateId: string };

interface EnvQ {
  DB: D1Database;
  MEDIA: R2Bucket;
  SEED_QUEUE: Queue<SeedQueueMessage>;
}

async function getOrCreateSeedUser(db: D1Database): Promise<{ id: string }> {
  const existing = await db.prepare('SELECT id FROM users WHERE device_id = ?').bind(SEED_DEVICE_ID).first<{ id: string }>();
  if (existing) return existing;
  const id = nanoid(16);
  await db.prepare('INSERT INTO users (id, device_id, session_token, role, username, auth_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, SEED_DEVICE_ID, nanoid(48), 'user', 'PanPeryskop Seed', 'device', Date.now()).run();
  return { id };
}

export async function enqueueSeedDay(env: EnvQ, day: string, runType: 'cron' | 'manual'): Promise<string> {
  const batchId = nanoid(24);
  const now = Date.now();
  const scopesTotal = enabledProviders().reduce((a, p) => a + p.scopes.length, 0);
  await env.DB.prepare(
    `INSERT INTO seed_batches (id, day, run_type, status, providers_total, providers_done, scopes_total, scopes_done, created_at, updated_at)
     VALUES (?, ?, ?, 'created', ?, 0, ?, 0, ?, ?)`
  ).bind(batchId, day, runType, enabledProviders().length, scopesTotal, now, now).run();
  await env.SEED_QUEUE.send({ type: 'seed-day', batchId, day, runType });
  return batchId;
}

// Cloudflare Queues sendBatch caps at 100 messages per call — chunk larger batches.
export async function sendChunked(env: EnvQ, msgs: MessageSendRequest<SeedQueueMessage>[]): Promise<void> {
  for (let i = 0; i < msgs.length; i += 100) {
    await env.SEED_QUEUE.sendBatch(msgs.slice(i, i + 100));
  }
}

// Process a batch's messages concurrently (cap ~6 to respect the per-invocation
// 6-connection limit and D1's single-threaded write queue). Each message still
// gets independent retry/DLQ semantics.
export async function runQueue(env: EnvQ, batch: MessageBatch<SeedQueueMessage>): Promise<void> {
  const CONCURRENCY = 6;
  const msgs = [...batch.messages];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, msgs.length) }, async () => {
    while (cursor < msgs.length) {
      const msg = msgs[cursor++];
      try {
        await handleMessage(env, msg.body);
        msg.ack();
      } catch (e) {
        // Transient error → retry this message; on retry exhaustion Cloudflare moves
        // it to the configured DLQ. Retrying a single message (not the batch) avoids
        // re-running already-successful messages and duplicate candidates.
        console.error(`queue ${msg.body.type} attempt ${msg.attempts} failed: ${(e as Error).message}`);
        msg.retry({ delaySeconds: 30 });
      }
    }
  });
  await Promise.all(workers);
}

async function handleMessage(env: EnvQ, m: SeedQueueMessage): Promise<void> {
  switch (m.type) {
    case 'seed-day': return handleSeedDay(env, m);
    case 'fetch': return handleFetch(env, m);
    case 'dedupe': return handleDedupe(env, m);
    case 'ingest': return handleIngest(env, m);
  }
}

async function handleSeedDay(env: EnvQ, m: Extract<SeedQueueMessage, { type: 'seed-day' }>): Promise<void> {
  const now = Date.now();
  const dayStart = warsawMidnightMs(m.day);
  const createdAt = dayStart + 6 * 3600 * 1000;
  if (createdAt < now - TTL_MS) throw new Error(`created_at (${new Date(createdAt).toISOString()}) too far in the past`);

  await env.DB.prepare('UPDATE seed_batches SET status=?, updated_at=? WHERE id=?').bind('fetching', now, m.batchId).run();

  // Build the shared venue geo cache once (eventylive city scopes read it from D1
  // instead of each re-fetching dzis.app). Best-effort — a failure leaves the
  // cache empty and eventylive falls back to city centers.
  try {
    const ctx: SeedContext = {
      env: env as unknown as Env, day: m.day,
      dayStart, dayEnd: dayStart + 24 * 3600 * 1000 - 1, createdAt,
      recordBrowserMs: () => {},
    };
    await buildVenueCache(ctx, m.day);
  } catch (e) {
    console.error(`seed venue-cache build failed: ${(e as Error).message}`);
  }

  const msgs: MessageSendRequest<SeedQueueMessage>[] = [];
  for (const p of enabledProviders()) {
    for (const scope of p.scopes) {
      msgs.push({ body: { type: 'fetch', batchId: m.batchId, provider: p.id, scope } });
    }
  }
  await sendChunked(env, msgs);
}

async function handleFetch(env: EnvQ, m: Extract<SeedQueueMessage, { type: 'fetch' }>): Promise<void> {
  const provider = enabledProviders().find((p) => p.id === m.provider);
  if (!provider) throw new Error(`unknown provider ${m.provider}`);
  if (!provider.scopes.includes(m.scope)) throw new Error(`unknown scope ${m.scope} for ${m.provider}`);
  const batch = await env.DB.prepare('SELECT day FROM seed_batches WHERE id=?').bind(m.batchId).first<{ day: string }>();
  if (!batch) throw new Error(`batch ${m.batchId} not found`);
  const day = batch.day;
  const dayStart = warsawMidnightMs(day);

  // Idempotency: if this scope already wrote candidates for the batch, this is a
  // retry — skip to avoid duplicates.
  const existingCount = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM seed_candidates WHERE batch_id=? AND provider=? AND scope=?'
  ).bind(m.batchId, m.provider, m.scope).first<{ n: number }>();
  if (existingCount && existingCount.n > 0) {
    // Already fetched; still count as done for this scope.
    const now = Date.now();
    await env.DB.prepare('UPDATE seed_batches SET scopes_done = scopes_done + 1, updated_at=? WHERE id=?').bind(now, m.batchId).run();
    const pb = await env.DB.prepare('SELECT scopes_total, scopes_done FROM seed_batches WHERE id=?').bind(m.batchId).first<{ scopes_total: number; scopes_done: number }>();
    if (pb && pb.scopes_done >= pb.scopes_total) {
      await env.DB.prepare('UPDATE seed_batches SET status=?, updated_at=? WHERE id=?').bind(CandidateStatus.INGESTING, now, m.batchId).run();
      await env.SEED_QUEUE.send({ type: 'dedupe', batchId: m.batchId });
    }
    return;
  }

  const ctx: SeedContext = {
    env: env as unknown as Env,
    day,
    dayStart,
    dayEnd: dayStart + 24 * 3600 * 1000 - 1,
    createdAt: dayStart + 6 * 3600 * 1000,
    recordBrowserMs: () => {},
  };

  const candidates = await provider.fetchScope(ctx, m.scope);
  const now = Date.now();
  const stmt = env.DB.prepare(
    `INSERT INTO seed_candidates
      (id, batch_id, provider, scope, external_id, title, start_ms, lat, lng, city, venue, address, link, media_url, thumb_url,
       is_sold_out, geo_ref, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '${CandidateStatus.PENDING}', 0, ?, ?)`
  );
  for (const c of candidates) {
    await stmt.bind(nanoid(24), m.batchId, provider.id, m.scope, c.externalId, c.title, c.startMs,
      c.lat, c.lng, c.city, c.venue, c.address, c.link, c.mediaUrl, c.thumbUrl,
      c.isSoldOut ? 1 : 0, c.geoRef || null, now, now).run();
  }

  // Mark this scope done; when all are done, dedupe + enqueue ingest.
  await env.DB.prepare('UPDATE seed_batches SET scopes_done = scopes_done + 1, updated_at=? WHERE id=?').bind(now, m.batchId).run();
  const pb = await env.DB.prepare('SELECT scopes_total, scopes_done FROM seed_batches WHERE id=?').bind(m.batchId).first<{ scopes_total: number; scopes_done: number }>();
  if (pb && pb.scopes_done >= pb.scopes_total) {
    await env.DB.prepare('UPDATE seed_batches SET status=?, updated_at=? WHERE id=?').bind(CandidateStatus.INGESTING, now, m.batchId).run();
    await env.SEED_QUEUE.send({ type: 'dedupe', batchId: m.batchId });
  }
}

interface CandRow {
  id: string; external_id: string; provider: ProviderId; title: string; start_ms: number;
  lat: number | null; lng: number | null; city: string; venue: string; address: string;
  link: string; media_url: string | null; thumb_url: string | null;
  status?: CandidateStatus; is_sold_out?: number; geo_ref?: string | null;
}

// Dedupe a batch's pending candidates, mark duplicates/no_media/no_coords, then
// enqueue ingest for survivors. Runs from a dedicated message so a retry always
// targets the same batch (no more "latest ingesting" guessing).
async function handleDedupe(env: EnvQ, m: Extract<SeedQueueMessage, { type: 'dedupe' }>): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM seed_candidates WHERE batch_id=? AND status=CandidateStatus.PENDING"
  ).bind(m.batchId).all<CandRow>();
  // For dedupe identification, externalId = row.id (unique); the real
  // external_id stays on the row and is used at ingest.
  const dedupeInput = (results || []).map((r) => toCandidate(r, true));
  const merged = dedupe(dedupeInput);
  const winnerRowIds = new Set(merged.map((x) => x.externalId));
  const now = Date.now();
  const ingestMsgs: MessageSendRequest<SeedQueueMessage>[] = [];
  for (const row of results || []) {
    if (!winnerRowIds.has(row.id)) {
      // duplicate (or removed by all-day collapse) — log with reason
      await env.DB.prepare("UPDATE seed_candidates SET status=CandidateStatus.DUPLICATE, reason=?, updated_at=? WHERE id=?")
        .bind('dedupe: covered by another provider', now, row.id).run();
      continue;
    }
    if (!row.media_url) {
      await env.DB.prepare("UPDATE seed_candidates SET status=CandidateStatus.NO_MEDIA, reason='missing media url', updated_at=? WHERE id=?")
        .bind(now, row.id).run();
      continue;
    }
    if ((row.lat == null || row.lng == null) && row.provider !== ProviderId.KUPBILECIK) {
      // kupbilecik resolves geo after dedupe (see handleIngest) — only surviving
      // candidates pay for a possible venue-page browser call.
      await env.DB.prepare("UPDATE seed_candidates SET status=CandidateStatus.NO_COORDS, reason='missing lat/lng', updated_at=? WHERE id=?")
        .bind(now, row.id).run();
      continue;
    }
    ingestMsgs.push({ body: { type: 'ingest', candidateId: row.id } });
  }
  if (ingestMsgs.length) await sendChunked(env, ingestMsgs);
  else await env.DB.prepare('UPDATE seed_batches SET status=?, updated_at=? WHERE id=?').bind(CandidateStatus.DONE, now, m.batchId).run();
}

async function handleIngest(env: EnvQ, m: Extract<SeedQueueMessage, { type: 'ingest' }>): Promise<void> {
  // Real ingest of a single candidate.
  const row = await env.DB.prepare('SELECT * FROM seed_candidates WHERE id=?').bind(m.candidateId).first<CandRow & { batch_id: string; attempts: number }>();
  if (!row) return;
  if (row.status === CandidateStatus.DONE || row.status === CandidateStatus.ERROR) return; // idempotent

  await env.DB.prepare("UPDATE seed_candidates SET status=CandidateStatus.INGESTING, attempts=attempts+1, updated_at=? WHERE id=?").bind(Date.now(), m.candidateId).run();
  try {
    // createdAt = 06:00 Europe/Warsaw of the batch day (TTL window start).
    const batch = await env.DB.prepare('SELECT day FROM seed_batches WHERE id=?').bind(row.batch_id).first<{ day: string }>();
    if (!batch) throw new Error(`batch ${row.batch_id} not found`);
    const createdAt = warsawMidnightMs(batch.day) + 6 * 3600 * 1000;

    const cand = toCandidate(row);
    const user = await getOrCreateSeedUser(env.DB);
    const existing = await env.DB.prepare('SELECT id FROM posts WHERE external_id=?').bind(cand.externalId).first<{ id: string }>();
    const postId = existing?.id || nanoid(24);

    const provider = enabledProviders().find((p) => p.id === row.provider);
    if (!provider) throw new Error(`unknown provider ${row.provider}`);
    const ctx: SeedContext = {
      env: env as unknown as Env, day: batch.day, dayStart: warsawMidnightMs(batch.day),
      dayEnd: warsawMidnightMs(batch.day) + 24 * 3600 * 1000 - 1, createdAt, recordBrowserMs: () => {},
    };

    // kupbilecik defers geo to after dedupe: resolve it now (shared venues store,
    // falling back to a venue-page browser call for unknowns).
    if (row.provider === ProviderId.KUPBILECIK && (cand.lat == null || cand.lng == null)) {
      const geo = await resolveKupGeo(ctx, cand.venue, row.geo_ref || '', batch.day, cand.city);
      if (geo.lat == null || geo.lng == null) {
        throw new Error(`kupbilecik ${cand.externalId}: no geo for venue "${cand.venue}"`);
      }
      cand.lat = geo.lat;
      cand.lng = geo.lng;
    }

    const mediaBytes = await provider.fetchBytes(ctx, cand.mediaUrl!);
    const mediaType = detectMediaType(mediaBytes);
    if (!mediaType || !mediaType.startsWith('image/')) throw new Error(`bad media ${mediaType || 'unknown'}`);
    const mediaKey = `posts/${postId}/media.${extForMediaType(mediaType)}`;
    await env.MEDIA.put(mediaKey, mediaBytes, { httpMetadata: { contentType: mediaType } });

    let thumbKey: string | null = null;
    if (cand.thumbUrl) {
      try {
        const thumbBytes = await provider.fetchBytes(ctx, cand.thumbUrl);
        const thumbType = detectMediaType(thumbBytes) ?? 'image/webp';
        thumbKey = `posts/${postId}/thumb.${extForMediaType(thumbType)}`;
        await env.MEDIA.put(thumbKey, thumbBytes, { httpMetadata: { contentType: thumbType } });
      } catch { thumbKey = null; }
    }

    const description = buildDescription(cand);
    await doSavePost(env as unknown as Env, user, postId, 'photo', cand.lat!, cand.lng!, description,
      mediaKey, thumbKey, createdAt, true, cand.link, cand.externalId, Boolean(existing), Boolean(cand.isSoldOut));

    await env.DB.prepare("UPDATE seed_candidates SET status=CandidateStatus.DONE, post_id=?, reason=NULL, updated_at=? WHERE id=?")
      .bind(postId, Date.now(), m.candidateId).run();

    // Finalize the batch once every candidate is in a terminal state.
    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM seed_candidates WHERE batch_id=? AND status NOT IN (CandidateStatus.DONE, CandidateStatus.DUPLICATE, CandidateStatus.NO_MEDIA, CandidateStatus.NO_COORDS, CandidateStatus.ERROR)"
    ).bind(row.batch_id).first<{ n: number }>();
    if (remaining && remaining.n === 0) {
      await env.DB.prepare('UPDATE seed_batches SET status=?, updated_at=? WHERE id=?').bind(CandidateStatus.DONE, Date.now(), row.batch_id).run();
    }
  } catch (e) {
    await env.DB.prepare("UPDATE seed_candidates SET status=CandidateStatus.ERROR, reason=?, updated_at=? WHERE id=?")
      .bind((e as Error).message, Date.now(), m.candidateId).run();
    throw e; // → retry → DLQ
  }
}

export function toCandidate(row: CandRow, forDedupe = false): SeedCandidate {
  return {
    source: row.provider,
    externalId: forDedupe ? row.id : row.external_id,
    title: row.title, startMs: row.start_ms,
    lat: row.lat, lng: row.lng, city: row.city, venue: row.venue, address: row.address,
    link: row.link, mediaUrl: row.media_url || '', thumbUrl: row.thumb_url,
    isSoldOut: row.is_sold_out === 1,
    geoRef: row.geo_ref || null,
  };
}
