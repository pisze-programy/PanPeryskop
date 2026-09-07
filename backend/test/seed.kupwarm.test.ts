import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { scanKupEvents, maybeGunzip } from '../src/seed/providers/kupbilecik';
import { todayWarsaw, addDaysWarsaw } from '../src/seed/core/dates';
import { SourceBlockedError, SourceShapeError } from '../src/seed/core/fetchOnce';

const enc = new TextEncoder();

function streamOf(text: string, chunkSize: number): ReadableStream<Uint8Array> {
  const bytes = enc.encode(text);
  return new ReadableStream({
    start(c) {
      if (chunkSize >= bytes.length) { c.enqueue(bytes); c.close(); return; }
      for (let i = 0; i < bytes.length; i += chunkSize) c.enqueue(bytes.subarray(i, i + chunkSize));
      c.close();
    },
  });
}

// One realistic event — nested braces + escaped quotes live INSIDE Description
// (the heavy field the trim must drop), so the scanner's string/escape handling
// is exercised on every test.
function ev(id: number, day: string): string {
  return JSON.stringify({
    Id: id,
    Name: `Koncert &quot;${id}&quot;`,
    Date: `${day} 19:00:00`,
    City: 'Warszawa',
    Category: { Type: 'muzyka', Name: 'Muzyka', SubCategory: { Type: '', Name: '' } },
    Description: `<p>HTML z {zagnieżdżonymi} i "cudzysłowami" oraz \\backslash\\ na końcu</p><div class="x">${'x'.repeat(50)}</div>`,
    Images: { Image: `https://img/${id}.webp`, Background: `https://bg/${id}.webp`, Mini: `https://mini/${id}.webp` },
    TicketsInfo: { Currency: 'PLN', Price: 120, ReducedPrice: null },
    Object: { Name: 'Klub Relax', Address: 'ul. Testowa 1', Code: '00-001', Location: { Long: '21.0', Lat: '52.2' } },
    Link: `https://www.kupbilecik.pl/imprezy/${id}/`,
  });
}

const today = todayWarsaw();
const d1 = today;
const d2 = addDaysWarsaw(today, 3);
const dOutside = addDaysWarsaw(today, 10);

async function scan(text: string, chunkSize = 1_000_000): Promise<Awaited<ReturnType<typeof scanKupEvents>>> {
  return scanKupEvents(streamOf(text, chunkSize));
}

test('scanKupEvents: buckets in-window days, drops out-of-window + trims heavy fields', async () => {
  const catalog = `{"events":[${ev(1, d1)},${ev(2, d2)},${ev(3, dOutside)}]}`;
  const { byDay, total } = await scan(catalog);
  assert.equal(total, 3);
  assert.equal(byDay.get(d1)?.length, 1);
  assert.equal(byDay.get(d2)?.length, 1);
  assert.ok(!byDay.has(dOutside));

  const e = byDay.get(d1)![0];
  assert.equal(e.Id, 1);
  assert.equal((e.Name as string).includes('Koncert'), true);
  assert.equal(e.Date, `${d1} 19:00:00`);
  assert.equal(e.Object?.Name, 'Klub Relax');
  assert.equal(e.Object?.Location?.Lat, '52.2');
  assert.equal(e.TicketsInfo?.Price, 120);
  assert.equal(e.Link, `https://www.kupbilecik.pl/imprezy/1/`);
  assert.deepEqual(Object.keys(e), ['Id', 'Name', 'Date', 'City', 'Category', 'Images', 'TicketsInfo', 'Object', 'Link']);
});

test('scanKupEvents: identical result under byte-by-byte chunking (boundaries)', async () => {
  const catalog = `{"events":[${ev(1, d1)},${ev(2, d2)},${ev(3, d2)}]}`;
  const whole = await scan(catalog, 1_000_000);
  const perByte = await scan(catalog, 1);
  const per7 = await scan(catalog, 7);
  for (const r of [perByte, per7]) {
    assert.deepEqual([...r.byDay.entries()], [...whole.byDay.entries()]);
    assert.equal(r.total, whole.total);
  }
});

test('scanKupEvents: rate-limit block body (HTTP 200 Polish text) → SourceBlockedError', async () => {
  const block = 'Usługa została zablokowana na 24h, ze względu na zbyt dużą częstotliwość odpytań!';
  await assert.rejects(scan(block), SourceBlockedError);
});

test('scanKupEvents: non-JSON start and empty catalog → SourceShapeError', async () => {
  await assert.rejects(scan('<html>error</html>'), SourceShapeError);
  await assert.rejects(scan('{"events":[]}'), (e: unknown) => {
    assert.ok(e instanceof SourceShapeError);
    assert.match((e as Error).message, /zero events/);
    return true;
  });
});

test('maybeGunzip: raw gzip body is decompressed before scanning', async () => {
  const catalog = `{"events":[${ev(1, d1)},${ev(2, d2)}]}`;
  const gz = gzipSync(Buffer.from(catalog, 'utf8'));
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new Uint8Array(gz)); c.close(); },
  });
  const { byDay, total } = await scanKupEvents(await maybeGunzip(stream));
  assert.equal(total, 2);
  assert.equal(byDay.get(d1)?.length, 1);
});