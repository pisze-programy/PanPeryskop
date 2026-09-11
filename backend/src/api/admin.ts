import { Hono } from 'hono';
import { STATUS_APPROVED, STATUS_REJECTED, CATEGORY_EVENTS } from '../core/models';
import { todayWarsaw, addDaysWarsaw } from '../seed/core/dates';
import { SEED_DAYS_AHEAD } from '../seed/core/constants';
import { CANONICAL_TAG_SET } from '../seed/core/tags';
import { recordSeedDigest } from '../seed/digest';
import { claimUnit, completeUnit, failUnit, unitDayStatus, unitWindowDays } from '../seed/pipeline/queue/units';
import { writeRawRows } from '../seed/pipeline/queue/raw';
import { warsawDateOf } from '../seed/core/dates';
import { D1_BATCH_STATEMENT_CAP, SEED_REFILL_AHEAD } from '../seed/core/constants';
import { SeedCandidate } from '../seed/core/types';
import { parseCandidate, isProviderId } from '../seed/core/candidate';
import { finalizeIfReady, ingestWinnersForDay } from '../seed/reconcile';
import { ingestMtpEvent, MtpEventInput } from '../seed/manual/mtp';
import { getLastSeedDay, seedDue } from '../seed/cadence';
import { SEED_INTERVAL_DAYS } from '../seed/core/constants';
import { upsertTravelEvents, sanitizeManifest, TravelManifest, TravelEvent } from '../travel/store';

export const adminRoutes = new Hono<{ Bindings: Env }>();

export function adminAuth(c: { env: Env; req: { header: (n: string) => string | undefined } }): boolean {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  return Boolean(c.env.ADMIN_SECRET) && token === c.env.ADMIN_SECRET;
}

/** Auth for the seed unit endpoints only: the scoped VPS token OR the admin
 *  secret (for manual/CLI use). A compromised VPS never gets full admin. */
export function unitAuth(c: { env: Env; req: { header: (n: string) => string | undefined } }): boolean {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return (Boolean(c.env.SEED_VPS_TOKEN) && token === c.env.SEED_VPS_TOKEN)
    || (Boolean(c.env.ADMIN_SECRET) && token === c.env.ADMIN_SECRET);
}
// Current status of a post by external_id — lets seed-ingest skip entries whose
// post was manually rejected (never re-approve them).
adminRoutes.get('/posts/by-external/:ext', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const row = await c.env.DB
    .prepare('SELECT status FROM posts WHERE external_id = ?')
    .bind(c.req.param('ext'))
    .first<{ status: string }>();
  return c.json({ status: row?.status ?? null });
});

// All rejected external_ids — seed-ingest fetches this ONCE (not per entry) so a
// 2000+ entry manifest upload does not hammer the API with per-row lookups.
adminRoutes.get('/seed/rejected', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const { results } = await c.env.DB
    .prepare('SELECT external_id FROM posts WHERE status = ? AND external_id IS NOT NULL')
    .bind(STATUS_REJECTED)
    .all<{ external_id: string }>();
  return c.json({ ids: (results || []).map((r) => r.external_id) });
});

// All approved event external_ids — seed-ingest resumes a crashed/partial upload
// by skipping posts that already exist instead of reprocessing every entry.
adminRoutes.get('/seed/existing', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const { results } = await c.env.DB
    .prepare(`SELECT external_id FROM posts WHERE status = '${STATUS_APPROVED}' AND external_id IS NOT NULL`)
    .all<{ external_id: string }>();
  return c.json({ ids: (results || []).map((r) => r.external_id) });
});

// Active event-blacklist rules — seed-ingest fetches this ONCE (not per entry)
// so it can skip blacklisted events BEFORE downloading their media.
adminRoutes.get('/seed/blacklist', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const { results } = await c.env.DB
    .prepare('SELECT id, pattern, venue, partner_id, partner_name FROM event_blacklist WHERE active = 1')
    .all<{ id: string; pattern: string; venue: string | null; partner_id: string | null; partner_name: string | null }>();
  return c.json({ rules: results ?? [] });
});

// Seed cadence — the VPS warms and the orchestrator read this to run only on
// seed (full-window refill) days.
adminRoutes.get('/seed/cadence', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const last = await getLastSeedDay(c.env.DB);
  const today = todayWarsaw();
  // due = a refill is due (cron will run) OR the refill already ran today (lastSeedDay
  // === today — the VPS/warms run AFTER the 02:00 UTC cron sets the marker).
  return c.json({ due: seedDue(last, today) || last === today, lastSeedDay: last, today, interval: SEED_INTERVAL_DAYS });
});

// Reject posts by external_id (a batch) — used by one-off duplicate cleanups.
adminRoutes.post('/seed/reject', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ ids?: unknown; reason?: unknown }>().catch(() => ({})) as { ids?: unknown; reason?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_-]{1,200}$/i.test(x)) : [];
  if (ids.length === 0) return c.json({ error: 'ids required' }, 400);
  const reason = typeof body.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : null;
  const ph = ids.map(() => '?').join(',');
  const db = c.env.DB;
  const { results } = await db.prepare(`SELECT external_id FROM posts WHERE external_id IN (${ph}) AND status <> '${STATUS_REJECTED}'`).bind(...ids).all<{ external_id: string }>();
  const matched = (results || []).map((r) => r.external_id);
  if (matched.length) {
    const mh = matched.map(() => '?').join(',');
    await db.prepare(`UPDATE posts SET status = '${STATUS_REJECTED}', rejection_reason = ? WHERE external_id IN (${mh})`).bind(reason, ...matched).run();
  }
  return c.json({ rejected: matched.length, requested: ids.length });
});

// Backfill affiliate links on already-live seed posts (going): swap link_url to
// the TD click URL and preserve the plain goingapp URL in source_url. Idempotent
// — once source_url is set, later calls are no-ops (guard keeps re-runs cheap).
// seed-ingest calls this for existing entries that now carry an affiliate_link.
adminRoutes.post('/seed/affiliate', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ external_id?: unknown; link_url?: unknown; source_url?: unknown }>().catch(() => ({})) as { external_id?: unknown; link_url?: unknown; source_url?: unknown };
  const ext = typeof body.external_id === 'string' ? body.external_id.trim() : '';
  const isHttp = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\/.+/.test(v);
  const linkUrl = isHttp(body.link_url) ? body.link_url.trim() : '';
  const sourceUrl = isHttp(body.source_url) ? body.source_url.trim() : null;
  if (!ext || !linkUrl) return c.json({ error: 'external_id and link_url required' }, 400);
  if (ext.length > 200) return c.json({ error: 'Invalid external_id' }, 400);
  const res = await c.env.DB
    .prepare(`UPDATE posts SET link_url = ?, source_url = ? WHERE external_id = ? AND category = '${CATEGORY_EVENTS}' AND status <> '${STATUS_REJECTED}' AND (source_url IS NULL OR source_url = '')`)
    .bind(linkUrl, sourceUrl, ext)
    .run();
  return c.json({ updated: res.meta.changes });
});

// Per-source per-day approved-event counts over the seed window — the VPS
adminRoutes.post('/seed/digest', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req
    .json<{ day?: unknown; provider?: unknown; status?: unknown; candidates?: unknown; ingested?: unknown; errors?: unknown; message?: unknown }>()
    .catch(() => ({}) as Record<string, unknown>);
  const day = typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : null;
  const provider = typeof body.provider === 'string' && body.provider ? body.provider : null;
  const status = body.status === 'ok' || body.status === 'partial' || body.status === 'failed' ? body.status : null;
  if (!day || !provider || !status) return c.json({ error: 'Invalid day/provider/status' }, 400);
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const message = typeof body.message === 'string' && body.message.trim() ? body.message : undefined;
  await recordSeedDigest(c.env, {
    day, provider, status,
    candidates: num(body.candidates), ingested: num(body.ingested), errors: num(body.errors), message,
  });
  return c.json({ ok: true });
});

// Per-source per-day approved-event counts over the seed window — the VPS
// orchestrator uses it to detect window gaps (a provider that missed a day) and
// self-heal with a backfill.
adminRoutes.get('/seed/coverage', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const today = todayWarsaw();
  const window = Array.from({ length: SEED_DAYS_AHEAD + 1 }, (_, i) => addDaysWarsaw(today, i));
  const { results } = await c.env.DB.prepare(
    `SELECT substr(external_id, 1, instr(external_id, '-') - 1) AS source, event_date, COUNT(*) AS n
     FROM posts
     WHERE status = '${STATUS_APPROVED}' AND category = '${CATEGORY_EVENTS}' AND external_id IS NOT NULL
       AND event_date BETWEEN ?1 AND ?2
     GROUP BY source, event_date`
  ).bind(window[0], window[window.length - 1]).all<{ source: string; event_date: string; n: number }>();
  const counts: Record<string, Record<string, number>> = {};
  for (const r of results || []) {
    (counts[r.source] ??= {})[r.event_date] = r.n;
  }
  return c.json({ window, counts });
});

// Warm/refresh the ebilet feed cache in R2. api.tradedoubler.com rejects Cloudflare
// Workers egress (HTTP 400, empty body — a WAF, same class as the VPS-executor
// origins), while a plain residential/browser download works. The Worker provider
// reads this R2 cache (seed/ebilet-feed.json) and falls back to it whenever its own
// download fails, so an external job (VPS/mac) pushes the feed here on change.
// Body = the raw productsUnlimited JSON response.
adminRoutes.post('/seed/ebilet/feed', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.text();
  if (!body || body.length < 1000 || !body.includes('"products"')) {
    return c.json({ error: 'Invalid feed body' }, 400);
  }
  await c.env.MEDIA.put('seed/ebilet-feed.json', body, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { feedUpdated: 'external' },
  });
  return c.json({ ok: true, bytes: body.length });
});

// Warm the Eventim (Awin) feed into R2. The VPS awin-warm job downloads the slim
// 14-column datafeed (advertiser 19044 / feed 99885), parses CSV → JSON and posts
// the event rows here; the Worker provider reads only its batch day from
// seed/awin-eventim.json.
adminRoutes.post('/seed/awin/feed', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<unknown>().catch(() => null);
  if (!Array.isArray(body) || body.length < 10) return c.json({ error: 'Invalid feed body' }, 400);
  await c.env.MEDIA.put('seed/awin-eventim.json', JSON.stringify(body), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { feedUpdated: new Date().toISOString() },
  });
  return c.json({ ok: true, events: body.length });
});

// Manual MTP (Targi Poznańskie) backfill — the annual calendar is pulled once a
// year by backend/scripts/mtp-backfill.mjs and posted here as a JSON batch of
// per-day fair events (geo fixed to the MTP complex; each starts 00:00 Warsaw).
adminRoutes.post('/seed/mtp', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<MtpEventInput[]>().catch(() => null);
  if (!Array.isArray(body) || body.length === 0) return c.json({ error: 'events[] required' }, 400);
  const results = [];
  for (const ev of body) {
    if (!ev || !ev.externalId || !ev.title || !/^\d{4}-\d{2}-\d{2}$/.test(ev.day || '') || !ev.link || !ev.imageUrl) {
      results.push({ externalId: ev?.externalId || '?', status: 'error', reason: 'invalid fields' });
      continue;
    }
    results.push(await ingestMtpEvent(c.env, ev));
  }
  return c.json({ ok: true, results });
});

