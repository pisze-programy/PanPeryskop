// Byte accounting for seed network traffic, attributed by source. The VPS fetches
// through the residential proxy, which is billed per GB — this measures real
// transfer per provider instead of estimating. In-memory, per run, no behavior
// change: it only observes fetch().
export interface NetStat {
  requests: number;
  bytes: number;
}

let current = 'unknown';
const stats = new Map<string, NetStat>();

/** Label every request made from now on (call per provider/scope). */
export function setNetSource(source: string): void {
  current = source;
}

/** Record one request. `bytes` = wire bytes (compressed content-length when known). */
export function addNetBytes(bytes: number): void {
  const s = stats.get(current) ?? { requests: 0, bytes: 0 };
  s.requests += 1;
  s.bytes += bytes;
  stats.set(current, s);
}

/** Per-source totals for the current run. */
export function netSnapshot(): Record<string, NetStat> {
  const out: Record<string, NetStat> = {};
  for (const [k, v] of stats) out[k] = { ...v };
  return out;
}

export function resetNetStats(): void {
  stats.clear();
  current = 'unknown';
}

let installed = false;

/** Wrap global fetch once so every request/response is attributed to the current
 *  source. Install it in the VPS consumer (the only process that pays for proxy
 *  bytes). Idempotent; a missing content-length is counted as 0 bytes. */
export function installNetStats(): void {
  if (installed) return;
  installed = true;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const reqBytes = typeof init?.body === 'string' ? init.body.length : 0;
    try {
      const res = await orig(input, init);
      const len = Number(res.headers.get('content-length') ?? '0');
      addNetBytes(reqBytes + (Number.isFinite(len) && len > 0 ? len : 0));
      return res;
    } catch (e) {
      addNetBytes(reqBytes);
      throw e;
    }
  };
}
