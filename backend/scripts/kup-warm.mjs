#!/usr/bin/env node
// kupbilecik warm: download the full official API catalog (all categories, all
// regions) once and push a per-day trimmed manifest for each seed-window day to R2
// via the Worker admin endpoint. Run from a network that can reach
// www.kupbilecik.pl (the Worker CAN reach it too, but the ~60 MB full dump must NOT
// be parsed on the Worker per batch day — hence the per-day split).
//
// Usage (from the repo root):
//   node backend/scripts/kup-warm.mjs [--days N]
// Reads BASE_URL / ADMIN_SECRET / KUPBILECIK_API_TOKEN from admin/vps/.env or env.
//
// The Worker cron still owns scheduling; this warm job only refreshes the manifest
// files when the catalog changes (or on first setup / backfill).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
const TOKEN = env.KUPBILECIK_API_TOKEN;
if (!TOKEN || !ADMIN_SECRET) {
  console.error('KUPBILECIK_API_TOKEN and ADMIN_SECRET required (admin/vps/.env or env)');
  process.exit(1);
}

const args = process.argv.slice(2);
const daysAhead = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) || 6 : 6;

const API_URL =
  `https://www.kupbilecik.pl/api/?k=teatr,muzyka,kabaret,standup,impro,sport,film,dzieci,festiwal,inne` +
  `&w=C,Z,P,N,T,S,G,B,O,D,L,F,K,R,E,W&t=json&v=1.0&p=631&token=${encodeURIComponent(TOKEN)}`;

function warsawDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function addDays(s, n) {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return warsawDate(d);
}

// Keep only what the provider needs — drops the heavy HTML Description/Artist text.
function trim(e) {
  const obj = e.Object || {};
  const cat = e.Category || {};
  const sc = cat.SubCategory || {};
  const img = e.Images || {};
  const ti = e.TicketsInfo || {};
  const loc = obj.Location || {};
  return {
    Id: e.Id,
    Name: e.Name,
    Date: e.Date,
    City: e.City,
    Category: { Type: cat.Type, SubCategory: { Type: sc.Type } },
    Images: { Image: img.Image, Mini: img.Mini },
    TicketsInfo: { Price: ti.Price ?? null },
    Object: {
      Name: obj.Name,
      Address: obj.Address,
      Code: obj.Code,
      Location: { Lat: loc.Lat ?? null, Long: loc.Long ?? null },
    },
    Link: e.Link,
  };
}

console.log('downloading kupbilecik catalog...');
const res = await fetch(API_URL, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(120_000) });
if (!res.ok) throw new Error(`kupbilecik api -> ${res.status}`);
const data = await res.json();
const events = Array.isArray(data.events) ? data.events : [];
console.log(`catalog events: ${events.length}`);

const today = warsawDate(new Date()); // "YYYY-MM-DD"
const window = Array.from({ length: daysAhead + 1 }, (_, i) => addDays(today, i));
const daysSet = new Set(window);

const byDay = new Map();
for (const e of events) {
  const day = (e.Date || '').slice(0, 10);
  if (!daysSet.has(day)) continue;
  const list = byDay.get(day);
  const t = trim(e);
  if (list) list.push(t);
  else byDay.set(day, [t]);
}

console.log(`window days: ${window.join(', ')}`);
let pushed = 0;
for (const day of window) {
  const list = byDay.get(day) || [];
  const r = await fetch(`${BASE_URL}/admin/seed/kupbilecik/day`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
    body: JSON.stringify({ day, events: list }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`push ${day} -> ${r.status} ${JSON.stringify(j)}`);
  console.log(`  ${day}: ${list.length} events -> ${j.ok ? 'ok' : j}`);
  pushed++;
}
console.log(`warm done: ${pushed}/${window.length} days pushed`);