// Warm one day of kupbilecik events into R2. The official API returns the WHOLE
// future catalog (~60 MB JSON) — too big to parse per-day on the Worker. An external
// job (VPS/mac) downloads it once and pushes a per-day manifest (trimmed events for
// one window day) here; the provider reads only its batch day. R2 key:
// seed/kupbilecik/<day>.json
adminRoutes.post('/seed/kupbilecik/day', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ day?: unknown; events?: unknown }>().catch(() => ({} as { day?: unknown; events?: unknown }));
  const day = typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : null;
  const events = Array.isArray(body.events) ? body.events : null;
  if (!day || !events) return c.json({ error: 'day + events[] required' }, 400);
  if (events.length > 2000) return c.json({ error: 'too many events' }, 400);
  await c.env.MEDIA.put(`seed/kupbilecik/${day}.json`, JSON.stringify(events), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { feedUpdated: 'external' },
  });
  return c.json({ ok: true, day, events: events.length });
});

// Durable unit work-list (v2 producer/consumer): claim exactly one claimable unit
// for an executor (pending, or a claimed one whose lease expired). Returns the
// claim token the caller must present to /raw, /complete or /fail.
adminRoutes.post('/seed/units/claim', async (c) => {
  if (!unitAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ executor?: unknown }>().catch(() => ({} as { executor?: unknown }));
  if (body.executor !== 'worker' && body.executor !== 'vps') {
    return c.json({ error: 'executor must be worker or vps' }, 400);
  }
  const unit = await claimUnit(c.env.DB, body.executor);
  return c.json({ unit });
});

