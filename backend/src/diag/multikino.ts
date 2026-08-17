// [DIAG] Multikino access test harness — TEMPORARY, remove after diagnosis.
// Probes multikino.pl from the Worker's egress across transport/header variants
// and measures time + cost (browser_ms). Mounted only at /admin/diag/multikino
// (see index.ts). Kept in one self-contained file so it can be deleted as a unit.
import { connect } from 'cloudflare:sockets';
import { multikinoProvider } from '../seed/providers/multikino';
import type { SeedContext } from '../seed/core/types';

const MK_HOST = 'www.multikino.pl';
const MK_AUTH = 'https://www.multikino.pl/api/microservice/auth/token';
const MK_SHOWINGS = (cinema: string, day: string) =>
  `https://www.multikino.pl/api/microservice/showings/cinemas/${cinema}/films?showingDate=${day}&minEmbargoLevel=1&includesSession=true&includeSessionAttributes=true`;
const MK_REPERTUAR = 'https://www.multikino.pl/repertuar/warszawa-zlote-tarasy/teraz-gramy';

const BROWSER_HEADERS: [string, string][] = [
  ['user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'],
  ['accept', 'application/json, text/plain, */*'],
  ['accept-language', 'pl-PL,pl;q=0.9,en;q=0.8'],
  ['origin', 'https://www.multikino.pl'],
  ['referer', 'https://www.multikino.pl/repertuar/warszawa-zlote-tarasy/teraz-gramy'],
  ['sec-ch-ua', '"Chromium";v="126", "Not/A)Brand";v="99"'],
  ['sec-ch-ua-mobile', '?0'],
  ['sec-ch-ua-platform', '"macOS"'],
];

interface Step { name: string; http: number; ms: number; bytes: number; note?: string }
interface DiagResult { mode: string; ts: number; steps: Step[]; total_ms: number; browser_ms?: number }

function toHeaders(pairs: [string, string][], extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {};
  for (const [k, v] of pairs) h[k] = v;
  for (const [k, v] of Object.entries(extra)) h[k] = v;
  return h;
}

function setCookies(res: Response): string[] {
  try { return typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || '']; }
  catch { return [res.headers.get('set-cookie') || '']; }
}

function cookieValue(cookies: string[], name: string): string | null {
  for (const c of cookies) {
    const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(c);
    if (m) return m[1];
  }
  return null;
}

async function fetchAuth(pairs: [string, string][], cookies: string): Promise<{ http: number; ms: number; bytes: number; token: string | null; newCookies: string[] }> {
  const t0 = Date.now();
  const res = await fetch(MK_AUTH, {
    method: 'POST',
    headers: toHeaders(pairs, cookies ? { cookie: cookies } : {}),
  });
  const body = await res.text();
  const sc = setCookies(res);
  return { http: res.status, ms: Date.now() - t0, bytes: body.length, token: cookieValue(sc, 'microservicesToken'), newCookies: sc };
}

async function fetchShowings(token: string, pairs: [string, string][], cookies: string): Promise<Step> {
  const t0 = Date.now();
  const res = await fetch(MK_SHOWINGS('0006', day()), {
    headers: toHeaders(pairs, { authorization: `Bearer ${token}`, ...(cookies ? { cookie: cookies } : {}) }),
  });
  const body = await res.text();
  const sessions = (body.match(/showTimeWithTimeZone|startTime/g) || []).length;
  return { name: 'showings', http: res.status, ms: Date.now() - t0, bytes: body.length, note: sessions ? `${sessions} sessions` : undefined };
}

