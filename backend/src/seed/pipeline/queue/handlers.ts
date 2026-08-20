// Per-type queue handlers for the phase queues (fetch/ingest/finalize).
// Each handler is idempotent so retries and DLQ re-drives never duplicate work:
// batch/scope/candidate terminal states gate every step.
import { nanoid } from 'nanoid';
import { enabledProviders } from '../../providers';
import { SeedContext, ProviderId, CandidateStatus } from '../../core/types';
import { warsawMidnightMs, eventCreatedAtMs, eventDayEndMs } from '../../core/dates';
import { detectMediaType, extForMediaType } from '../../../core/mediaFormat';
import { doSavePost } from '../../../api/posts';
import { TTL_MS } from '../../../core/models';
import { dedupe, buildDescription, showtimesJson, showtimeBookingJson } from '../../core/dedupe';
import { dropCancelled, rescueRealShows, isCancelled } from '../../core/filters';
import { buildVenueCache } from '../../providers/eventylive';
import { resolveKupGeo } from '../../providers/kupbilecik';
import { writeSeedRun } from '../../core/log';
import { EnvQ, SeedQueueMessage } from './types';
import {
  CandRow, countNonTerminalCandidates, getBatch, getOrCreateSeedUser,
  getScope, listScopes, now, setBatchStatus, setScopeStatus, toCandidate,
} from './state';
import { sendChunked } from './produce';

export async function handleSeedDay(env: EnvQ, m: Extract<SeedQueueMessage, { type: 'seed-day' }>): Promise<void> {
  const batch = await getBatch(env, m.batchId);
  if (!batch || batch.status === 'done' || batch.status === 'failed') return; // closed — drop
  const dayStart = warsawMidnightMs(m.day);
  const createdAt = eventCreatedAtMs(m.day);
  if (createdAt < now() - TTL_MS) throw new Error(`created_at (${new Date(createdAt).toISOString()}) too far in the past`);

  await setBatchStatus(env, m.batchId, 'fetching');

  // Build the shared venue geo cache once (eventylive city scopes read it from D1
  // instead of each re-fetching dzis.app). Best-effort — a failure leaves the
  // cache empty and eventylive falls back to city centers.
  try {
    const ctx: SeedContext = {
      env: env as unknown as Env, day: m.day,
      dayStart, dayEnd: eventDayEndMs(m.day), createdAt,
      recordBrowserMs: () => {},
    };
    await buildVenueCache(ctx, m.day);
  } catch (e) {
    console.error(`seed venue-cache build failed: ${(e as Error).message}`);
  }

  const { results } = await env.DB.prepare("SELECT provider, scope FROM seed_scopes WHERE batch_id=? AND status='pending'").bind(m.batchId).all<{ provider: string; scope: string }>();
  const msgs: MessageSendRequest<SeedQueueMessage>[] = (results || []).map((r) => ({
    body: { type: 'fetch', batchId: m.batchId, provider: r.provider, scope: r.scope },
  }));
  if (msgs.length) {
    await sendChunked(env, env.SEED_FETCH_QUEUE, msgs);
  } else {
    await env.SEED_FINALIZE_QUEUE.send({ type: 'finalize', batchId: m.batchId });
  }
}

