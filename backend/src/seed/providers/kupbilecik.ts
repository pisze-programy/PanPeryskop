// kupbilecik provider — 'fetch' transport (official partner API + affiliate links).
// Replaces the old Browser Run HTML-scraping module.
//
// Data source: the catalog endpoint returns the WHOLE future catalog (~60 MB JSON,
// 12k+ events) — one row per PERFORMANCE (unique Id = /imprezy/<Id>/). It carries
// everything the old scraped HTML lacked: direct price (TicketsInfo.Price, PLN),
// ready coordinates (Object.Location), postal/address, category (Category.Type),
// image variants (Images.Image/Mini) and an AFFILIATE link already stamped with
// utm_source=pp&utm_medium=631 (p = publisher id).
//
// The Worker CAN fetch it from the edge (probe: API + images 200), and it now DOES
// the warm itself: gzip transfer (~8 MB on the wire, Workers fetch auto-decompresses)
// is STREAM-scanned into per-day TRIMMED manifests written straight to R2
// (seed/kupbilecik/<day>.json). The scanner never materializes the ~60 MB JSON —
// that (not the transfer) is why JSON.parse-of-the-whole-catalog on a 128 MB
// isolate was never viable. This provider reads only its batch day and maps rows →
// SeedCandidates (one post per event-day-venue, showtimes[] aggregation, price,
// tags, geo from Object.Location).
import { SeedProvider, SeedContext, SeedCandidate, ProviderId } from '../core/types';
import { aggregateDayCandidates } from '../core/aggregate';
import { parseFeedJson, detectBlockedBody, SourceBlockedError, SourceShapeError } from '../core/fetchOnce';
import { SEED_REFILL_AHEAD } from '../core/constants';
import { todayWarsaw, addDaysWarsaw } from '../core/dates';

const KUP_CACHE_PREFIX = 'seed/kupbilecik/';
const KUP_API_URL = (token: string) => `https://www.kupbilecik.pl/api?t=json&v=1.0&p=631&token=${encodeURIComponent(token)}`;

interface KupCategory { Type?: string; SubCategory?: { Type?: string } }
interface KupEvent {
  Id?: number | string;
  Name?: string;
  Date?: string; // "YYYY-MM-DD HH:MM:SS"
  City?: string;
  Category?: KupCategory;
  Images?: { Image?: string; Mini?: string };
  TicketsInfo?: { Price?: number | null };
  Object?: { Name?: string; Address?: string; Code?: string; Location?: { Lat?: string | number | null; Long?: string | number | null } };
  Link?: string;
}

