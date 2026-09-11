import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installNetStats, setNetSource, netSnapshot, resetNetStats } from '../src/seed/core/netStats';

test('netStats: attributes wire bytes per source; failures count a request', async () => {
  resetNetStats();
  const real = globalThis.fetch;
  // Installed once per process, so the stub must handle every case up front.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('fail')) throw new Error('boom');
    return { headers: { get: () => '1234' } };
  }) as unknown as typeof fetch;
  try {
    installNetStats();
    setNetSource('helios');
    await globalThis.fetch('https://ok', { method: 'POST', body: 'abc' }); // 1234 + 3
    setNetSource('cinemacity');
    await globalThis.fetch('https://ok2'); // 1234
    setNetSource('luma');
    await assert.rejects(globalThis.fetch('https://fail')); // request counted, 0 bytes
    const s = netSnapshot();
    assert.deepEqual(s.helios, { requests: 1, bytes: 1237 });
    assert.deepEqual(s.cinemacity, { requests: 1, bytes: 1234 });
    assert.deepEqual(s.luma, { requests: 1, bytes: 0 });
  } finally {
    globalThis.fetch = real;
    resetNetStats();
  }
});