// Stage fetched candidates for a claimed unit into seed_raw (the VPS has no D1
// binding). Candidates are grouped by their Warsaw event day; the batch is capped
// at the D1 statement cap. Only the claim owner (token) may write.
adminRoutes.post('/seed/units/:id/raw', async (c) => {
  if (!unitAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const unitId = c.req.param('id');
  const body = await c.req.json<{ token?: unknown; candidates?: unknown }>()
    .catch(() => ({} as { token?: unknown; candidates?: unknown }));
  if (typeof body.token !== 'string' || !body.token) return c.json({ error: 'token required' }, 400);
  if (!Array.isArray(body.candidates)) return c.json({ error: 'candidates[] required' }, 400);
  if (body.candidates.length > D1_BATCH_STATEMENT_CAP) return c.json({ error: `too many candidates (max ${D1_BATCH_STATEMENT_CAP})` }, 400);

  const unit = await c.env.DB
    .prepare('SELECT id, day, kind, batch_id, provider, status, claimed_by FROM seed_units WHERE id=?')
    .bind(unitId)
    .first<{ id: string; day: string; kind: string; batch_id: string; provider: string; status: string; claimed_by: string | null }>();
  if (!unit) return c.json({ error: 'unit not found' }, 404);
  if (unit.status !== 'claimed' || unit.claimed_by !== body.token) return c.json({ error: 'unit not claimed by this token' }, 409);

  // Validate each candidate; a malformed hit is rejected with a reason (returned),
  // never silently dropped. Missing title/image/link/date is NOT a reject — it is
  // carried as a pending reason and the post is created PENDING.
  const source = unit.provider;
  if (!isProviderId(source)) return c.json({ error: `unknown provider ${source}` }, 400);
  const parsed = body.candidates.map((v, i) => parseCandidate(v, source, i));
  const rejected = parsed.flatMap((r) => (r.ok ? [] : [r.reason]));

  // Keep only the unit's window days (window providers return extra days). A
  // candidate with no date is filed under the unit's day as PENDING.
  const allowed = new Set(unitWindowDays({ day: unit.day, kind: unit.kind === 'window' ? 'window' : 'day' }));
  const groups = new Map<string, SeedCandidate[]>();
  let outOfWindow = 0;
  for (const r of parsed) {
    if (!r.ok) continue;
    const cand = r.cand;
    const day = cand.startMs > 0 ? warsawDateOf(cand.startMs) : unit.day;
    if (!allowed.has(day)) { outOfWindow += 1; continue; }
    const arr = groups.get(day);
    if (arr) arr.push(cand);
    else groups.set(day, [cand]);
  }
  let rowsWritten = 0;
  for (const [day, candidates] of groups) {
    rowsWritten += await writeRawRows(c.env.DB, { day, batchId: unit.batch_id, unitId, provider: unit.provider, candidates }, D1_BATCH_STATEMENT_CAP);
  }
  if (rejected.length) console.warn(`seed unit ${unitId}: rejected ${rejected.length} candidate(s): ${rejected.slice(0, 5).join('; ')}${rejected.length > 5 ? ' …' : ''}`);
  if (outOfWindow) console.warn(`seed unit ${unitId}: dropped ${outOfWindow} out-of-window candidate(s)`);
  return c.json({ ok: true, rowsWritten, rejected, outOfWindow });
});

// Mark a claimed unit done (rowsWritten = raw rows staged) or failed with a reason.
// The claim token (returned by /claim) must be presented — only the owner may
// finish a unit.
adminRoutes.post('/seed/units/complete', async (c) => {
  if (!unitAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ unitId?: unknown; token?: unknown; rowsWritten?: unknown; error?: unknown }>()
    .catch(() => ({} as { unitId?: unknown; token?: unknown; rowsWritten?: unknown; error?: unknown }));
  if (typeof body.unitId !== 'string' || !body.unitId) return c.json({ error: 'unitId required' }, 400);
  if (typeof body.token !== 'string' || !body.token) return c.json({ error: 'token required' }, 400);
  if (typeof body.error === 'string' && body.error) {
    const ok = await failUnit(c.env.DB, body.unitId, body.token, body.error);
    return ok ? c.json({ ok: true, status: 'failed' }) : c.json({ error: 'unit not claimed by this token' }, 409);
  }
  const rows = typeof body.rowsWritten === 'number' && Number.isFinite(body.rowsWritten) ? Math.max(0, Math.floor(body.rowsWritten)) : 0;
  const ok = await completeUnit(c.env.DB, body.unitId, body.token, rows);
  if (!ok) return c.json({ error: 'unit not claimed by this token' }, 409);
  // Trigger reconcile+ingest for every event day this unit could have written.
  const unit = await c.env.DB
    .prepare('SELECT day, kind, batch_id FROM seed_units WHERE id=?')
    .bind(body.unitId)
    .first<{ day: string; kind: string; batch_id: string }>();
  if (unit) {
    const days = unit.kind === 'window'
      ? Array.from({ length: SEED_REFILL_AHEAD + 1 }, (_, i) => addDaysWarsaw(unit.day, i))
      : [unit.day];
    for (const d of days) {
      try { await finalizeIfReady(c.env, d, unit.batch_id); } catch (e) { console.error(`finalize ${d} failed: ${(e as Error).message}`); }
    }
  }
  return c.json({ ok: true, status: 'done' });
});

// Manual finalize sweep: reconcile+ingest every window day (or one ?day=).
// The repair path when a completion happened before the deploy that wired the
// trigger, or for a watchdog sweep.
adminRoutes.post('/seed/finalize', async (c) => {
  if (!unitAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ day?: unknown }>().catch(() => ({} as { day?: unknown }));
  const one = typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : null;
  const today = todayWarsaw();
  const days = one === null ? Array.from({ length: SEED_REFILL_AHEAD + 1 }, (_, i) => addDaysWarsaw(today, i)) : [one];
  const done: string[] = [];
  for (const d of days) {
    // batchId is only used for reconciliation_failures provenance; use the day's
    // latest unit's batch if present.
    const u = await c.env.DB.prepare('SELECT batch_id FROM seed_units WHERE day IN (?, ?) ORDER BY created_at DESC LIMIT 1')
      .bind(d, today).first<{ batch_id: string }>();
    if (!u) continue;
    if (await finalizeIfReady(c.env, d, u.batch_id)) done.push(d);
  }
  return c.json({ ok: true, reconciled: done });
});

// Bounded winner-ingest batch: turns up to `limit` reconciled winners of a day
// into posts. Call repeatedly until remaining=0 (keeps each request short).
adminRoutes.post('/seed/ingest', async (c) => {
  if (!unitAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ day?: unknown; limit?: unknown }>().catch(() => ({} as { day?: unknown; limit?: unknown }));
  if (typeof body.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.day)) return c.json({ error: 'day=YYYY-MM-DD required' }, 400);
  const limit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.min(Math.max(Math.floor(body.limit), 1), 200) : 50;
  return c.json(await ingestWinnersForDay(c.env, body.day, limit));
});

