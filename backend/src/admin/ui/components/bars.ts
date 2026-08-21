import { esc } from '../../utils/esc';
import { tpl } from '../templates';

// Simple inline bar chart from { label, value } series (CSS widths).
export function bars(data: { label: string; value: number }[]): string {
  const max = Math.max(1, ...data.map((d) => d.value));
  return data.map((d) => {
    const w = max > 0 ? Math.max(0.5, (d.value / max) * 100) : 0;
    return tpl('bars', { label: esc(d.label), width: w.toFixed(1), value: String(d.value) });
  }).join('');
}
