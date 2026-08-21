// Template runtime: interpolate `{{{key}}}` raw slots from ui/templates/*.html
// (compiled by scripts/gen-templates.ts into templates.gen.ts, committed).
import { TEMPLATES } from './templates.gen';

export function tpl(name: string, slots: Record<string, string | number>): string {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`Unknown template: ${name}`);
  return t.replace(/\{\{\{(\w+)\}\}\}/g, (_m, k: string) => String(slots[k] ?? ''));
}