/** Decode the HTML entities the API sometimes leaves in Name. */
export function decodeHtmlEntities(s: string): string {
  return (s || '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Category → canonical tag (reviewed with the user):
 *  safe: muzyka→muzyka, teatr→teatr (teatr_widowisko EXCLUDED → inne), standup+kabaret→
 *  komedia, film→filmy, sport→inne; decided ambiguous: impro→komedia, dzieci→inne,
 *  festiwal→inne, teatr_widowisko→inne; inne→inne (catch-all). Unknown → null. */
export function kupTagsFor(cat: KupCategory | null | undefined): string[] | null {
  const type = cat?.Type;
  const sub = cat?.SubCategory?.Type;
  if (type === 'muzyka') return ['muzyka'];
  if (type === 'standup' || type === 'kabaret' || type === 'impro') return ['komedia'];
  if (type === 'film') return ['filmy'];
  if (type === 'sport') return ['inne'];
  if (type === 'teatr') {
    if (sub === 'teatr_widowisko') return ['inne'];
    return ['teatr'];
  }
  if (type === 'dzieci' || type === 'festiwal' || type === 'inne') return ['inne'];
  return null;
}

export function parseFloatOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Build the candidate for ONE performance row (single time). Rows sharing the same
 *  event-day-venue collapse later via aggregateDayCandidates → showtimes[]. */
export function parseKupEvent(e: KupEvent, day: string, dayStartMs: number): SeedCandidate[] {
  const title = decodeHtmlEntities((e.Name || '').trim());
  const id = e.Id ?? '';
  const date = (e.Date || '').trim();
  if (!title || id === '' || date.slice(0, 10) !== day) return [];
  const time = date.slice(11, 16); // HH:MM
  if (!/^\d{2}:\d{2}$/.test(time)) return [];
  const h = Number(time.slice(0, 2));
  const mi = Number(time.slice(3, 5));
  const startMs = dayStartMs + (h * 60 + mi) * 60_000;

  const obj = e.Object || {};
  const lat = parseFloatOrNull(obj.Location?.Lat);
  const lng = parseFloatOrNull(obj.Location?.Long);
  const img = (e.Images?.Image || '').trim();
  const price = typeof e.TicketsInfo?.Price === 'number' ? e.TicketsInfo.Price : null;
  const tag = kupTagsFor(e.Category);
  const rowLink = (e.Link || '').trim();
  // Every performance is its OWN page (/imprezy/<Id>/), so the post must carry a
  // per-showtime link (kind 'link') — mirroring how cinema carries per-session
  // booking identities. Selecting this time in the app opens THIS performance.
  const showtimeBooking = [{ time, kind: 'link' as const, params: { url: rowLink } }];

  return [{
    source: ProviderId.KUPBILECIK,
    externalId: `kupbilecik-${id}-${day.replace(/-/g, '')}`,
    title,
    startMs,
    lat,
    lng,
    city: (e.City || '').trim(),
    venue: (obj.Name || '').trim(),
    address: (obj.Address || '').trim(),
    link: rowLink,
    mediaUrl: img,
    thumbUrl: (e.Images?.Mini || '').trim() || img || null,
    isSoldOut: false, // the API does not expose availability
    price,
    tags: tag ?? undefined,
    times: [time],
    showtimeBooking,
  }];
}

/** Candidates for one target day from the per-day R2 manifest. The manifest body
 *  is validated, never trusted: a rate-limit block or corrupt copy throws a named
 *  error instead of seeding garbage. An empty array is valid (a day with no events). */
export async function fetchKupDay(ctx: SeedContext): Promise<SeedCandidate[]> {
  const key = `${KUP_CACHE_PREFIX}${ctx.day}.json`;
  const obj = await ctx.env.MEDIA.get(key);
  if (!obj) throw new Error(`kupbilecik manifest missing for ${ctx.day} — run the warm (admin POST /admin/seed/kupbilecik/warm or the SEED_CRON)`);
  const rows = parseFeedJson(await obj.text(), 'kupbilecik', (v): v is KupEvent[] => Array.isArray(v));
  const out: SeedCandidate[] = [];
  for (const e of rows || []) out.push(...parseKupEvent(e, ctx.day, ctx.dayStart));
  return aggregateDayCandidates(out);
}

// ---------- nightly warm (runs ON the Worker, streaming) ----------
// The API has no date/page filter and ~10 req/day ceiling; the warm runs once a
// day from the SEED_CRON (and manually via admin POST /admin/seed/kupbilecik/warm).
// It downloads the gzip'd catalog, STREAM-scans events (never holding the ~60 MB
// decompressed JSON in memory), trims each event to the manifest shape and writes
// per-day manifests to R2. fetchOnce discipline: a block/empty/garbage body is an
// error, never data — so a rate-limit lock-out fails loudly instead of silently
// zero-seeding days.

/** Manifest-row shape — must stay EXACTLY what the provider's parseKupEvent reads. */
function trimKupEvent(raw: Record<string, unknown>): KupEvent {
  const obj = (raw.Object || {}) as Record<string, unknown>;
  const cat = (raw.Category || {}) as Record<string, unknown>;
  const sc = (cat.SubCategory || {}) as Record<string, unknown>;
  const img = (raw.Images || {}) as Record<string, unknown>;
  const ti = (raw.TicketsInfo || {}) as Record<string, unknown>;
  const loc = (obj.Location || {}) as Record<string, unknown>;
  return {
    Id: raw.Id as number,
    Name: raw.Name as string,
    Date: raw.Date as string,
    City: raw.City as string,
    Category: { Type: cat.Type as string, SubCategory: { Type: sc.Type as string } },
    Images: { Image: img.Image as string, Mini: img.Mini as string },
    TicketsInfo: { Price: typeof ti.Price === 'number' ? ti.Price : null },
    Object: {
      Name: obj.Name as string,
      Address: obj.Address as string,
      Code: obj.Code as string,
      Location: { Lat: loc.Lat as string | number | null, Long: loc.Long as string | number | null },
    },
    Link: raw.Link as string,
  };
}

/** Stream-scan a (decompressed) catalog body into per-day trimmed manifests.
 *
 * BYTE-LEVEL scanner — deliberately NOT char/string based. The string version
 * allocated a 1-char string per input char (~60 M allocations for the ~60 MB
 * catalog) and spiked the V8 heap ~90–190 MB, which on the 256 MB VPS box
 * tripped the OOM-killer. Scanning raw bytes keeps live memory ≈ one event:
 * structural bytes (`"`, `\`, `{`, `}`) are all ASCII (< 0x80) and UTF-8
 * continuation bytes are ≥ 0x80, so multi-byte characters can never collide
 * with them. objBuf is a growable Uint8Array reused between events. */
export async function scanKupEvents(
  body: ReadableStream<Uint8Array>,
  daysAhead = SEED_REFILL_AHEAD,
): Promise<{ byDay: Map<string, KupEvent[]>; total: number }> {
  const today = todayWarsaw();
  const days = new Set(Array.from({ length: daysAhead + 1 }, (_, i) => addDaysWarsaw(today, i)));
  const byDay = new Map<string, KupEvent[]>();
  const decoder = new TextDecoder();

  // Rolling probe for the `"events":[` marker — bounded to 32 KB.
  const probe: number[] = [];
  let inArray = false;
  let firstChunk = true;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let active = false;
  // Growable per-event byte buffer (reused across events — only grows to the
  // largest event's size, then stays put).
  let objBuf = new Uint8Array(4096);
  let objLen = 0;
  const pushObj = (b: number): void => {
    if (objLen === objBuf.length) {
      const n = new Uint8Array(objBuf.length * 2);
      n.set(objBuf);
      objBuf = n;
    }
    objBuf[objLen++] = b;
  };
  let total = 0;

  const closeEvent = (): void => {
    const raw = JSON.parse(decoder.decode(objBuf.subarray(0, objLen))) as Record<string, unknown>;
    objLen = 0;
    active = false;
    total++;
    const day = String(raw.Date || '').slice(0, 10);
    if (days.has(day)) {
      const list = byDay.get(day) ?? [];
      list.push(trimKupEvent(raw));
      byDay.set(day, list);
    }
  };

  const reader = body.getReader();

  const handleByte = (b: number): void => {
    if (!inArray) {
      probe.push(b);
      if (probe.length > 32_000) throw new SourceShapeError('kupbilecik', 'events array not found in first 32KB');
      if (probeHasEventsArray(probe)) {
        inArray = true;
        probe.length = 0;
      }
      return;
    }
    if (active) pushObj(b);
    if (inString) {
      if (escaped) escaped = false;
      else if (b === 0x5c /* \ */) escaped = true;
      else if (b === 0x22 /* " */) inString = false;
      return;
    }
    if (b === 0x22 /* " */) {
      inString = true;
      return;
    }
    if (b === 0x7b /* { */) {
      depth++;
      if (depth === 1) {
        active = true;
        objLen = 0;
        pushObj(b);
      }
      return;
    }
    if (b === 0x7d /* } */) {
      if (depth === 0) return; // root object close (after the events array)
      depth--;
      if (depth === 0) closeEvent();
      return;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstChunk) {
      firstChunk = false;
      // Bound the validation decode to the first 2 KB — the block text (~90 B)
      // and the leading `{` both live there; never decode a 60 MB chunk.
      const head = decoder.decode(value.subarray(0, Math.min(2048, value.length)));
      const blocked = detectBlockedBody(head);
      if (blocked) throw new SourceBlockedError('kupbilecik', `matched "${blocked}"`);
      if (!head.trimStart().startsWith('{')) throw new SourceShapeError('kupbilecik', 'response does not start with a JSON object');
    }
    for (let i = 0; i < value.length; i++) handleByte(value[i]);
  }
  if (!inArray) throw new SourceShapeError('kupbilecik', 'events array not found in body');
  if (total === 0) throw new SourceShapeError('kupbilecik', 'zero events — catalog empty or shape changed');
  return { byDay, total };
}

/** True when `probe` bytes contain `"events"` `:` `[` (whitespace-insensitive). */
function probeHasEventsArray(probe: number[]): boolean {
  const KEY = [0x22, 0x65, 0x76, 0x65, 0x6e, 0x74, 0x73, 0x22]; // "events"
  for (let i = 0; i + KEY.length < probe.length; i++) {
    let k = 0;
    while (k < KEY.length && probe[i + k] === KEY[k]) k++;
    if (k < KEY.length) continue;
    let j = i + KEY.length;
    while (j < probe.length && (probe[j] === 0x20 || probe[j] === 0x09 || probe[j] === 0x0a || probe[j] === 0x0d)) j++;
    if (probe[j] !== 0x3a /* : */) continue;
    j++;
    while (j < probe.length && (probe[j] === 0x20 || probe[j] === 0x09 || probe[j] === 0x0a || probe[j] === 0x0d)) j++;
    if (probe[j] === 0x5b /* [ */) return true;
  }
  return false;
}

/** If the response body is raw gzip (magic 1f 8b) decompress it first — harmless
 *  when the runtime already handed us a decompressed stream. Exported for tests. */
export async function maybeGunzip(stream: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  const reader = stream.getReader();
  const first = await reader.read();
  if (first.done) return new ReadableStream({ start(c) { c.close(); } });
  const bytes = first.value;
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const rest = new ReadableStream<Uint8Array>({
    pull(c) {
      return reader.read().then(({ done, value }) => (done ? c.close() : c.enqueue(value)));
    },
  });
  if (!isGzip) {
    return new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(bytes); },
      pull(c) {
        return reader.read().then(({ done, value }) => (done ? c.close() : c.enqueue(value)));
      },
    });
  }
  const merged = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(bytes); },
    pull(c) {
      return reader.read().then(({ done, value }) => (done ? c.close() : c.enqueue(value)));
    },
  });
  return merged.pipeThrough(new DecompressionStream('gzip'));
}

