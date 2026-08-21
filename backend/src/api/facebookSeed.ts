// Facebook manual ingest routes (mounted under /admin by index.ts). Thin layer:
// auth + form/JSON parsing + validation only. All logic lives in
// src/seed/manual/facebook.ts (preview + ingestFacebookEvent).
import { Hono } from 'hono';
import { adminAuth } from './admin';
import { strField, fileField, ParsedForm } from '../core/form';
import { ingestFacebookEvent, previewFacebookEvents, previewGeo, PreviewInput, GeoPreviewInput } from '../seed/manual/facebook';
import { CANONICAL_TAG_SET } from '../seed/core/tags';
import { warsawDateOf, eventCreatedAtMs } from '../seed/core/dates';
import { TTL_MS, MAX_LOOKAHEAD_MS } from '../core/models';

export const facebookSeedRoutes = new Hono<{ Bindings: Env }>();

const MAX_TITLE_LEN = 200;
const MAX_EXTERNAL_ID_LEN = 200;

function requireString(form: ParsedForm, name: string): string | undefined {
  const v = strField(form, name);
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Closed-set canonical tags from a JSON array string ("[\"muzyka\",\"teatr\"]"). */
function parseTags(raw: string | undefined): string[] | null {
  if (raw === undefined) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const tags = Array.isArray(parsed)
    ? parsed.filter((t): t is string => typeof t === 'string' && CANONICAL_TAG_SET.has(t))
    : null;
  return tags && tags.length > 0 ? [...new Set(tags)].sort() : null;
}

/** "HH:MM" showtimes from a JSON array string. */
function parseTimes(raw: string | undefined): string[] | null {
  if (raw === undefined) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const times = Array.isArray(parsed)
    ? parsed.filter((t): t is string => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t))
    : null;
  return times && times.length > 0 ? [...new Set(times)].sort() : null;
}

/** Event-day sanity: the post must land inside the visible [now-24h, now+1y] window. */
function validateEventDay(startMs: number): string | null {
  const day = warsawDateOf(startMs);
  const createdAt = eventCreatedAtMs(day);
  const now = Date.now();
  if (createdAt < now - TTL_MS) return 'event too far in the past';
  if (createdAt > now + MAX_LOOKAHEAD_MS) return 'event too far in the future';
  return null;
}

type FormResult = { ok: true; input: import('../seed/manual/facebook').IngestInput } | { ok: false; error: string };

async function parseIngestForm(form: ParsedForm): Promise<FormResult> {
  const title = requireString(form, 'title');
  if (!title) return { ok: false, error: 'title is required' };
  if (title.length > MAX_TITLE_LEN) return { ok: false, error: 'title too long' };

  const externalId = requireString(form, 'external_id');
  if (!externalId) return { ok: false, error: 'external_id is required' };
  if (externalId.length > MAX_EXTERNAL_ID_LEN) return { ok: false, error: 'external_id too long' };
  if (!externalId.startsWith('facebook-')) return { ok: false, error: 'external_id must start with facebook-' };

  const link = requireString(form, 'link');
  if (!link || !isValidHttpUrl(link)) return { ok: false, error: 'link must be a valid http(s) url' };

  const startMsRaw = strField(form, 'startMs');
  const startMs = Number(startMsRaw);
  if (startMsRaw === undefined || !Number.isFinite(startMs)) return { ok: false, error: 'startMs is required' };
  const dayError = validateEventDay(startMs);
  if (dayError) return { ok: false, error: dayError };

  const file = fileField(form, 'file');
  if (!file || file.size === 0) return { ok: false, error: 'file is required' };
  if (file.size > 100 * 1024 * 1024) return { ok: false, error: 'file too large' };

  const thumb = fileField(form, 'thumb');

  return {
    ok: true,
    input: {
      title,
      startMs,
      venue: requireString(form, 'venue') ?? '',
      address: requireString(form, 'address') ?? '',
      city: requireString(form, 'city') ?? '',
      link,
      externalId,
      tags: parseTags(strField(form, 'tags')) ?? undefined,
      times: parseTimes(strField(form, 'times')) ?? undefined,
      file: new Uint8Array(await file.arrayBuffer()),
      thumb: thumb && thumb.size > 0 ? new Uint8Array(await thumb.arrayBuffer()) : null,
    },
  };
}

// Duplicate pre-check: the addon shows "prawdopodobny duplikat" badges before submit.
facebookSeedRoutes.post('/seed/facebook/preview', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ events?: unknown }>().catch(() => ({} as { events?: unknown }));
  const raw = Array.isArray(body?.events) ? body.events : [];
  const events: PreviewInput[] = raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      externalId: String(e.externalId ?? ''),
      title: String(e.title ?? ''),
      startMs: Number(e.startMs),
      venue: String(e.venue ?? ''),
    }))
    .filter((e) => e.externalId && e.title && Number.isFinite(e.startMs));
  if (events.length === 0) return c.json({ error: 'events: non-empty array required' }, 400);
  const results = await previewFacebookEvents(c.env, events);
  return c.json({ results });
});

// Geo preview: the summary shows a resolved-point badge per event and a refresh
// button to re-check after a Location edit — before anything hits /seed/facebook.
facebookSeedRoutes.post('/seed/facebook/geopreview', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json<{ events?: unknown }>().catch(() => ({} as { events?: unknown }));
  const raw = Array.isArray(body?.events) ? body.events : [];
  const events: GeoPreviewInput[] = raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      externalId: String(e.externalId ?? ''),
      venue: String(e.venue ?? ''),
      address: String(e.address ?? ''),
      city: String(e.city ?? ''),
    }))
    .filter((e) => e.externalId);
  if (events.length === 0) return c.json({ error: 'events: non-empty array required' }, 400);
  const results = await previewGeo(c.env, events);
  return c.json({ results });
});

// Authoritative per-event ingest (multipart). The addon uploads one event at a time.
facebookSeedRoutes.post('/seed/facebook', async (c) => {
  if (!adminAuth(c)) return c.json({ error: 'Forbidden' }, 403);
  const contentType = c.req.header('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'must use multipart/form-data' }, 400);
  }
  const form = await c.req.parseBody() as ParsedForm;
  const parsed = await parseIngestForm(form);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const result = await ingestFacebookEvent(c.env, parsed.input);
  const code = result.status === 'pending' ? 201 : 200;
  return c.json(result, code);
});