// Counts by unit status for one day — the reconcile gate and today's debug view.
adminRoutes.get('/seed/units/status', async (c) => {
  if (!unitAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const day = String(c.req.query('day') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return c.json({ error: 'day=YYYY-MM-DD required' }, 400);
  return c.json({ day, counts: await unitDayStatus(c.env.DB, day) });
});

// One-off data cleanup: delete all event posts earlier than today (Europe/Warsaw),
// their R2 media and dependent rows (reports/likes/dislikes/views/shares).
// Without ?source it removes events earlier than today; with ?source=a,b it
// removes ALL events from those sources (source = external_id prefix) regardless
// of date — used to retire a provider.
// Optional ?before=YYYY-MM-DD narrows the date cutoff to event_date < before
// (one-off backfills loop over days instead of one giant sweep).
adminRoutes.post('/events/cleanup', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const db = c.env.DB;
  const source = String(c.req.query('source') ?? '').trim();
  const sources = source ? source.split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9_-]+$/.test(s)) : [];
  let scope: string;
  let binds: unknown[];
  let limit = 500;
  if (sources.length) {
    const ph = sources.map(() => `substr(external_id,1,instr(external_id,'-')-1) = ?`).join(' OR ');
    scope = `category='${CATEGORY_EVENTS}' AND (${ph})`;
    binds = sources;
  } else {
    const before = String(c.req.query('before') ?? '').trim();
    const day = String(c.req.query('day') ?? '').trim();
    const limitRaw = String(c.req.query('limit') ?? '').trim();
    if (before && !/^\d{4}-\d{2}-\d{2}$/.test(before)) return c.json({ error: 'before=YYYY-MM-DD required' }, 400);
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return c.json({ error: 'day=YYYY-MM-DD required' }, 400);
    limit = Math.min(Math.max(parseInt(limitRaw || '500', 10) || 500, 1), 500);
    if (day) {
      scope = `category='${CATEGORY_EVENTS}' AND event_date = ?1`;
      binds = [day];
    } else {
      const cutoff = before || todayWarsaw();
      const cutoffStart = Date.parse(`${cutoff}T00:00:00+02:00`);
      scope = `category='${CATEGORY_EVENTS}' AND (event_date < ?1 OR (event_date IS NULL AND created_at < ?2))`;
      binds = [cutoff, cutoffStart];
    }
  }

  const { results } = await db.prepare(
    `SELECT id, media_key, thumb_key FROM posts WHERE ${scope} LIMIT ?`
  ).bind(...binds, limit).all<{ id: string; media_key: string | null; thumb_key: string | null }>();
  const rows = results || [];
  if (!rows.length) return c.json({ deleted: 0, mediaDeleted: 0 });

  // Remove R2 objects (media + thumb) for the deleted posts — parallel batches.
  const keys = rows.flatMap((r) => [r.media_key, r.thumb_key]).filter((k): k is string => !!k);
  let mediaDeleted = 0;
  const CONCURRENCY = 100;
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const chunk = keys.slice(i, i + CONCURRENCY);
    const res = await Promise.allSettled(chunk.map((k) => c.env.MEDIA.delete(k)));
    mediaDeleted += res.filter((r) => r.status === 'fulfilled').length;
  }

  // Delete exactly the selected rows (chunked IN-lists) — never more than we
  // cleaned in R2 above, so no orphaned objects are left behind.
  // NOTE: D1 caps bound variables at 100 per statement — keep chunks below that.
  const ids = rows.map((r) => r.id);
  const ID_CHUNK = 90;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const ph = chunk.map(() => '?').join(',');
    for (const table of ['reports', 'likes', 'dislikes', 'views', 'shares']) {
      await db.prepare(`DELETE FROM ${table} WHERE post_id IN (${ph})`).bind(...chunk).run();
    }
    await db.prepare(`DELETE FROM posts WHERE id IN (${ph})`).bind(...chunk).run();
  }

  return c.json({ deleted: rows.length, mediaDeleted });
});

