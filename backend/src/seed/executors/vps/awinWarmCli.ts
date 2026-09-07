#!/usr/bin/env node
// Standalone Eventim (Awin) feed warm — BUILT as backend/dist/awin-warm.mjs.
// Downloads the slim 14-column Awin datafeed (advertiser 19044 / feed 99885),
// gated by the feed's Last Imported timestamp, parses CSV → JSON and pushes the
// event rows to the Worker (POST /admin/seed/awin/feed → R2 seed/awin-eventim.json).
// Runs 00:03 Warsaw (root crontab, see setup-vps.sh) with a clean env — no proxy;
// the feed key is read from admin/vps/.env (AWIN_FEED_KEY). A failure aborts with
// nothing pushed; the morning seed batch then throws "eventim feed missing" →
// failed-mail alarm (same loud pattern as kupbilecik).
import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const FEED_ID = process.env.AWIN_FEED_ID || '99885';
const COLUMNS =
  'aw_deep_link,aw_product_id,aw_image_url,merchant_deep_link,Tickets%3Aevent_name,Tickets%3Aevent_date,' +
  'Tickets%3Avenue_name,Tickets%3Avenue_address,Tickets%3Alatitude,Tickets%3Alongitude,Tickets%3Agenre,' +
  'Tickets%3Amin_price,Tickets%3Amax_price,custom_1';

// Repo root — works from BOTH the TS source and the pre-built bundle (dist/awin-warm.mjs).
function findRepoDir(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'backend')) && existsSync(join(dir, 'admin'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return '/opt/panperyskop';
}
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = findRepoDir(__dirname);
const ENV_FILE = join(ROOT, 'admin', 'vps', '.env');
const STATE = join(ROOT, 'admin', 'vps', 'logs', 'awin-feed.state');

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function readState(): { lastImported: string } | null {
  if (!existsSync(STATE)) return null;
  try {
    return JSON.parse(readFileSync(STATE, 'utf8')) as { lastImported: string };
  } catch {
    return null;
  }
}
function writeState(s: { lastImported: string }): void {
  const tmp = STATE + '.tmp';
  writeFileSync(tmp, JSON.stringify(s));
  renameSync(tmp, STATE);
}

/** Quote-aware CSV → array of objects (first row = header). Handles quoted commas,
 *  escaped quotes and CRLF — slim enough for the feed's 14 columns. */
function csvToObjects(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { cur.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.some((f) => f.trim() !== '')) rows.push(cur);
      cur = [];
    } else field += ch;
  }
  if (field !== '' || cur.length) {
    cur.push(field);
    if (cur.some((f) => f.trim() !== '')) rows.push(cur);
  }
  const header = rows[0] || [];
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => { if (h) o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

const log = (msg: string): void => console.log(`[${new Date().toISOString()}] ${msg}`);

async function main(): Promise<void> {
  const env = loadEnv();
  const key = env.AWIN_FEED_KEY;
  const secret = env.ADMIN_SECRET;
  const base = env.BASE_URL || 'https://api.panperyskop.app';
  if (!key || !secret) {
    log('AWIN_FEED_KEY / ADMIN_SECRET missing — abort');
    process.exitCode = 1;
    return;
  }
  // Seed cadence: only push on seed (full-window refill) days. On a check failure
  // default to RUN — a broken gate must not silently freeze the feed.
  try {
    const cad = (await (await fetch(`${base}/admin/seed/cadence`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20_000),
    })).json().catch(() => ({}))) as { due?: boolean; lastSeedDay?: string | null };
    if (cad.due === false) {
      log(`not a seed day (last ${cad.lastSeedDay ?? 'never'}) — skip`);
      return;
    }
  } catch (e) {
    log(`cadence check failed (${(e as Error).message}) — proceeding`);
  }
  try {
    // 1. Gate on the feed's Last Imported timestamp (avoid pointless re-downloads).
    const listRes = await fetch(`https://productdata.awin.com/datafeed/list/apikey/${encodeURIComponent(key)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!listRes.ok) throw new Error(`feed list -> ${listRes.status}`);
    const list = csvToObjects(await listRes.text());
    const row = list.find((r) => (r['Feed ID'] || '').trim() === FEED_ID);
    if (!row) throw new Error(`feed ${FEED_ID} not in list`);
    const lastImported = (row['Last Imported'] || '').trim();
    const state = readState();
    if (state && state.lastImported === lastImported) {
      log(`feed unchanged (${lastImported}) — skip`);
      return;
    }

    // 2. Download the slim feed (gzip CSV).
    const dlUrl =
      `https://productdata.awin.com/datafeed/download/apikey/${encodeURIComponent(key)}` +
      `/language/pl/fid/${FEED_ID}/rid/0/hasEnhancedFeeds/0/columns/${COLUMNS}/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/`;
    const dl = await fetch(dlUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(120_000) });
    if (!dl.ok) throw new Error(`feed download -> ${dl.status}`);
    const buf = new Uint8Array(await dl.arrayBuffer());
    const gz = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
    const text = gz ? gunzipSync(buf).toString('utf8') : new TextDecoder().decode(buf);
    const events = csvToObjects(text);

    // 3. Push to the Worker → R2.
    const res = await fetch(`${base}/admin/seed/awin/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(events),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`push -> ${res.status}`);
    writeState({ lastImported });
    log(`done: ${events.length} events (last imported ${lastImported})`);
  } catch (e) {
    log(`FAILED: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});