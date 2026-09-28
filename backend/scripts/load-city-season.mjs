import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argOf = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const INPUT = argOf('in') ?? join(__dirname, '..', 'dist', 'city-season.json');
const REMOTE = args.includes('--remote');
const CHUNK = 400;

const payload = JSON.parse(readFileSync(INPUT, 'utf8'));

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

const statements = ['DELETE FROM city_season;'];
for (const [cityId, months] of Object.entries(payload.cities)) {
  for (const m of months) {
    statements.push(
      `INSERT OR REPLACE INTO city_season ` +
      `(city_id, month, nights, idx, temp_c, precip_mm, sun, weather) ` +
      `VALUES ('${sqlEscape(cityId)}', ${m.month}, ${m.nights}, ${m.index}, ${m.tempC}, ${m.precipMm}, ${m.sun}, ${m.weather});`
    );
  }
}

console.log(`${statements.length} rows from ${Object.keys(payload.cities).length} cities`);
for (let i = 0; i < statements.length; i += CHUNK) {
  const command = statements.slice(i, i + CHUNK).join('\n');
  const flags = ['wrangler', 'd1', 'execute', 'panperyskop-db', '--config', 'wrangler.toml', '--command', command];
  if (REMOTE) flags.push('--remote');
  console.log(`chunk ${i / CHUNK + 1}`);
  execFileSync('npx', flags, { cwd: join(__dirname, '..'), stdio: 'inherit' });
}
console.log('done');
