#!/usr/bin/env node
// MTP (Targi Poznańskie) annual calendar backfill — ONE-TIME manual run from the
// mac (no scheduler). Downloads the MTP calendar for a year, keeps only Poznań
// events, resolves each fair's own website (mtp-link.pl/<slug> redirect), expands
// multi-day fairs into one post per day and pushes the batch to the Worker
// (POST /admin/seed/mtp). Geo is fixed to the MTP complex; every day starts 10:00.
//
// Usage (from the repo root):
//   node backend/scripts/mtp-backfill.mjs [--year 2026]
// Reads BASE_URL / ADMIN_SECRET from admin/vps/.env or env.
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_FILE = join(ROOT, 'admin', 'vps', '.env');

function loadEnv() {
  const out = {};
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return { ...process.env, ...out };
}

const env = loadEnv();
const BASE_URL = env.BASE_URL || 'https://api.panperyskop.app';
const ADMIN_SECRET = env.ADMIN_SECRET;
if (!ADMIN_SECRET) { console.error('ADMIN_SECRET required (admin/vps/.env)'); process.exit(1); }

const args = process.argv.slice(2);
const year = args.includes('--year') ? String(Number(args[args.indexOf('--year') + 1]) || 2026) : '2026';

const MONTHS = { stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6, lipca: 7, sierpnia: 8, września: 9, października: 10, listopada: 11, grudnia: 12 };
const decode = (s) => s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const pad = (d) => String(d).padStart(2, '0');

async function fetchCalendar(skip, take = 100) {
  const res = await fetch(
    `https://www.mtp.pl/umbraco/surface/mtpcalendar/getevents?lang=pl&node_id=1485&take=${take}&skip=${skip}`,
    {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:154.0) Gecko/20100101 Firefox/154.0',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.mtp.pl/pl/kalendarium/',
        'Content-Type': 'application/json;charset=utf-8',
        Origin: 'https://www.mtp.pl',
      },
      body: JSON.stringify({ months: [], categories: [], year }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok) throw new Error(`calendar -> ${res.status}`);
  return res.text();
}

/** Parse one <a class="events__event"> card into {title, slug, city, days, months, cat, img, href}. */
function parseCard(card) {
  const href = /href=(\S+?)\s+class="events__event/.exec(card);
  const slug = href ? href[1].split('/').filter(Boolean).pop() : null;
  const title = /events__title[^>]*>\s*([^<]+?)\s*</.exec(card);
  const city = /events__city[^>]*>\s*([^<]+?)\s*</.exec(card);
  const cat = /events__cat[^>]*>\s*([^<]+?)\s*</.exec(card);
  const img = /background-image:url\((.*?)\)/.exec(card);
  const days = [...card.matchAll(/events__day">(\d+)<\/span>/g)].map((m) => Number(m[1]));
  const months = [...card.matchAll(/events__month[^>]*>\s*([a-ząęłńóśźż]+)\s*</g)].map((m) => MONTHS[m[1]]);
  if (!slug || !title) return null;
  return {
    slug,
    title: decode(title[1].trim()),
    city: city ? decode(city[1].trim()) : '',
    cat: cat ? decode(cat[1].trim()) : '',
    img: img ? 'https:' + img[1] : '',
    href: href ? href[1] : null,
    days,
    months,
  };
}

async function resolveLink(href) {
  if (!href) return null;
  if (!href.startsWith('http')) href = 'https:' + href;
  try {
    const res = await fetch(href, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    return res.url || href;
  } catch {
    return href;
  }
}

const imgCache = new Map();
async function imageB64(url) {
  if (!url) return undefined;
  if (imgCache.has(url)) return imgCache.get(url);
  const tmp = mkdtempSync(join(tmpdir(), 'mtp-img-'));
  const raw = join(tmp, 'raw');
  const out = join(tmp, 'out.jpg');
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`img ${res.status}`);
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
    // Always convert to JPEG — some fair posters are AVIF, which the Worker's
    // media sniffer (jpeg/png/webp/heic) rejects. sips is macOS-native.
    execFileSync('sips', ['-s', 'format', 'jpeg', raw, '--out', out], { stdio: 'ignore' });
    const b64 = readFileSync(out).toString('base64');
    imgCache.set(url, b64);
    return b64;
  } catch (e) {
    console.warn(`img fail ${url}: ${e.message} — Worker will retry`);
    imgCache.set(url, undefined);
    return undefined;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const cards = [];
  for (let skip = 0; ; skip += 100) {
    const html = await fetchCalendar(skip);
    const pageCards = [...html.matchAll(/<a href=(\S+?)\s+class="events__event[\s\S]*?<\/a>/g)].map((m) => parseCard(m[0])).filter(Boolean);
    cards.push(...pageCards);
    if (pageCards.length < 100) break;
  }
  // Dedupe by slug.
  const seen = new Set();
  const events = cards.filter((c) => (seen.has(c.slug) ? false : (seen.add(c.slug), true)));
  const poznan = events.filter((e) => e.city.toLowerCase().includes('pozna'));
  console.log(`calendar: ${events.length} events, Poznań: ${poznan.length}`);

  const batch = [];
  let skipped = 0;
  for (const e of poznan) {
    const link = (await resolveLink(e.href)) || e.href || `https://mtp-link.pl/${e.slug}`;
    const startD = e.days[0];
    const startM = e.months[0];
    const endD = e.days[e.days.length - 1];
    const endM = e.months[e.months.length - 1];
    if (!startD || !startM || !endD || !endM) { skipped++; continue; }
    const imageData = await imageB64(e.img);
    let sy = Number(year);
    let ey = Number(year);
    if (endM < startM || (endM === startM && endD < startD)) ey = sy + 1; // range crosses into next year
    const start = new Date(Date.UTC(sy, startM - 1, startD));
    const end = new Date(Date.UTC(ey, endM - 1, endD));
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      batch.push({
        externalId: `mtp-${e.slug}-${day.replace(/-/g, '')}`,
        title: e.title,
        day,
        link,
        imageUrl: e.img,
        imageData,
        venue: 'Międzynarodowe Targi Poznańskie',
        address: 'ul. Głogowska 14, 60-734 Poznań',
        city: 'Poznań',
      });
    }
  }
  console.log(`posts to ingest: ${batch.length} (skipped ${skipped} unparsed)`);
  if (args.includes('--dry')) {
    console.log('DRY — first 5 posts:', JSON.stringify(batch.slice(0, 5), null, 2));
    return;
  }

  const CHUNK = 10;
  const totals = {};
  for (let i = 0; i < batch.length; i += CHUNK) {
    const chunk = batch.slice(i, i + CHUNK);
    const res = await fetch(`${BASE_URL}/admin/seed/mtp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(300_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.error(`push chunk ${i / CHUNK} -> ${res.status}`, data); process.exit(1); }
    for (const r of data.results || []) totals[r.status] = (totals[r.status] || 0) + 1;
    const dup = (data.results || []).filter((r) => r.status === 'duplicate').length;
    console.log(`chunk ${i / CHUNK + 1}/${Math.ceil(batch.length / CHUNK)}: ok=${(data.results || []).filter((r) => r.status === 'ok').length} dup=${dup} err=${(data.results || []).filter((r) => r.status !== 'ok' && r.status !== 'duplicate').length}`);
  }
  console.log(`push done: ${JSON.stringify(totals)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });