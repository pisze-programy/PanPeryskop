import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogue, catalogueVersion } from '../src/travel/catalogue';
import { travelRoutes } from '../src/api/travel';

test('catalogue: 11 origin cities with the Warsaw pair and the Bialystok fallback', () => {
  const c = buildCatalogue('2026-01-01T00:00:00.000Z');
  assert.equal(c.cities.length, 11);
  assert.deepEqual(c.cities.find((city) => city.id === 'warszawa')?.airports, ['WAW', 'WMI']);
  assert.deepEqual(c.cities.find((city) => city.id === 'bialystok')?.airports, ['SZY']);
  assert.equal(c.airports.length, 14);
  assert.equal(Object.keys(c.destinations).length, 14);
});

test('catalogue: every destination carries only known carriers, sorted', () => {
  const c = buildCatalogue('2026-01-01T00:00:00.000Z');
  for (const [origin, destinations] of Object.entries(c.destinations)) {
    assert.ok(destinations.length > 0, `${origin} has no destinations`);
    for (const d of destinations) {
      assert.ok(d.providers.length >= 1, `${origin}->${d.iata} has no carrier`);
      assert.deepEqual(d.providers, [...d.providers].sort());
      for (const p of d.providers) assert.ok(p === 'ryanair' || p === 'wizzair');
    }
  }
});

test('catalogue: version is content identity, independent of generatedAt', () => {
  const a = buildCatalogue('2026-01-01T00:00:00.000Z');
  const b = buildCatalogue('2030-12-31T23:59:59.000Z');
  assert.equal(a.version, b.version);
  const { version, generatedAt, ...payload } = a;
  assert.equal(catalogueVersion(payload), a.version);
  assert.match(a.version, /^[0-9a-f]{64}$/);
});

test('catalogue endpoint: 200 with ETag, then 304 on If-None-Match', async () => {
  const first = await travelRoutes.request('/catalogue');
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag && etag.startsWith('"'), 'missing ETag');

  const cached = await travelRoutes.request('/catalogue', { headers: { 'If-None-Match': etag } });
  assert.equal(cached.status, 304);

  const body = (await first.json()) as { schemaVersion: number; minAppBuild: number };
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.minAppBuild, 36);
});
