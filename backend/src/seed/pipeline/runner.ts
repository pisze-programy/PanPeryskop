// Seed runner: iterate enabled providers, dedupe, ingest, log per-provider runs
// to D1 (seed_runs), track Browser Run budget. Shared by cron + /admin/seed.
import { nanoid } from 'nanoid';
import { detectMediaType, extForMediaType } from '../../core/mediaFormat';
import { doSavePost } from '../../api/posts';
import { TTL_MS, STATUS_APPROVED, STATUS_PENDING } from '../../core/models';
import { SeedProvider, SeedProviderResult, SeedResult, SeedContext, RunType, SeedCandidate, ProviderId } from '../core/types';
import { enabledProviders } from '../providers';
import { warsawMidnightMs, tomorrowWarsaw, eventCreatedAtMs, eventDayEndMs } from '../core/dates';
import { buildDescription, dedupe, showtimesJson, showtimeBookingJson, tagsJson } from '../core/dedupe';
import { fallbackSeedGeo } from '../core/geo';
import { dropCancelled, rescueRealShows } from '../core/filters';
import { resolveKupGeo } from '../providers/kupbilecik';
import { writeSeedRun, browserBudget, BrowserBudget } from '../core/log';
import { SEED_DEVICE_ID } from '../core/constants';

async function getOrCreateSeedUser(env: Env): Promise<{ id: string }> {
  const existing = await env.DB
    .prepare('SELECT id FROM users WHERE device_id = ?')
    .bind(SEED_DEVICE_ID)
    .first<{ id: string }>();
  if (existing) return existing;
  const id = nanoid(16);
  await env.DB
    .prepare('INSERT INTO users (id, device_id, session_token, role, username, auth_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, SEED_DEVICE_ID, nanoid(48), 'user', 'PanPeryskop Seed', 'device', Date.now())
    .run();
  return { id };
}

export async function runSeed(env: Env, day: string, runType: RunType = 'manual'): Promise<SeedResult> {
  const dayStart = warsawMidnightMs(day);
  const createdAt = eventCreatedAtMs(day);
  const now = Date.now();
  if (createdAt < now - TTL_MS) throw new Error(`created_at (${new Date(createdAt).toISOString()}) too far in the past`);

  const user = await getOrCreateSeedUser(env);
  const totalStart = Date.now();
  const allCandidates: SeedProviderResult[] = [];
  const collected: { candidate: SeedCandidate; provider: string }[] = [];

  for (const provider of enabledProviders()) {
    const start = Date.now();
    let browserMs = 0;
    const ctx: SeedContext = {
      env,
      day,
      dayStart,
      dayEnd: eventDayEndMs(day),
      createdAt,
      recordBrowserMs: (ms) => { browserMs += ms; },
    };
    const providerResult: SeedProviderResult = {
      provider: provider.id,
      transport: provider.transport,
      candidates: 0, ingested: 0, skipped: 0, errors: [], durationMs: 0, browserMs: 0,
    };
    try {
      const candidates = await provider.fetchCandidates(ctx);
      providerResult.candidates = candidates.length;
      providerResult.browserMs = browserMs;
      collected.push(...candidates.map((candidate) => ({ candidate, provider: provider.id })));
    } catch (e) {
      providerResult.errors.push({ externalId: '(provider)', error: (e as Error).message });
      console.error(`seed ${runType} provider=${provider.id} failed: ${(e as Error).message}`);
    }
    providerResult.durationMs = Date.now() - start;
    allCandidates.push(providerResult);

    console.log(`seed ${runType} day=${day} provider=${provider.id} transport=${provider.transport} candidates=${providerResult.candidates} errors=${providerResult.errors.length} durationMs=${providerResult.durationMs} browserMs=${providerResult.browserMs}`);
  }

  // Ingest phase: one provider's fetchBytes is used per candidate (dispatch by source).
  const bySource = new Map<string, SeedProvider>();
  for (const p of enabledProviders()) bySource.set(p.id, p);

  const collectedCands = collected.map((x) => x.candidate);
  const pre = dropCancelled(collectedCands);
  const merged = rescueRealShows(pre, dedupe(pre));
  let totalIngested = 0, totalSkipped = 0;
  const allErrors: { externalId: string; error: string }[] = [];

  for (const c of merged) {
    const provider = bySource.get(c.source);
    const providerResult = allCandidates.find((r) => r.provider === c.source)!;
    if (!provider || !providerResult) continue;
    let pendingGeo = false;
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number') {
      // kupbilecik defers geo to after dedupe (venue store → browser fallback).
      if (c.source === ProviderId.KUPBILECIK && c.geoRef) {
        const ctx: SeedContext = {
          env, day, dayStart,
          dayEnd: eventDayEndMs(day), createdAt,
          recordBrowserMs: (ms) => { providerResult.browserMs += ms; },
        };
        const geo = await resolveKupGeo(ctx, c.venue, c.geoRef, day, c.city);
        if (geo.lat != null && geo.lng != null) { c.lat = geo.lat; c.lng = geo.lng; }
      }
      // Still no geo → collect anyway with a default pin (city center / 0,0) and
      // ingest as PENDING: it never shows in the app until the admin fixes/approves.
      if (typeof c.lat !== 'number' || typeof c.lng !== 'number') {
        const fb = fallbackSeedGeo(c.city);
        c.lat = fb.lat;
        c.lng = fb.lng;
        pendingGeo = true;
      }
    }
    const ctx: SeedContext = {
      env, day, dayStart,
      dayEnd: eventDayEndMs(day), createdAt,
      recordBrowserMs: (ms) => { providerResult.browserMs += ms; },
    };
    try {
      const existing = await env.DB
        .prepare('SELECT id FROM posts WHERE external_id = ?')
        .bind(c.externalId)
        .first<{ id: string }>();
      const postId = existing?.id || nanoid(24);

      // Optional provider hook: resolve the post link to the direct source (dzis.app).
      if (provider.resolveLink) {
        try { c.link = await provider.resolveLink(ctx, c); } catch { /* best-effort */ }
      }

      const mediaBytes = await provider.fetchBytes(ctx, c.mediaUrl);
      const mediaType = detectMediaType(mediaBytes);
      if (!mediaType || !mediaType.startsWith('image/')) throw new Error(`bad media ${mediaType || 'unknown'}`);
      const mediaKey = `posts/${postId}/media.${extForMediaType(mediaType)}`;
      await env.MEDIA.put(mediaKey, mediaBytes, { httpMetadata: { contentType: mediaType } });

      let thumbKey: string | null = null;
      if (c.thumbUrl) {
        try {
          const thumbBytes = await provider.fetchBytes(ctx, c.thumbUrl);
          const thumbType = detectMediaType(thumbBytes) ?? 'image/webp';
          thumbKey = `posts/${postId}/thumb.${extForMediaType(thumbType)}`;
          await env.MEDIA.put(thumbKey, thumbBytes, { httpMetadata: { contentType: thumbType } });
        } catch { thumbKey = null; }
      }

      const description = buildDescription(c);
      await doSavePost(
        env, user, postId, 'photo', c.lat, c.lng, description,
        mediaKey, thumbKey, createdAt, true, c.link, c.externalId, Boolean(existing), Boolean(c.isSoldOut), showtimesJson(c), showtimeBookingJson(c), tagsJson(c),
        (pendingGeo || provider.pendingByDefault) ? STATUS_PENDING : STATUS_APPROVED
      );
      providerResult.ingested++; totalIngested++;
    } catch (e) {
      providerResult.errors.push({ externalId: c.externalId, error: (e as Error).message });
      allErrors.push({ externalId: c.externalId, error: (e as Error).message });
    }
  }

  // Update provider rows with ingest stats + total row.
  const totalDurationMs = Date.now() - totalStart;
  const totalBrowserMs = allCandidates.reduce((a, r) => a + r.browserMs, 0);
  for (const r of allCandidates) {
    await writeSeedRun(env, {
      runType, day, provider: r.provider, transport: r.transport,
      candidates: r.candidates, ingested: r.ingested, skipped: r.skipped,
      errors: r.errors.length, errorDetail: r.errors[0]?.error ?? null,
      durationMs: r.durationMs, browserMs: r.browserMs,
    });
  }
  await writeSeedRun(env, {
    runType, day, provider: 'total', transport: 'mixed',
    candidates: merged.length, ingested: totalIngested, skipped: totalSkipped,
    errors: allErrors.length, errorDetail: allErrors[0]?.error ?? null,
    durationMs: totalDurationMs, browserMs: totalBrowserMs,
  });

  const budget = env.BROWSER ? await browserBudget(env) : null;
  if (budget && budget.exceeded) {
    console.warn(`seed browser budget exceeded: ${(budget.monthMs / 3_600_000).toFixed(1)}h / ${(budget.limitMs / 3_600_000)}h`);
  }
  console.log(`seed ${runType} day=${day} total candidates=${merged.length} ingested=${totalIngested} skipped=${totalSkipped} errors=${allErrors.length} durationMs=${totalDurationMs} browserMs=${totalBrowserMs}`);

  return {
    day, runType,
    providers: allCandidates,
    total: {
      candidates: merged.length, ingested: totalIngested, skipped: totalSkipped,
      errors: allErrors.length, durationMs: totalDurationMs, browserMs: totalBrowserMs,
    },
    budget,
  };
}

// For cron: seed tomorrow (Europe/Warsaw).
export function seedTomorrow(env: Env): Promise<SeedResult> {
  return runSeed(env, tomorrowWarsaw(), 'cron');
}