/**
 * Download the catalog and hand back a (decompressed) byte stream ready for
 * scanKupEvents. Throws loudly on block/empty/shape — never pushes empty
 * manifests as if the catalog were empty.
 *
 * NOTE: kupbilecik's WAF answers 403 to Cloudflare Workers egress (their HTML
 * error page, verified 2026-09-07), so this is called from the VPS warm
 * (`--warm-kup` in executors/vps/index.ts, run by cron on the box) — not from
 * the Worker. The scanner itself is Workers-safe and shared.
 */
export async function fetchKupCatalog(token: string): Promise<ReadableStream<Uint8Array>> {
  // Minimal headers ONLY — kupbilecik 404s the catalog request when "browser"
  // extras are sent (X-Requested-With / Referer / Accept-Language / a
  // text/javascript Accept were verified to flip the response to their 404 page
  // from the VPS box on 2026-09-07; UA + Accept alone returns 200).
  const res = await fetch(KUP_API_URL(token), {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const snippet = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`kupbilecik warm: api -> ${res.status} ${snippet}`);
  }
  if (!res.body) throw new Error('kupbilecik warm: empty body');
  return maybeGunzip(res.body);
}

export const kupbilecikProvider: SeedProvider = {
  id: ProviderId.KUPBILECIK,
  transport: 'fetch',
  fetchCandidates: fetchKupDay,
  fetchBytes: (ctx, url) => import('./http').then((m) => m.getBytes(url)),
  scopes: ['pl'],
  fetchScope: (ctx) => fetchKupDay(ctx),
};