function day(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Minimal HTTP/1.1 client over a raw TLS socket (cloudflare:sockets).
async function http1(method: string, path: string, headers: [string, string][], timeoutMs = 15000): Promise<{ http: number; ms: number; bytes: number; body: string }> {
  const t0 = Date.now();
  const socket = connect({ hostname: MK_HOST, port: 443, secureTransport: 'on' } as unknown as Parameters<typeof connect>[0]);
  const lines = [`${method} ${path} HTTP/1.1`, `Host: ${MK_HOST}`, 'Connection: close'];
  for (const [k, v] of headers) lines.push(`${k}: ${v}`);
  if (method === 'POST' && !headers.some(([k]) => k === 'content-length')) lines.push('Content-Length: 0');
  const req = lines.join('\r\n') + '\r\n\r\n';
  const writer = socket.writable.getWriter();
  await writer.write(new TextEncoder().encode(req));
  writer.releaseLock();

  const reader = socket.readable.getReader();
  const dec = new TextDecoder();
  let raw = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += dec.decode(value, { stream: true });
    const hdrEnd = raw.indexOf('\r\n\r\n');
    if (hdrEnd !== -1) {
      const head = raw.slice(0, hdrEnd);
      const cl = /content-length:\s*(\d+)/i.exec(head);
      if (cl && raw.length >= hdrEnd + 4 + parseInt(cl[1], 10)) break;
      if (!cl) break; // Connection: close without Content-Length → headers are enough
    }
  }
  socket.close().catch(() => {});
  const statusLine = raw.split('\r\n')[0];
  const hdrEnd = raw.indexOf('\r\n\r\n');
  return {
    http: parseInt(statusLine.split(' ')[1] || '0', 10),
    ms: Date.now() - t0,
    bytes: raw.length,
    body: hdrEnd === -1 ? '' : raw.slice(hdrEnd + 4),
  };
}

