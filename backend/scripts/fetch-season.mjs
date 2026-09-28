import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CITIES = join(__dirname, '..', 'src', 'travel', 'data', 'cities.json');
const NUTS_CACHE = join(__dirname, '..', 'dist', 'nuts2.geojson');
const OUT = join(__dirname, '..', 'dist', 'city-season.json');
const NUTS_URL = 'https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2021_4326.geojson';
const EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tour_occ_nin2m';
const POWER = 'https://power.larc.nasa.gov/api/temporal/monthly/point';
const YEARS = [2023, 2024];
const CONCURRENCY = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nutsGeo() {
  if (existsSync(NUTS_CACHE)) {
    const cached = JSON.parse(readFileSync(NUTS_CACHE, 'utf8'));
    if (cached.name?.includes('20M')) return cached;
  }
  const res = await fetch(NUTS_URL);
  const text = await res.text();
  mkdirSync(dirname(NUTS_CACHE), { recursive: true });
  writeFileSync(NUTS_CACHE, text);
  return JSON.parse(text);
}

function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inMulti(lng, lat, coordinates) {
  let inside = false;
  for (const polygon of coordinates) {
    for (const ring of polygon) {
      if (inRing(lng, lat, ring)) inside = !inside;
    }
  }
  return inside;
}

function stats(coordinates) {
  let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90, sumLng = 0, sumLat = 0, n = 0;
  for (const polygon of coordinates) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        sumLng += lng;
        sumLat += lat;
        n++;
      }
    }
  }
  return { bounds: { minLng, maxLng, minLat, maxLat }, center: { lng: sumLng / n, lat: sumLat / n } };
}

function distance(aLat, aLng, bLat, bLng) {
  const dLat = aLat - bLat;
  const dLng = (aLng - bLng) * Math.cos((aLat * Math.PI) / 180);
  return dLat * dLat + dLng * dLng;
}

const COUNTRY_ALIAS = { GR: 'EL', GB: 'UK' };

function regionFor(lat, lng, regions, prefix) {
  for (const region of regions) {
    if (!region.code.startsWith(prefix)) continue;
    const b = region.bounds;
    if (lng < b.minLng || lng > b.maxLng || lat < b.minLat || lat > b.maxLat) continue;
    const geom = region.geometry;
    const coords = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    if (inMulti(lng, lat, coords)) return region.code;
  }
  let best = null;
  let bestD = Infinity;
  for (const region of regions) {
    if (!region.code.startsWith(prefix)) continue;
    const d = distance(lat, lng, region.center.lat, region.center.lng);
    if (d < bestD) { bestD = d; best = region.code; }
  }
  return best;
}

async function eurostat(region) {
  const params = new URLSearchParams({ format: 'JSON', lang: 'EN', geo: region, c_resid: 'TOTAL', unit: 'NR', nace_r2: 'I551-I553' });
  for (const y of YEARS) params.append('time', String(y));
  const res = await fetch(`${EUROSTAT}?${params.toString()}`);
  const j = await res.json();
  const id = j.id ?? [];
  const size = j.size ?? [];
  const monthPos = id.indexOf('month');
  const monthIdx = j.dimension?.month?.category?.index ?? {};
  const byPos = {};
  for (const [k, v] of Object.entries(monthIdx)) byPos[v] = k;
  const sums = Array(13).fill(0);
  const counts = Array(13).fill(0);
  for (const key of Object.keys(j.value ?? {})) {
    let rem = Number(key);
    const coord = Array(id.length).fill(0);
    for (let d = id.length - 1; d >= 0; d--) {
      coord[d] = rem % size[d];
      rem = Math.floor(rem / size[d]);
    }
    const m = /^M(\d\d)$/.exec(byPos[coord[monthPos]] ?? '');
    if (!m) continue;
    const mi = Number(m[1]);
    const value = j.value[key];
    if (typeof value === 'number' && value > 0) {
      sums[mi] += value;
      counts[mi] += 1;
    }
  }
  const months = Array.from({ length: 12 }, (_, i) => (counts[i + 1] ? sums[i + 1] / counts[i + 1] : 0));
  return months.every((v) => v === 0) ? null : months;
}

