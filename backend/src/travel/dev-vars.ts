import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV_VARS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.dev.vars');

export function devVar(name: string): string {
  const raw = readFileSync(DEV_VARS, 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : '';
}