export async function handleFetch(env: EnvQ, m: Extract<SeedQueueMessage, { type: 'fetch' }>): Promise<void> {
  const provider = enabledProviders().find((p) => p.id === m.provider);
  if (!provider) throw new Error(`unknown provider ${m.provider}`);
  if (!provider.scopes.includes(m.scope)) throw new Error(`unknown scope ${m.scope} for ${m.provider}`);
  const scope = await getScope(env, m.batchId, m.provider, m.scope);
  if (!scope || scope.status === 'done' || scope.status === 'failed') return; // idempotent / stale
  const batch = await getBatch(env, m.batchId);
  if (!batch) throw new Error(`batch ${m.batchId} not found`);
  if (batch.status === 'done' || batch.status === 'failed') return;

  const day = batch.day;
  const dayStart = warsawMidnightMs(day);

  await setScopeStatus(env, m.batchId, m.provider, m.scope, 'running');

  // Idempotency: if this scope already wrote candidates for the batch (a previous
  // attempt succeeded but later threw), skip the refetch — candidates are kept.
  const existingCount = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM seed_candidates WHERE batch_id=? AND provider=? AND scope=?'
  ).bind(m.batchId, m.provider, m.scope).first<{ n: number }>();
  if (existingCount && existingCount.n > 0) {
    await setScopeStatus(env, m.batchId, m.provider, m.scope, 'done');
    await env.DB.prepare('UPDATE seed_batches SET scopes_done = scopes_done + 1, updated_at=? WHERE id=?').bind(now(), m.batchId).run();
    await env.SEED_FINALIZE_QUEUE.send({ type: 'finalize', batchId: m.batchId });
    return;
  }

  const scopeStart = now();
  let browserMs = 0;
  const ctx: SeedContext = {
    env: env as unknown as Env,
    day,
    dayStart,
    dayEnd: eventDayEndMs(day),
    createdAt: eventCreatedAtMs(day),
    recordBrowserMs: (ms) => { browserMs += ms; },
  };

  const candidates = await provider.fetchScope(ctx, m.scope);
  const t = now();
  const stmt = env.DB.prepare(
    `INSERT INTO seed_candidates
      (id, batch_id, provider, scope, external_id, title, start_ms, lat, lng, city, venue, address, link, media_url, thumb_url,
       is_sold_out, geo_ref, showtimes, showtime_booking, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '${CandidateStatus.PENDING}', 0, ?, ?)`
  );
  for (const c of candidates) {
    await stmt.bind(nanoid(24), m.batchId, provider.id, m.scope, c.externalId, c.title, c.startMs,
      c.lat, c.lng, c.city, c.venue, c.address, c.link, c.mediaUrl, c.thumbUrl,
      c.isSoldOut ? 1 : 0, c.geoRef || null, showtimesJson(c), showtimeBookingJson(c), t, t).run();
  }

  // Log per-scope run (duration + browser ms) to seed_runs so the dashboard and
  // browser budget reflect queue-driven seeds, not just the sync runner.
  await writeSeedRun(env as unknown as Env, {
    runType: batch.run_type, day, provider: m.provider, transport: provider.transport,
    candidates: candidates.length, ingested: 0, skipped: 0,
    errors: 0, errorDetail: null,
    durationMs: now() - scopeStart, browserMs,
  });

  await setScopeStatus(env, m.batchId, m.provider, m.scope, 'done');
  await env.DB.prepare('UPDATE seed_batches SET scopes_done = scopes_done + 1, updated_at=? WHERE id=?').bind(now(), m.batchId).run();
  await env.SEED_FINALIZE_QUEUE.send({ type: 'finalize', batchId: m.batchId });
}

// All scopes terminal → run dedupe once and enqueue ingest for survivors. Runs on
// the finalize queue so dedupe has its own retry/DLQ lifecycle; idempotent.
export async function handleFinalize(env: EnvQ, m: Extract<SeedQueueMessage, { type: 'finalize' }>): Promise<void> {
  const batch = await getBatch(env, m.batchId);
  if (!batch || batch.status === 'done' || batch.status === 'failed') return;

  // Wait until every scope is terminal (done or failed). The last scope to finish
  // enqueues this finalize; if one is stuck, the DLQ/watchdog drives it to failed
  // and re-enqueues finalize.
  const scopes = await listScopes(env, m.batchId);
  const open = scopes.filter((s) => s.status === 'pending' || s.status === 'running');
  if (open.length > 0) return;

  if (batch.status === 'created' || batch.status === 'fetching') {
    await runDedupe(env, m.batchId);
  } else if (batch.status === 'ingesting') {
    await maybeComplete(env, m.batchId);
  }
}