async function climate(lat, lng) {
  const params = new URLSearchParams({
    parameters: 'T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN',
    community: 'RE',
    longitude: String(lng),
    latitude: String(lat),
    start: String(YEARS[0]),
    end: String(YEARS[YEARS.length - 1]),
    format: 'JSON',
  });
  const res = await fetch(`${POWER}?${params.toString()}`);
  const j = await res.json();
  const p = j.properties?.parameter ?? {};
  const temp = p.T2M ?? {};
  const precip = p.PRECTOTCORR ?? {};
  const sun = p.ALLSKY_SFC_SW_DWN ?? {};
  const sumT = Array(13).fill(0), sumP = Array(13).fill(0), sumS = Array(13).fill(0), n = Array(13).fill(0);
  for (const key of Object.keys(temp)) {
    const m = /^\d{4}(\d{2})$/.exec(key);
    if (!m) continue;
    const mi = Number(m[1]);
    if (mi < 1 || mi > 12) continue;
    sumT[mi] += temp[key] ?? 0;
    sumP[mi] += precip[key] ?? 0;
    sumS[mi] += sun[key] ?? 0;
    n[mi] += 1;
  }
  return Array.from({ length: 12 }, (_, i) => {
    const mi = i + 1;
    const d = n[mi] || 1;
    return { tempC: sumT[mi] / d, precipMm: sumP[mi] / d, sunKwh: sumS[mi] / d };
  });
}

function weatherCode(tempC, precipMm, sunKwh) {
  if (tempC <= 2) return 3;
  if (precipMm >= 3) return 2;
  if (sunKwh >= 4.5) return 0;
  return 1;
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.filter((a) => a.startsWith('--city=')).map((a) => a.slice(7));
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const all = JSON.parse(readFileSync(CITIES, 'utf8'));
  const selected = only.length ? all.filter((c) => only.includes(c.id)) : all;
  const cities = limitArg ? selected.slice(0, Number(limitArg.slice(8))) : selected;
  const geo = await nutsGeo();
  const regions = geo.features
    .filter((f) => f.properties?.LEVL_CODE === 2)
    .map((f) => {
      const coords = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const s = stats(coords);
      return { code: f.properties.NUTS_ID, geometry: f.geometry, bounds: s.bounds, center: s.center };
    });
  console.log(`NUTS2 regions: ${regions.length}`);

  let done = 0, skipped = 0;
  const result = {};
  await mapLimit(cities, CONCURRENCY, async (city) => {
    try {
      const prefix = COUNTRY_ALIAS[city.countryCode] ?? city.countryCode;
      const region = regionFor(city.lat, city.lng, regions, prefix);
      if (!region) { skipped++; return; }
      const months = await eurostat(region);
      if (!months) { skipped++; return; }
      const weather = await climate(city.lat, city.lng);
      const mean = months.reduce((a, b) => a + b, 0) / 12;
      result[city.id] = months.map((nights, i) => ({
        month: i + 1,
        nights: Math.round(nights),
        index: Number((nights / mean).toFixed(4)),
        tempC: Number(weather[i].tempC.toFixed(1)),
        precipMm: Number(weather[i].precipMm.toFixed(2)),
        sun: Number(weather[i].sunKwh.toFixed(2)),
        weather: weatherCode(weather[i].tempC, weather[i].precipMm, weather[i].sunKwh),
      }));
      done++;
      if (done % 20 === 0) console.log(`  ${done} cities done`);
      await sleep(50);
    } catch (e) {
      skipped++;
      console.warn(`  skip ${city.id}: ${e.message}`);
    }
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generatedAt: Date.now(), cities: result }));
  console.log(`done: ${done} cities, skipped ${skipped}, wrote ${OUT}`);
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