adminRoutes.post('/posts/:id/approve', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const db = c.env.DB;
  const postId = c.req.param('id');

  await db.prepare('UPDATE posts SET status = ?, rejection_reason = NULL WHERE id = ?').bind(STATUS_APPROVED, postId).run();
  return c.json({ ok: true });
});

adminRoutes.post('/posts/:id/reject', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);

  const db = c.env.DB;
  const postId = c.req.param('id');

  const body = await c.req
    .json<{ reason?: unknown }>()
    .catch(() => ({}) as { reason?: unknown });
  const reason =
    typeof body.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : null;

  await db
    .prepare('UPDATE posts SET status = ?, rejection_reason = ? WHERE id = ?')
    .bind(STATUS_REJECTED, reason, postId)
    .run();
  return c.json({ ok: true, rejection_reason: reason });
});

// Set a post's tags directly (Bearer/CLI) — mirrors the admin dashboard tag edit:
// only canonical ids pass, and the post is LOCKED so the seed never overwrites it.
adminRoutes.post('/posts/:id/tags', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ tags?: unknown }>().catch(() => ({}) as { tags?: unknown });
  const raw = Array.isArray(body.tags) ? body.tags : null;
  const tags = raw ? [...new Set(raw.filter((t): t is string => typeof t === 'string' && CANONICAL_TAG_SET.has(t)))].sort() : null;
  if (!raw || !tags) return c.json({ error: 'Invalid tags' }, 400);
  await c.env.DB
    .prepare('UPDATE posts SET tags = ?, tags_locked = 1 WHERE id = ?')
    .bind(JSON.stringify(tags), c.req.param('id'))
    .run();
  return c.json({ ok: true, tags });
});

adminRoutes.post('/ban', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);

  const db = c.env.DB;
  const body = await c.req
    .json<{ device_id?: unknown; reason?: unknown }>()
    .catch(() => ({}) as { device_id?: unknown; reason?: unknown });

  if (typeof body.device_id !== 'string' || body.device_id.length === 0) {
    return c.json({ error: 'device_id is required' }, 400);
  }

  const reason =
    typeof body.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : null;

  await db
    .prepare('INSERT INTO banned_devices (device_id, reason, banned_at) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET reason = excluded.reason')
    .bind(body.device_id, reason, Date.now())
    .run();
  return c.json({ ok: true, device_id: body.device_id, reason });
});

adminRoutes.post('/unban', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);

  const db = c.env.DB;
  const body = await c.req
    .json<{ device_id?: unknown }>()
    .catch(() => ({}) as { device_id?: unknown });

  if (typeof body.device_id !== 'string' || body.device_id.length === 0) {
    return c.json({ error: 'device_id is required' }, 400);
  }

  await db.prepare('DELETE FROM banned_devices WHERE device_id = ?').bind(body.device_id).run();
  return c.json({ ok: true, device_id: body.device_id });
});

// No moderation/no media — upsert by (provider, external_id), idempotent.
adminRoutes.post('/travel/ingest', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const manifest = (await c.req.json().catch(() => null)) as TravelManifest | null;
  if (!manifest || !Array.isArray(manifest.events) || typeof manifest.provider !== 'string') {
    return c.json({ error: 'Invalid manifest' }, 400);
  }
  if (manifest.events.length > 100_000) return c.json({ error: 'Manifest too large' }, 400);
  let events: TravelEvent[];
  try {
    events = sanitizeManifest(manifest);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  await upsertTravelEvents(c.env.DB, events);
  return c.json({ ok: true, provider: manifest.provider, ingested: events.length });
});