export async function diagMultikino(env: Env, mode: string, dayOverride?: string): Promise<DiagResult> {
  const t0 = Date.now();
  const q_day = dayOverride && /^\d{4}-\d{2}-\d{2}$/.test(dayOverride) ? dayOverride : day();
  const steps: Step[] = [];
  let browser_ms: number | undefined;
  const finish = (): DiagResult => ({ mode, ts: Date.now(), steps, total_ms: Date.now() - t0, browser_ms });

  if (mode === 'baseline') {
    const auth = await fetchAuth([['accept', 'application/json']], '');
    steps.push({ name: 'auth', http: auth.http, ms: auth.ms, bytes: auth.bytes });
    if (auth.token) steps.push(await fetchShowings(auth.token, [['accept', 'application/json']], ''));
    return finish();
  }

  if (mode === 'headers') {
    const auth = await fetchAuth(BROWSER_HEADERS, '');
    steps.push({ name: 'auth', http: auth.http, ms: auth.ms, bytes: auth.bytes });
    if (auth.token) steps.push(await fetchShowings(auth.token, BROWSER_HEADERS, ''));
    return finish();
  }

  if (mode === 'cookie') {
    // Warm-up page load to collect Cloudflare bot-management cookies, then replay.
    const tWarm = Date.now();
    const warm = await fetch(MK_REPERTUAR, { headers: toHeaders(BROWSER_HEADERS) });
    const warmCookies = setCookies(warm).join('; ');
    steps.push({ name: 'warmup-get', http: warm.status, ms: Date.now() - tWarm, bytes: (await warm.text()).length, note: 'cookie jar acquired' });
    const auth = await fetchAuth(BROWSER_HEADERS, warmCookies);
    steps.push({ name: 'auth', http: auth.http, ms: auth.ms, bytes: auth.bytes });
    if (auth.token) steps.push(await fetchShowings(auth.token, BROWSER_HEADERS, warmCookies));
    return finish();
  }

  if (mode === 'http1') {
    const auth = await http1('POST', '/api/microservice/auth/token', [['accept', 'application/json'], ...BROWSER_HEADERS]);
    steps.push({ name: 'auth-http1', http: auth.http, ms: auth.ms, bytes: auth.bytes, note: `body=${auth.body.slice(0, 120)}` });
    const token = cookieValue([auth.body], 'microservicesToken') ?? cookieValue([`microservicesToken=${auth.body}`], 'microservicesToken') ?? null;
    if (token) {
      const sh = await http1('GET', `/api/microservice/showings/cinemas/0006/films?showingDate=${day()}&minEmbargoLevel=1&includesSession=true&includeSessionAttributes=true`,
        [['accept', 'application/json'], ['authorization', `Bearer ${token}`], ...BROWSER_HEADERS]);
      steps.push({ name: 'showings-http1', http: sh.http, ms: sh.ms, bytes: sh.bytes, note: sh.body ? `${sh.body.length}B` : undefined });
    } else {
      steps.push({ name: 'showings-http1', http: 0, ms: 0, bytes: 0, note: `no token; body=${auth.body.slice(0, 80)}` });
    }
    return finish();
  }

  if (mode === 'repertuar') {
    const t0r = Date.now();
    const res = await fetch(MK_REPERTUAR, { headers: toHeaders(BROWSER_HEADERS) });
    const html = await res.text();
    const filmIds = (html.match(/HO\d{8}/g) || []).length;
    steps.push({ name: 'repertuar-html', http: res.status, ms: Date.now() - t0r, bytes: html.length, note: `${filmIds} filmIds` });
    return finish();
  }

  if (mode === 'cinemacity') {
    // Probe Cinema City's DAS API (quickbook) from the Worker's egress — is it
    // IP-blocked like multikino, or usable? Base + tenant from the site (apiSitesList).
    const ccBase = 'https://www.cinema-city.pl/pl/data-api-service/v1/quickbook/10103';
    const tAtt = Date.now();
    const att = await fetch(`${ccBase}/attributes?jsonp`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    steps.push({ name: 'cc-attributes', http: att.status, ms: Date.now() - tAtt, bytes: (await att.text()).length });

    const tFe = Date.now();
    const res = await fetch(`${ccBase}/film-events/in-cinema/1100/at-date/${q_day}`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let films = 0, events = 0;
    if (res.ok) {
      try {
        const d = JSON.parse(text) as { body?: { films?: unknown[]; events?: unknown[] } };
        films = d.body?.films?.length ?? 0;
        events = d.body?.events?.length ?? 0;
      } catch { /* not json */ }
    }
    steps.push({ name: 'cc-film-events', http: res.status, ms: Date.now() - tFe, bytes: text.length, note: `${films} films, ${events} events` });
    return finish();
  }

  if (mode === 'helios') {
    // Probe a Helios cinema SSR page from the Worker's egress.
    const t0h = Date.now();
    const res = await fetch('https://www.helios.pl/bialystok/kino-helios-alfa', { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    const html = await res.text();
    const times = (html.match(/<time datetime=/g) || []).length;
    const cards = (html.match(/\/kino-helios[^"]*\/filmy\//g) || []).length;
    steps.push({ name: 'helios-page', http: res.status, ms: Date.now() - t0h, bytes: html.length, note: `${times} showtimes, ${cards} film cards` });
    return finish();
  }

  if (mode === 'seedpath') {
    // Exact seed code path: provider.fetchScope → getMkToken (D1 cache) + showings + geo.
    const targetDay = q_day; // closure var set below
    const ctx: SeedContext = {
      env: env as unknown as Env, day: targetDay, dayStart: 0, dayEnd: 0, createdAt: 0, recordBrowserMs: () => {},
    };
    const t0s = Date.now();
    try {
      const cands = await multikinoProvider.fetchScope(ctx, 'all');
      steps.push({ name: `seedpath-scope day=${targetDay}`, http: 200, ms: Date.now() - t0s, bytes: cands.length, note: `${cands.length} candidates` });
    } catch (e) {
      steps.push({ name: `seedpath-scope day=${targetDay}`, http: 0, ms: Date.now() - t0s, bytes: 0, note: (e as Error).message });
    }
    return finish();
  }

  if (mode === 'browser') {
    const res = await env.BROWSER.quickAction('content', { url: MK_REPERTUAR, gotoOptions: { waitUntil: 'networkidle2' } });
    browser_ms = parseInt(res.headers.get('X-Browser-Ms-Used') || '0', 10);
    let html = '';
    if (res.ok) {
      const data = (await res.json()) as { result?: string };
      html = data.result || '';
    }
    const sessions = (html.match(/(?:showTimeWithTimeZone|startTime)|(?:\b(?:1[0-9]|2[0-3]):[0-5][0-9]\b)/g) || []).length;
    const filmIds = (html.match(/HO\d{8}/g) || []).length;
    steps.push({ name: 'browser-repertuar', http: res.status, ms: Date.now() - t0, bytes: html.length, note: `${sessions} session markers, ${filmIds} filmIds` });
    return finish();
  }

  steps.push({ name: 'mode', http: 400, ms: 0, bytes: 0, note: `unknown mode: ${mode}` });
  return finish();
}