// Dedupe a batch's pending candidates, mark duplicates/no_media/no_coords, then
// enqueue ingest for survivors; with no survivors the batch is done.
async function runDedupe(env: EnvQ, batchId: string): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM seed_candidates WHERE batch_id=? AND status='${CandidateStatus.PENDING}'`
  ).bind(batchId).all<CandRow>();
  const dedupeInput = (results || []).map((r) => toCandidate(r, true));
  const pre = dropCancelled(dedupeInput);
  const merged = rescueRealShows(pre, dedupe(pre));
  const winnerRowIds = new Set(merged.map((x) => x.externalId));
  const t = now();
  const ingestMsgs: MessageSendRequest<SeedQueueMessage>[] = [];
  for (const row of results || []) {
    if (!winnerRowIds.has(row.id)) {
      await env.DB.prepare(`UPDATE seed_candidates SET status='${CandidateStatus.DUPLICATE}', reason=?, updated_at=? WHERE id=?`)
        .bind(isCancelled(row.title) ? 'title: cancelled' : 'dedupe: covered by another provider', t, row.id).run();
      continue;
    }
    if (!row.media_url) {
      await env.DB.prepare(`UPDATE seed_candidates SET status='${CandidateStatus.NO_MEDIA}', reason='missing media url', updated_at=? WHERE id=?`)
        .bind(t, row.id).run();
      continue;
    }
    if ((row.lat == null || row.lng == null) && row.provider !== ProviderId.KUPBILECIK) {
      // kupbilecik resolves geo after dedupe (see handleIngest) — only surviving
      // candidates pay for a possible venue-page browser call.
      await env.DB.prepare(`UPDATE seed_candidates SET status='${CandidateStatus.NO_COORDS}', reason='missing lat/lng', updated_at=? WHERE id=?`)
        .bind(t, row.id).run();
      continue;
    }
    ingestMsgs.push({ body: { type: 'ingest', candidateId: row.id, batchId } });
  }
  if (ingestMsgs.length) {
    await setBatchStatus(env, batchId, 'ingesting');
    await sendChunked(env, env.SEED_INGEST_QUEUE, ingestMsgs);
  } else {
    await setBatchStatus(env, batchId, 'done');
  }
}

export async function handleIngest(env: EnvQ, m: Extract<SeedQueueMessage, { type: 'ingest' }>): Promise<void> {
  const row = await env.DB.prepare('SELECT * FROM seed_candidates WHERE id=?').bind(m.candidateId).first<CandRow & { attempts: number }>();
  if (!row) return;
  if (row.status === CandidateStatus.DONE || row.status === CandidateStatus.ERROR) return; // idempotent

  await env.DB.prepare(`UPDATE seed_candidates SET status='${CandidateStatus.INGESTING}', attempts=attempts+1, updated_at=? WHERE id=?`).bind(now(), m.candidateId).run();
  try {
    const batch = await getBatch(env, row.batch_id);
    if (!batch) throw new Error(`batch ${row.batch_id} not found`);
    if (batch.status === 'done' || batch.status === 'failed') throw new Error(`batch ${row.batch_id} closed (${batch.status})`);
    const day = batch.day;
    const dayStart = warsawMidnightMs(day);
    const createdAt = eventCreatedAtMs(day);

    const cand = toCandidate(row);
    const user = await getOrCreateSeedUser(env.DB);
    const existing = await env.DB.prepare('SELECT id FROM posts WHERE external_id=?').bind(cand.externalId).first<{ id: string }>();
    const postId = existing?.id || nanoid(24);

    const provider = enabledProviders().find((p) => p.id === row.provider);
    if (!provider) throw new Error(`unknown provider ${row.provider}`);
    const ingestStart = now();
    let browserMs = 0;
    const ctx: SeedContext = {
      env: env as unknown as Env, day, dayStart,
      dayEnd: eventDayEndMs(day), createdAt,
      recordBrowserMs: (ms) => { browserMs += ms; },
    };

    // kupbilecik defers geo to after dedupe: resolve it now (shared venues store,
    // falling back to a venue-page browser call for unknowns).
    if (row.provider === ProviderId.KUPBILECIK && (cand.lat == null || cand.lng == null)) {
      const geo = await resolveKupGeo(ctx, cand.venue, row.geo_ref || '', day, cand.city);
      if (geo.lat == null || geo.lng == null) {
        // No geo available (venue not in the store and no venue-page coordinates).
        // Deterministic — retrying won't help, so mark terminal no_coords.
        await env.DB.prepare(`UPDATE seed_candidates SET status='${CandidateStatus.NO_COORDS}', reason=?, updated_at=? WHERE id=?`)
          .bind(`kupbilecik: no geo for venue "${cand.venue}"`, now(), m.candidateId).run();
        await maybeComplete(env, row.batch_id);
        return;
      }
      cand.lat = geo.lat;
      cand.lng = geo.lng;
    }

    // Optional provider hook: resolve the post link to the direct source (dzis.app).
    if (provider.resolveLink) {
      try { cand.link = await provider.resolveLink(ctx, cand); } catch { /* best-effort */ }
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
      mediaKey, thumbKey, createdAt, true, cand.link, cand.externalId, Boolean(existing), Boolean(cand.isSoldOut), showtimesJson(cand), showtimeBookingJson(cand));

    await env.DB.prepare(`UPDATE seed_candidates SET status='${CandidateStatus.DONE}', post_id=?, reason=NULL, updated_at=? WHERE id=?`)
      .bind(postId, now(), m.candidateId).run();

    await writeSeedRun(env as unknown as Env, {
      runType: batch.run_type, day, provider: row.provider, transport: provider.transport,
      candidates: 0, ingested: 1, skipped: 0, errors: 0, errorDetail: null,
      durationMs: now() - ingestStart, browserMs,
    });

    await maybeComplete(env, row.batch_id);
  } catch (e) {
    // Deterministic failures (no geo) were already marked terminal above; a truly
    // transient error is retried (→ DLQ → bounded re-drive). Mark the candidate so
    // audit shows it even if it ends up terminal via DLQ.
    await env.DB.prepare(`UPDATE seed_candidates SET status='${CandidateStatus.ERROR}', reason=?, updated_at=? WHERE id=?`)
      .bind((e as Error).message, now(), m.candidateId).run();
    await maybeComplete(env, row.batch_id);
    throw e; // → retry → DLQ
  }
}

// Mark the batch 'done' once every candidate is terminal. Only completes — dedupe
// must already have run (status 'ingesting'). Idempotent, safe to call often.
async function maybeComplete(env: EnvQ, batchId: string): Promise<void> {
  const batch = await getBatch(env, batchId);
  if (!batch || batch.status === 'done' || batch.status === 'failed') return;
  if (batch.status !== 'ingesting') return;
  const remaining = await countNonTerminalCandidates(env, batchId);
  if (remaining === 0) await setBatchStatus(env, batchId, 'done');
}
